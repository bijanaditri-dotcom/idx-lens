"""One-shot Yahoo chart -> existing IDX Lens MySQL tables.

Replacement for collector/sync_yahoo.py; keeps the existing .env and schema.
Uses the same public HTTPS chart path verified on the user's Windows computer.
An HTTP success is not a guarantee of real-time or complete exchange data.
Only quotes/bars are collected here; fundamentals/news/foreign flow are separate.

Run: python sync_yahoo.py --ticker BBCA.JK   # one-symbol check
     python sync_yahoo.py                  # active database catalogue
Requires: mysql-connector-python and python-dotenv (already in requirements).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from http.client import IncompleteRead
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

LOG = logging.getLogger('idx-lens-sync')
SOURCE = 'Yahoo Finance chart (HTTP)'
JAKARTA = timezone(timedelta(hours=7))
MAX_BODY = 8 * 1024 * 1024
LOCK_NAME = 'idx_lens_yahoo_sync'
INTERVALS = {'1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '1wk', '1mo'}
PERIODS = {'1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'}
INTRADAY = {'1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'}


class DataError(RuntimeError):
    pass


class RateLimited(DataError):
    pass


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def dec(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
        return number if number.is_finite() else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def price(value: Any) -> Decimal | None:
    number = dec(value)
    return number if number is not None and number > 0 else None


def volume(value: Any) -> int | None:
    number = dec(value)
    if number is None or number < 0 or number != number.to_integral_value():
        return None
    return int(number)


def source_time(value: Any) -> datetime | None:
    number = dec(value)
    if number is None or number <= 0:
        return None
    try:
        return datetime.fromtimestamp(float(number), timezone.utc).replace(tzinfo=None, microsecond=0)
    except (OverflowError, OSError, ValueError):
        return None


def session_date(stamp: datetime):
    return stamp.replace(tzinfo=timezone.utc).astimezone(JAKARTA).date()


def symbol(value: str) -> str:
    value = value.strip().upper()
    if not re.fullmatch(r'[A-Z]{4}\.JK', value) and value != '^JKSE':
        raise ValueError('Use an IDX Yahoo symbol such as BBCA.JK: ' + value)
    return value


def load_environment():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name('.env'))


def db_connect():
    load_environment()
    import mysql.connector
    required = ('MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE')
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError('Missing environment variables: ' + ', '.join(missing))
    return mysql.connector.connect(
        host=os.environ['MYSQL_HOST'], port=int(os.getenv('MYSQL_PORT', '3306')),
        user=os.environ['MYSQL_USER'], password=os.environ['MYSQL_PASSWORD'],
        database=os.environ['MYSQL_DATABASE'], connection_timeout=10, autocommit=False,
    )


@dataclass(frozen=True)
class Bar:
    stamp: datetime
    open: Decimal | None
    high: Decimal | None
    low: Decimal | None
    close: Decimal
    adjusted: Decimal | None
    volume: int | None


@dataclass(frozen=True)
class Snapshot:
    ticker: str
    company: str
    price: Decimal
    previous_close: Decimal | None
    open: Decimal | None
    high: Decimal | None
    low: Decimal | None
    volume: int | None
    currency: str | None
    observed: datetime
    fetched: datetime
    bars: tuple[Bar, ...]


def parse_chart(payload: dict, ticker: str, interval: str, period: str,
                fetched: datetime) -> Snapshot:
    chart = payload.get('chart') if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise DataError('Invalid Yahoo chart response')
    if chart.get('error'):
        raise DataError('Yahoo error: ' + str(chart['error'])[:400])
    results = chart.get('result')
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        raise DataError('Yahoo returned no chart result')
    result = results[0]
    meta = result.get('meta') or {}
    if str(meta.get('symbol', '')).upper() != ticker:
        raise DataError('Yahoo returned a different or missing ticker')
    timestamps = result.get('timestamp') or []
    indicators = result.get('indicators') or {}
    quote_arrays = indicators.get('quote') or []
    if not timestamps or not quote_arrays:
        raise DataError('Yahoo returned no price bars')
    columns = quote_arrays[0]
    adjusted = (indicators.get('adjclose') or [{}])[0].get('adjclose') or []

    def cell(name, index):
        values = columns.get(name) or []
        return values[index] if index < len(values) else None

    unique = {}
    for index, raw_time in enumerate(timestamps):
        stamp, close = source_time(raw_time), price(cell('close', index))
        if stamp is None or close is None:
            continue
        unique[stamp] = Bar(
            stamp, price(cell('open', index)), price(cell('high', index)),
            price(cell('low', index)), close,
            price(adjusted[index]) if index < len(adjusted) else None,
            volume(cell('volume', index)),
        )
    bars = tuple(unique[key] for key in sorted(unique))
    if not bars:
        raise DataError('Yahoo returned no valid nonzero close prices')
    latest = bars[-1]
    observed, latest_price = latest.stamp, latest.close
    meta_time, meta_price = source_time(meta.get('regularMarketTime')), price(meta.get('regularMarketPrice'))
    if meta_time is not None and meta_price is not None and meta_time >= observed:
        observed, latest_price = meta_time, meta_price

    # Day statistics come from source metadata, or matching-session bars only.
    same_day = [bar for bar in bars if session_date(bar.stamp) == session_date(observed)]
    meta_matches = meta_time is not None and session_date(meta_time) == session_date(observed)
    daily_open = price(meta.get('regularMarketOpen')) if meta_matches else None
    daily_high = price(meta.get('regularMarketDayHigh')) if meta_matches else None
    daily_low = price(meta.get('regularMarketDayLow')) if meta_matches else None
    daily_volume = volume(meta.get('regularMarketVolume')) if meta_matches else None
    if same_day and interval in INTRADAY | {'1d'}:
        daily_open = daily_open or same_day[0].open
        highs = [bar.high for bar in same_day if bar.high is not None]
        lows = [bar.low for bar in same_day if bar.low is not None]
        if highs:
            daily_high = max(highs + ([daily_high] if daily_high is not None else []))
        if lows:
            daily_low = min(lows + ([daily_low] if daily_low is not None else []))
        if daily_volume is None and all(bar.volume is not None for bar in same_day):
            daily_volume = sum(bar.volume for bar in same_day)

    previous = None
    if meta_matches:
        previous = price(meta.get('previousClose')) or price(meta.get('regularMarketPreviousClose'))
        if previous is None and period == '1d':
            previous = price(meta.get('chartPreviousClose'))
    if previous is None and interval in INTRADAY | {'1d'}:
        earlier = [bar for bar in bars if session_date(bar.stamp) < session_date(observed)]
        if earlier:
            previous = earlier[-1].close
    currency = str(meta['currency'])[:8] if meta.get('currency') else None
    company = str(meta.get('longName') or meta.get('shortName') or ticker)[:255]
    return Snapshot(ticker, company, latest_price, previous, daily_open, daily_high,
                    daily_low, daily_volume, currency, observed, fetched, bars)


def fetch_chart(ticker: str, interval: str, period: str, *, opener=None, sleeper=None) -> Snapshot:
    ticker = symbol(ticker)
    if interval not in INTERVALS or period not in PERIODS:
        raise ValueError('Unsupported Yahoo interval or period')
    opener, sleeper = opener or urlopen, sleeper or time.sleep
    timeout = max(5, min(float(os.getenv('YAHOO_HTTP_TIMEOUT', '20')), 60))
    attempts = max(1, min(int(os.getenv('YAHOO_RETRIES', '3')), 5))
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + quote(ticker, safe='')
    url += '?' + urlencode({'interval': interval, 'range': period})
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    for attempt in range(attempts):
        try:
            with opener(request, timeout=timeout) as response:
                raw = response.read(MAX_BODY + 1)
                if len(raw) > MAX_BODY:
                    raise DataError('Yahoo response exceeds size limit')
                payload = json.loads(raw)
            return parse_chart(payload, ticker, interval, period, utcnow_naive())
        except HTTPError as exc:
            code = exc.code
            retry_after = exc.headers.get('Retry-After', 'not supplied') if exc.headers else 'not supplied'
            exc.close()
            if code == 429:
                raise RateLimited('Yahoo HTTP 429; stop this run. Retry-After: ' + retry_after) from exc
            if code not in {408, 500, 502, 503, 504}:
                raise DataError('Yahoo HTTP ' + str(code)) from exc
            problem = 'Yahoo HTTP ' + str(code)
        except (URLError, TimeoutError, OSError, IncompleteRead, json.JSONDecodeError) as exc:
            problem = type(exc).__name__ + ': ' + str(exc)[:300]
        if attempt + 1 < attempts:
            delay = min(2 ** (attempt + 1), 30)
            LOG.warning('%s attempt %d/%d: %s; retry in %ss', ticker, attempt + 1,
                        attempts, problem, delay)
            sleeper(delay)
    raise DataError('Yahoo fetch failed after ' + str(attempts) + ' attempts: ' + problem)


# MySQL >= 8.0.19 row aliases; the user's MySQL 8.0.46 supports these.
# Keep market_time LAST: other assignments compare the existing observation first.
_guard = '''(latest_quotes.market_time IS NULL OR
 incoming.market_time > latest_quotes.market_time OR
 (incoming.market_time = latest_quotes.market_time AND
  incoming.fetched_at >= latest_quotes.fetched_at))'''
_quote_columns = ('price', 'previous_close', 'open_price', 'day_high', 'day_low',
                  'volume', 'currency', 'source', 'status')
QUOTE_SQL = '''INSERT INTO latest_quotes
 (ticker,price,previous_close,open_price,day_high,day_low,volume,currency,market_time,fetched_at,source,status)
 VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) AS incoming
 ON DUPLICATE KEY UPDATE ''' + ',\n'.join(
    f'{column}=IF({_guard},incoming.{column},latest_quotes.{column})' for column in _quote_columns
) + f''',
 fetched_at=IF({_guard},GREATEST(latest_quotes.fetched_at,incoming.fetched_at),latest_quotes.fetched_at),
 market_time=IF({_guard},incoming.market_time,latest_quotes.market_time)'''
_bar_columns = ('open_price', 'high_price', 'low_price', 'close_price', 'adj_close', 'volume', 'source')
BAR_SQL = '''INSERT INTO price_bars
 (ticker,interval_code,bar_time,open_price,high_price,low_price,close_price,adj_close,volume,source,ingested_at)
 VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) AS incoming
 ON DUPLICATE KEY UPDATE ''' + ',\n'.join(
    f'{column}=IF(incoming.ingested_at>=price_bars.ingested_at,incoming.{column},price_bars.{column})'
    for column in _bar_columns
) + ',ingested_at=GREATEST(price_bars.ingested_at,incoming.ingested_at)'


def store_snapshot(cur, snapshot: Snapshot, interval: str) -> tuple[int, str]:
    s = snapshot
    cur.execute('''INSERT INTO tickers(ticker,company_name) VALUES(%s,%s) AS incoming
      ON DUPLICATE KEY UPDATE ticker=incoming.ticker''', (s.ticker, s.company))
    cur.execute(QUOTE_SQL, (s.ticker, s.price, s.previous_close, s.open, s.high, s.low,
                          s.volume, s.currency, s.observed, s.fetched, SOURCE, 'ok'))
    records = [(s.ticker, interval, b.stamp, b.open, b.high, b.low, b.close,
                b.adjusted, b.volume, SOURCE, s.fetched) for b in s.bars]
    cur.executemany(BAR_SQL, records)
    cur.execute('SELECT price,market_time,fetched_at FROM latest_quotes WHERE ticker=%s', (s.ticker,))
    stored = cur.fetchone()
    if not stored:
        raise RuntimeError('Quote readback failed')
    return len(records), f'stored_price={stored[0]}, source_time_utc={stored[1]}, fetched_at_utc={stored[2]}'


def sync_symbol(cur, ticker: str, now: datetime, interval: str, period: str):
    # now is retained for compatibility; fetched_at is captured AFTER the response.
    return store_snapshot(cur, fetch_chart(ticker, interval, period), interval)


def load_tickers(cur) -> list[str]:
    configured = [part for part in os.getenv('TICKERS', '').split(',') if part.strip()]
    if not configured:
        cur.execute('SELECT ticker FROM tickers WHERE is_active=TRUE ORDER BY ticker')
        configured = [row[0] for row in cur.fetchall()]
    return list(dict.fromkeys(symbol(value) for value in configured))


def log_job(cur, ticker, status, count, message, started, finished):
    cur.execute('''INSERT INTO sync_logs
      (job_name,ticker,status,records_written,message,started_at,finished_at)
      VALUES('yahoo_sync',%s,%s,%s,%s,%s,%s)''',
      (ticker, status, count, str(message)[:1000], started, finished))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ticker', action='append', help='Test one ticker, e.g. BBCA.JK; repeatable')
    args = parser.parse_args(argv)
    load_environment()
    logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'),
                        format='%(asctime)s %(levelname)s %(message)s')
    interval, period = os.getenv('YAHOO_INTERVAL', '1m'), os.getenv('YAHOO_PERIOD', '1d')
    if interval not in INTERVALS or period not in PERIODS:
        LOG.error('Unsupported YAHOO_INTERVAL or YAHOO_PERIOD')
        return 2
    try:
        pause = max(0.25, min(float(os.getenv('SYMBOL_PAUSE_SECONDS', '1')), 60))
        conn = db_connect()
    except Exception as exc:
        LOG.error('Database/configuration error: %s', exc)
        return 2
    cur, locked = conn.cursor(), False
    ok = failed = completed = 0
    try:
        cur.execute('SELECT GET_LOCK(%s,0)', (LOCK_NAME,))
        locked = cur.fetchone()[0] == 1
        if not locked:
            LOG.error('Another collector is running; this run was skipped')
            return 3
        tickers = list(dict.fromkeys(symbol(value) for value in args.ticker)) if args.ticker else load_tickers(cur)
        conn.commit()  # No transaction is held while awaiting Yahoo.
        if not tickers:
            LOG.error('No active tickers configured')
            return 2
        LOG.info('Starting sync for %d symbols; interval=%s period=%s; source=%s',
                 len(tickers), interval, period, SOURCE)
        for index, ticker in enumerate(tickers):
            started = utcnow_naive()
            stop = False
            try:
                count, message = sync_symbol(cur, ticker, started, interval, period)
                log_job(cur, ticker, 'ok', count, message, started, utcnow_naive())
                conn.commit()
                ok += 1
                LOG.info('%s OK: %s (%d bars)', ticker, message, count)
            except Exception as exc:
                conn.rollback()
                failed += 1
                try:
                    log_job(cur, ticker, 'error', 0, exc, started, utcnow_naive())
                    conn.commit()
                except Exception:
                    conn.rollback()
                    LOG.error('Could not persist the failed sync log')
                LOG.error('%s failed: %s', ticker, exc)
                stop = isinstance(exc, RateLimited)
            completed += 1
            if stop:
                break
            if index + 1 < len(tickers):
                time.sleep(pause)
        LOG.info('Sync completed: succeeded=%d failed=%d skipped=%d', ok, failed, len(tickers) - completed)
        return 0 if failed == 0 else 1
    finally:
        if locked:
            try:
                cur.execute('SELECT RELEASE_LOCK(%s)', (LOCK_NAME,))
                cur.fetchone()
            except Exception:
                pass
        cur.close()
        conn.close()


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        LOG.warning('Sync interrupted by user')
        raise SystemExit(130)
