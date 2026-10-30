from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient
import pytest

AUTH = {"Authorization": "Bearer test-only-value"}


@pytest.mark.parametrize("path", [
    "/v1/quotes", "/v1/bars?ticker=BBCA.JK",
    "/v1/fundamentals?ticker=BBCA.JK", "/v1/sync-status",
])
def test_missing_token_is_rejected_before_database_access(api, path):
    assert TestClient(api.app).get(path).status_code == 401


def test_wrong_token_is_rejected(api):
    response = TestClient(api.app).get("/v1/quotes", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401


def test_missing_server_token_disables_authenticated_endpoint(api, monkeypatch):
    monkeypatch.delenv("API_BEARER_TOKEN")
    assert TestClient(api.app).get("/v1/quotes", headers=AUTH).status_code == 503


def test_quotes_filter_uses_bound_parameters(api, monkeypatch):
    calls = []

    def rows(sql, params=()):
        calls.append((sql, params))
        return [{"ticker": "BBCA.JK", "price": 100.0}]

    monkeypatch.setattr(api, "rows", rows)
    response = TestClient(api.app).get("/v1/quotes", params={"ticker": " bbca.jk "}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()[0]["ticker"] == "BBCA.JK"
    assert calls[0][1] == ("BBCA.JK",)
    assert "BBCA.JK" not in calls[0][0]


@pytest.mark.parametrize("query", ["limit=0", "limit=2001"])
def test_quote_limit_is_validated(api, query):
    assert TestClient(api.app).get("/v1/quotes?" + query, headers=AUTH).status_code == 422


def test_bars_are_returned_in_chronological_order(api, monkeypatch):
    monkeypatch.setattr(api, "rows", lambda *args: [
        {"bar_time": "2026-10-30T02:01:00Z"}, {"bar_time": "2026-10-30T02:00:00Z"},
    ])
    response = TestClient(api.app).get("/v1/bars?ticker=BBCA.JK", headers=AUTH)
    assert response.status_code == 200
    assert response.json()[0]["bar_time"] == "2026-10-30T02:00:00Z"


def test_health_reports_database_failure(api, monkeypatch):
    def unavailable(*args):
        raise RuntimeError("test database unavailable")

    monkeypatch.setattr(api, "rows", unavailable)
    response = TestClient(api.app).get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


def test_health_reports_success_without_token(api, monkeypatch):
    monkeypatch.setattr(api, "rows", lambda *args: [{"quote_count": 6, "latest_fetch_utc": "2026-10-30T05:40:04Z"}])
    response = TestClient(api.app).get("/health")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"
    assert response.json()["quote_count"] == 6


def test_database_decimals_and_datetimes_are_json_friendly(api):
    assert api.clean(Decimal("4980.0000")) == 4980.0
    assert api.clean(datetime(2026, 10, 30, 4, 29, 54)) == "2026-10-30T04:29:54Z"
