from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import pytest
from conftest import load_module

NOW = datetime(2026, 10, 30, 5, 41, tzinfo=timezone.utc)


@pytest.fixture
def exporter(monkeypatch):
    return load_module('idx_test_exporter', 'scripts/export_dashboard.py', monkeypatch)


def quote():
    return {'ticker':'BBCA.JK','company_name':'Bank Central Asia','price':4980.0,
            'previous_close':5000.0,'currency':'IDR','market_time':'2026-10-30T05:39:00Z',
            'fetched_at':'2026-10-30T05:40:00Z','source':'Yahoo Finance chart (HTTP)',
            'MYSQL_'+'PASSWORD':'private-value-must-not-export'}


def reader(rows=None, bars=None):
    def read(path, token):
        assert token == 'test-only-secret'
        if path == '/health': return {'status':'ok','database':'connected'}
        if path.startswith('/v1/quotes?ticker='): return []
        if path.startswith('/v1/quotes?'): return rows if rows is not None else [quote()]
        if path.startswith('/v1/bars?'): return bars or []
        raise AssertionError(path)
    return read


def test_exports_actual_quote_without_secrets_or_fabricated_history(exporter):
    result = exporter.collect('test-only-secret', read=reader(), now=NOW)
    stock = result['stocks'][0]
    assert stock['quote']['price'] == 4980.0
    assert stock['quote']['marketTime'] == '2026-10-30T05:39:00Z'
    assert stock['quote']['fetchedAt'] == '2026-10-30T05:40:00Z'
    assert stock['dailyBars'] == [] and result['index'] is None
    encoded = json.dumps(result)
    assert 'private-value-must-not-export' not in encoded
    assert 'test-only-secret' not in encoded


@pytest.mark.parametrize('change', [
    {'price':0}, {'currency':'USD'}, {'market_time':'2027-01-01T00:00:00Z'},
])
def test_invalid_quote_cannot_be_exported(exporter, change):
    row = {**quote(), **change}
    with pytest.raises(exporter.ExportError):
        exporter.collect('test-only-secret', read=reader([row]), now=NOW)


def test_duplicate_quotes_are_rejected(exporter):
    with pytest.raises(exporter.ExportError):
        exporter.collect('test-only-secret', read=reader([quote(), quote()]), now=NOW)


def test_missing_volume_is_omitted_instead_of_inventing_zero(exporter):
    row = {'ticker':'BBCA.JK','interval_code':'1d','bar_time':'2026-10-29T02:00:00Z',
           'open_price':4900,'high_price':5010,'low_price':4880,'close_price':5000,'volume':None}
    result = exporter.collect('test-only-secret', read=reader(bars=[row]), now=NOW)
    assert result['stocks'][0]['dailyBars'] == []
    assert result['stocks'][0]['omittedDailyBars'] == 1


def test_serialization_failure_preserves_existing_snapshot(exporter, tmp_path):
    path = tmp_path / 'snapshot.json'
    path.write_bytes(b'previous valid snapshot')
    with pytest.raises(ValueError):
        exporter.write_snapshot(path, {'invalid':float('nan')})
    assert path.read_bytes() == b'previous valid snapshot'


def test_api_failure_preserves_previous_file_and_does_not_print_token(exporter, monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(exporter, 'ROOT', tmp_path)
    (tmp_path/'api').mkdir()
    (tmp_path/'api/.env').write_text('API_'+'BEARER_TOKEN=test-only-secret\n')
    target = tmp_path/'web/data/api-market.json'
    target.parent.mkdir(parents=True)
    target.write_bytes(b'previous snapshot')
    def fail(*args, **kwargs): raise exporter.ExportError('Local API unavailable')
    monkeypatch.setattr(exporter, 'collect', fail)
    monkeypatch.setattr(sys, 'argv', ['export_dashboard.py'])
    assert exporter.main() == 1
    assert target.read_bytes() == b'previous snapshot'
    assert 'test-only-secret' not in capsys.readouterr().out
