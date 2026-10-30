from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import dotenv
import pytest

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relative, monkeypatch):
    # Never load the developer's private .env while running isolated tests.
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, name, module)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def collector(monkeypatch):
    return load_module("idx_test_collector", "collector/sync_yahoo.py", monkeypatch)


@pytest.fixture
def api(monkeypatch):
    module = load_module("idx_test_api", "api/main.py", monkeypatch)
    monkeypatch.setenv("API_BEARER_TOKEN", "test-only-value")

    def forbidden_connection():
        raise AssertionError("An isolated API test attempted a database connection")

    monkeypatch.setattr(module, "connect", forbidden_connection)
    return module


@pytest.fixture
def git_check(monkeypatch):
    return load_module("idx_test_git", "scripts/check_git.py", monkeypatch)
