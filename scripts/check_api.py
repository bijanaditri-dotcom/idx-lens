"""Read-only checks against the locally running IDX Lens API; never print tokens."""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import math
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8000"


def request(path: str, token: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urlopen(Request(BASE + path, headers=headers), timeout=10) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-quotes", type=int, default=1)
    args = parser.parse_args()
    token = dotenv_values(ROOT / "api" / ".env", encoding="utf-8-sig").get("API_BEARER_TOKEN")
    if not token or token.startswith("replace_"):
        print("FAIL: configure API_BEARER_TOKEN privately in api/.env.")
        return 1
    try:
        health = request("/health")
        if not isinstance(health, dict) or health.get("status") != "ok" or health.get("database") != "connected":
            raise ValueError("Health did not confirm a connected database.")
        quotes = request("/v1/quotes?limit=2000", token)
        if not isinstance(quotes, list) or len(quotes) < max(1, args.min_quotes):
            raise ValueError("Fewer valid quotes than requested.")
        seen = set()
        for row in quotes:
            ticker = row["ticker"]
            if ticker in seen or isinstance(row["price"], bool) or not isinstance(row["price"], (int, float)) or not math.isfinite(row["price"]) or row["price"] <= 0:
                raise ValueError("Duplicate ticker or invalid quote price.")
            seen.add(ticker)
            for field in ("market_time", "fetched_at"):
                value = row[field]
                if not isinstance(value, str) or not value.endswith("Z"):
                    raise ValueError("Expected UTC source and fetch timestamps.")
                datetime.fromisoformat(value.replace("Z", "+00:00"))
        try:
            request("/v1/quotes?limit=1")
        except HTTPError as exc:
            code = exc.code
            exc.close()
            if code != 401:
                raise ValueError("Unauthenticated quotes returned HTTP " + str(code) + ".") from None
        else:
            raise ValueError("Unauthenticated quotes were allowed.")
        print("PASS: health confirms MySQL is connected.")
        print("PASS: authenticated quotes:", len(quotes))
        print("PASS: quote prices and UTC timestamps are present.")
        print("PASS: unauthenticated quotes return HTTP 401.")
        return 0
    except HTTPError as exc:
        print("FAIL: API returned HTTP", exc.code)
        exc.close()
    except URLError:
        print("FAIL: cannot reach the API. Keep Uvicorn running on 127.0.0.1:8000.")
    except (TimeoutError, OSError):
        print("FAIL: API connection failed or timed out.")
    except (ValueError, KeyError, TypeError) as exc:
        print("FAIL:", exc)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
