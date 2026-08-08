"""Unit tests for the GoTrue Admin API client.

No DB and no network: httpx.delete is replaced, so these cover the branching
the integration tests in test_me_api.py deliberately stub out — what each entry
point does with a missing config, an error response, and an already-deleted
user.
"""

import uuid

import httpx
import pytest

from app.core import supabase_admin
from app.core.config import get_settings
from app.core.supabase_admin import (
    AuthUserDeleteError,
    delete_auth_user,
    delete_auth_user_or_raise,
)


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch):
    """Admin credentials present, so the request branch is reached.

    setenv to a value rather than trusting the developer's .env, which Settings
    also reads (env_file); an explicit local URL keeps the test hermetic even
    when SUPABASE_URL points somewhere real.
    """
    monkeypatch.setenv("SUPABASE_URL", "http://admin.test")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


@pytest.fixture
def unconfigured(monkeypatch: pytest.MonkeyPatch):
    # Empty, not deleted: Settings falls back to env_file for a missing var.
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


def _respond(monkeypatch: pytest.MonkeyPatch, status_code: int) -> list[str]:
    """Stub httpx.delete with a fixed status; returns the list of URLs called."""
    calls: list[str] = []

    def fake_delete(url: str, **kwargs: object) -> httpx.Response:
        calls.append(url)
        return httpx.Response(status_code, request=httpx.Request("DELETE", url))

    monkeypatch.setattr(supabase_admin.httpx, "delete", fake_delete)
    return calls


def test_or_raise_sends_the_delete(configured, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _respond(monkeypatch, 204)
    user_id = uuid.uuid4()
    delete_auth_user_or_raise(user_id)
    assert calls == [f"http://admin.test/auth/v1/admin/users/{user_id}"]


def test_or_raise_treats_already_gone_as_success(
    configured, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A repeat delete on a still-valid token for a deleted account. The caller
    # asked for the user to not exist, and it does not.
    _respond(monkeypatch, 404)
    delete_auth_user_or_raise(uuid.uuid4())


def test_or_raise_raises_on_server_error(configured, monkeypatch: pytest.MonkeyPatch) -> None:
    _respond(monkeypatch, 500)
    with pytest.raises(AuthUserDeleteError):
        delete_auth_user_or_raise(uuid.uuid4())


def test_or_raise_raises_when_unconfigured(unconfigured, monkeypatch: pytest.MonkeyPatch) -> None:
    # The regression the raising variant exists for: an environment that cannot
    # delete auth users must refuse, not report a deletion it never performed.
    calls = _respond(monkeypatch, 204)
    with pytest.raises(AuthUserDeleteError):
        delete_auth_user_or_raise(uuid.uuid4())
    assert calls == []


def test_best_effort_swallows_server_error(configured, monkeypatch: pytest.MonkeyPatch) -> None:
    # The over-cap signup cleanup path: a failed cleanup must not mask the 403
    # the caller is really there to receive.
    _respond(monkeypatch, 500)
    delete_auth_user(uuid.uuid4())


def test_best_effort_skips_when_unconfigured(unconfigured, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _respond(monkeypatch, 204)
    delete_auth_user(uuid.uuid4())
    assert calls == []
