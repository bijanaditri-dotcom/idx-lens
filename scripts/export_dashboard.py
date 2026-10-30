"""Export whitelisted observations from the private local API for the public dashboard."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import re
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8000"
WIB = timezone(timedelta(hours=7))
MAX_BODY = 8 * 1024 * 1024


class ExportError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def stamp(value):
    if not isinstance(value, str):
        raise ExportError("An API observation has no UTC timestamp.")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError()
        return result.astimezone(timezone.utc)
    except ValueError:
        raise ExportError("An API observation has an invalid timestamp.") from None


def iso(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def positive(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def request_json(path, token):
    request = Request(BASE + path, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(MAX_BODY + 1)
        if len(raw) > MAX_BODY:
            raise ExportError("API response exceeded the export size limit.")
        return json.loads(raw)
    except HTTPError as exc:
        code = exc.code
        exc.close()
        raise ExportError("Local API returned HTTP " + str(code) + ". Check the API and its private configuration.") from None
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise ExportError("Cannot read the local API. Keep Uvicorn running on 127.0.0.1:8000.") from None


def observation(row, now):
    if not isinstance(row, dict) or not positive(row.get("price")):
        raise ExportError("An API quote has no valid positive price.")
    if row.get("ticker") != "^JKSE" and row.get("currency") != "IDR":
        raise ExportError("Only explicitly IDR-denominated quotes can be exported.")
    observed, fetched = stamp(row.get("market_time")), stamp(row.get("fetched_at"))
    grace = timedelta(minutes=5)
    if observed > fetched + grace or observed > now + grace or fetched > now + grace:
        raise ExportError("An API quote has inconsistent or future timestamps.")
    return {
        "price": row["price"],
        "previousClose": row.get("previous_close") if positive(row.get("previous_close")) else None,
        "currency": row.get("currency") if isinstance(row.get("currency"), str) else None,
        "marketTime": iso(observed), "fetchedAt": iso(fetched),
        "source": str(row.get("source") or "Local API observation")[:160],
    }


def daily_bars(rows, ticker, now):
    if not isinstance(rows, list):
        raise ExportError("The API returned an invalid daily-bar list.")
    result, seen, omitted = [], set(), 0
    for row in rows:
        if not isinstance(row, dict) or row.get("ticker") != ticker or row.get("interval_code") != "1d":
            raise ExportError("Daily history contains a different ticker or interval.")
        observed = stamp(row.get("bar_time"))
        if observed > now + timedelta(minutes=5):
            raise ExportError("Daily history contains a future observation.")
        values = [row.get(key) for key in ("open_price", "high_price", "low_price", "close_price")]
        volume = row.get("volume")
        if (not all(positive(v) for v in values) or isinstance(volume, bool)
                or not isinstance(volume, (int, float)) or not math.isfinite(volume)
                or volume < 0 or int(volume) != volume):
            omitted += 1
            continue
        opening, high, low, close = values
        if low > min(opening, close) or high < max(opening, close) or high < low:
            omitted += 1
            continue
        day = observed.astimezone(WIB).date().isoformat()
        if day in seen:
            raise ExportError("Daily history contains duplicate trading dates.")
        seen.add(day)
        result.append({"time": day, "open": opening, "high": high, "low": low, "close": close, "volume": int(volume)})
    return sorted(result, key=lambda bar: bar["time"]), omitted


def collect(token, *, read=request_json, now=None, max_age_seconds=900):
    now = now or datetime.now(timezone.utc)
    health = read("/health", token)
    if not isinstance(health, dict) or health.get("database") != "connected" or health.get("status") != "ok":
        raise ExportError("The API did not confirm a connected database.")
    quotes = read("/v1/quotes?limit=2000", token)
    if not isinstance(quotes, list) or not quotes or len(quotes) > 50:
        raise ExportError("Export requires between 1 and 50 stored quotes.")
    records, seen, index_row = [], set(), None
    for row in quotes:
        ticker = row.get("ticker") if isinstance(row, dict) else None
        if not isinstance(ticker, str) or not (re.fullmatch(r"[A-Z]{4}\.JK", ticker) or ticker == "^JKSE"):
            raise ExportError("An API quote has an unsupported ticker.")
        if ticker in seen:
            raise ExportError("The API returned duplicate quote tickers.")
        seen.add(ticker)
        if ticker == "^JKSE":
            index_row = row
        else:
            records.append(row)
    if not records:
        raise ExportError("No stock quotes are available to export.")
    if index_row is None:
        index_quotes = read("/v1/quotes?" + urlencode({"ticker": "^JKSE"}), token)
        if not isinstance(index_quotes, list) or len(index_quotes) > 1:
            raise ExportError("The API returned an invalid IHSG quote response.")
        if index_quotes:
            index_row = index_quotes[0]
            if not isinstance(index_row, dict) or index_row.get("ticker") != "^JKSE":
                raise ExportError("The API returned a different index ticker.")

    def instrument(row):
        ticker = row["ticker"]
        quote = observation(row, now)
        bars, omitted = daily_bars(read("/v1/bars?" + urlencode({"ticker": ticker, "interval": "1d", "limit": 600}), token), ticker, now)
        return {"ticker": ticker, "name": str(row.get("company_name") or ticker)[:255],
                "quote": quote, "dailyBars": bars, "omittedDailyBars": omitted}

    return {"schemaVersion": 1, "exportedAt": iso(now), "quoteMaxAgeSeconds": max_age_seconds,
            "stocks": [instrument(row) for row in sorted(records, key=lambda item: item["ticker"])],
            "index": instrument(index_row) if index_row else None}


def write_snapshot(path, payload):
    # Serialize before touching the previous snapshot, then replace atomically.
    raw = (json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".market-export-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-age-minutes", type=int, default=15)
    args = parser.parse_args()
    if not 1 <= args.max_age_minutes <= 10080:
        parser.error("--max-age-minutes must be between 1 and 10080")
    config = dotenv_values(ROOT / "api" / ".env", encoding="utf-8-sig")
    token = config.get("API_BEARER_TOKEN")
    if not token or token.startswith("replace_"):
        print("FAIL: configure the bearer token privately in api/.env.")
        return 1
    try:
        payload = collect(token, max_age_seconds=args.max_age_minutes * 60)
        target = ROOT / "web" / "data" / "api-market.json"
        write_snapshot(target, payload)
        print("Exported", len(payload["stocks"]), "stock quotes to web/data/api-market.json")
        print("IHSG:", "included" if payload["index"] else "not collected; shown as unavailable")
        print("Daily bars:", sum(len(stock["dailyBars"]) for stock in payload["stocks"]))
        print("Only whitelisted market observations were exported; review this file before publishing.")
        return 0
    except (ExportError, OSError) as exc:
        print("FAIL:", exc)
        print("The previous snapshot was retained.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
