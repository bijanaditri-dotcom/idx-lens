from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
import json
from urllib.error import HTTPError

import pytest


def epoch(day, hour=2, minute=0):
    return int(datetime(2026, 10, day, hour, minute, tzinfo=timezone.utc).timestamp())


def chart(timestamps=None, closes=None, meta=None, **columns):
    return {"chart": {"error": None, "result": [{
        "meta": {"symbol": "BBCA.JK", "currency": "IDR", **(meta or {})},
        "timestamp": timestamps or [epoch(29), epoch(30)],
        "indicators": {"quote": [{"close": closes if closes is not None else [100, 110], **columns}]},
    }]}}


def parse(collector, payload, period="5d"):
    return collector.parse_chart(payload, "BBCA.JK", "1m", period, datetime(2026, 10, 30, 6))


def test_latest_valid_bar_preserves_source_and_fetch_times(collector):
    result = parse(collector, chart())
    assert result.price == Decimal("110")
    assert result.observed == datetime(2026, 10, 30, 2)
    assert result.fetched == datetime(2026, 10, 30, 6)
    assert result.previous_close == Decimal("100")


def test_newer_metadata_price_is_used_without_changing_bar_price(collector):
    result = parse(collector, chart(meta={
        "regularMarketTime": epoch(30, minute=1), "regularMarketPrice": 112,
        "previousClose": 98,
    }))
    assert result.price == Decimal("112")
    assert result.bars[-1].close == Decimal("110")
    assert result.previous_close == Decimal("98")


def test_older_metadata_does_not_replace_newer_bar_price(collector):
    result = parse(collector, chart(meta={"regularMarketTime": epoch(29), "regularMarketPrice": 999}))
    assert result.price == Decimal("110")
    assert result.observed == datetime(2026, 10, 30, 2)


def test_invalid_closes_are_skipped_and_bars_are_sorted_and_deduplicated(collector):
    stamps = [epoch(30, minute=i) for i in (2, 0, 1, 3, 4, 2)]
    result = parse(collector, chart(stamps, [102, 100, 0, None, float("nan"), 103]))
    assert [b.close for b in result.bars] == [Decimal("100"), Decimal("103")]
    assert result.price == Decimal("103")


def test_daily_statistics_do_not_mix_previous_session(collector):
    result = parse(collector, chart(
        [epoch(29), epoch(30), epoch(30, minute=1)], [90, 101, 104],
        open=[80, 100, 102], high=[999, 103, 106], low=[1, 99, 100], volume=[9999, 10, 20],
    ))
    assert (result.open, result.high, result.low, result.volume) == (
        Decimal("100"), Decimal("106"), Decimal("99"), 30,
    )


@pytest.mark.parametrize("payload", [
    {}, {"chart": {"result": []}},
    chart(meta={"symbol": "BBRI.JK"}), chart(closes=[None, 0]),
])
def test_unusable_chart_is_rejected(collector, payload):
    with pytest.raises(collector.DataError):
        parse(collector, payload)


def test_http_429_stops_without_immediate_retry(collector, monkeypatch):
    calls, delays = [], []
    monkeypatch.setenv("YAHOO_RETRIES", "3")

    def limited(request, timeout):
        calls.append(request.full_url)
        raise HTTPError(request.full_url, 429, "limited", {"Retry-After": "60"}, None)

    with pytest.raises(collector.RateLimited):
        collector.fetch_chart("BBCA.JK", "1m", "1d", opener=limited, sleeper=delays.append)
    assert len(calls) == 1
    assert delays == []


def test_transient_http_error_retries_then_succeeds(collector, monkeypatch):
    calls, delays = [], []
    monkeypatch.setenv("YAHOO_RETRIES", "3")

    def retry_then_response(request, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            raise HTTPError(request.full_url, 503, "unavailable", {}, None)
        return BytesIO(json.dumps(chart()).encode())

    result = collector.fetch_chart("BBCA.JK", "1m", "1d", opener=retry_then_response, sleeper=delays.append)
    assert result.price == Decimal("110")
    assert len(calls) == 2
    assert delays == [2]


def test_invalid_symbol_is_rejected_before_network_request(collector):
    def unexpected_network(*args, **kwargs):
        pytest.fail("Unexpected network request")

    with pytest.raises(ValueError):
        collector.fetch_chart("../not-a-stock", "1m", "1d", opener=unexpected_network)
