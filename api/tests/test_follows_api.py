"""Integration tests for the follow graph: the public follower/following
reads, the per-viewer /me/relationship read, follow/unfollow, and the
auto-follow that runs at signup.

Same setup as test_me_api.py: auth is stubbed via dependency_overrides, and
every user is a throwaway auth.users row whose teardown cascades the profile
and its follow edges away (ON DELETE CASCADE from profiles). Two users are the
minimum interesting case here, so most tests build a pair.

Auto-follow is off unless FOUNDER_PROFILE_ID is configured, so the tests that
care about it set founder_profile_id explicitly rather than depending on
whatever the local .env happens to hold.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")


def client_as(user_id: uuid.UUID, email: str = "test@example.com") -> TestClient:
    """A TestClient whose requests authenticate as the given user id."""
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(id=user_id, email=email)
    return TestClient(app)


_INSERT_AUTH_USER = text(
    """
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token,
        email_change_token_new, email_change
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', :id,
        'authenticated', 'authenticated', :email, '',
        now(), now(), now(), '{}', '{}', '', '', '', ''
    )
    """
)


def _make_auth_user() -> uuid.UUID:
    user_id = uuid.uuid4()
    with get_sessionmaker()() as session:
        session.execute(_INSERT_AUTH_USER, {"id": user_id, "email": f"test-{user_id}@example.com"})
        session.commit()
    return user_id


def _delete_auth_user(user_id: uuid.UUID) -> None:
    with get_sessionmaker()() as session:
        session.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        session.commit()


def _edge_count(follower_id: uuid.UUID, followee_id: uuid.UUID) -> int:
    """Rows for one specific edge — 0 or 1, and the assertion that catches a
    duplicate-insert regression if the composite PK ever went away."""
    with get_sessionmaker()() as session:
        return session.execute(
            text(
                "SELECT count(*) FROM follows "
                "WHERE follower_id = :follower AND followee_id = :followee"
            ),
            {"follower": follower_id, "followee": followee_id},
        ).scalar_one()


class User:
    """An onboarded throwaway user: auth id plus the username it claimed."""

    def __init__(self, user_id: uuid.UUID, username: str) -> None:
        self.id = user_id
        self.username = username
        self.client = client_as(user_id)


@pytest.fixture
def make_user():
    """Factory for onboarded throwaway users, all cleaned up at teardown.

    A factory rather than a fixture per user because the interesting cases here
    need two or three accounts and naming them user_a/user_b/user_c as separate
    fixtures gets unreadable fast.
    """
    created: list[uuid.UUID] = []

    def _make() -> User:
        user_id = _make_auth_user()
        created.append(user_id)
        username = f"follow-{str(user_id)[:8]}"
        response = client_as(user_id).post("/api/py/me/profile", json={"username": username})
        assert response.status_code == 201, response.text
        return User(user_id, username)

    try:
        yield _make
    finally:
        for user_id in created:
            _delete_auth_user(user_id)


@pytest.fixture
def no_auto_follow(monkeypatch: pytest.MonkeyPatch):
    """Signup creates no follow edges, so a test's graph contains only what the
    test itself put there. The default for everything except the auto-follow
    tests below."""
    monkeypatch.setattr(get_settings(), "founder_profile_id", None)


# --- follow / unfollow ----------------------------------------------------


@requires_db
def test_follow_then_unfollow_round_trip(make_user, no_auto_follow) -> None:
    a, b = make_user(), make_user()

    followed = a.client.post(f"/api/py/me/following/{b.username}")
    assert followed.status_code == 204
    assert _edge_count(a.id, b.id) == 1
    # Directed edge: A following B does not make B follow A.
    assert _edge_count(b.id, a.id) == 0

    unfollowed = a.client.delete(f"/api/py/me/following/{b.username}")
    assert unfollowed.status_code == 204
    assert _edge_count(a.id, b.id) == 0


@requires_db
def test_double_follow_is_idempotent(make_user, no_auto_follow) -> None:
    """A double-fired toggle must not 409 — the UI treats follow as a plain
    toggle and has no conflict state to render."""
    a, b = make_user(), make_user()
    assert a.client.post(f"/api/py/me/following/{b.username}").status_code == 204
    assert a.client.post(f"/api/py/me/following/{b.username}").status_code == 204
    assert _edge_count(a.id, b.id) == 1


@requires_db
def test_unfollow_when_not_following_is_noop(make_user, no_auto_follow) -> None:
    a, b = make_user(), make_user()
    assert a.client.delete(f"/api/py/me/following/{b.username}").status_code == 204
    assert _edge_count(a.id, b.id) == 0


@requires_db
@pytest.mark.parametrize("method", ["post", "delete"])
def test_self_follow_is_422(make_user, no_auto_follow, method: str) -> None:
    a = make_user()
    response = getattr(a.client, method)(f"/api/py/me/following/{a.username}")
    assert response.status_code == 422
    assert "yourself" in response.json()["detail"]


@requires_db
@pytest.mark.parametrize("method", ["post", "delete"])
def test_follow_unknown_user_is_404(make_user, no_auto_follow, method: str) -> None:
    a = make_user()
    response = getattr(a.client, method)("/api/py/me/following/nobody")
    assert response.status_code == 404


@requires_db
def test_follow_username_is_case_insensitive(make_user, no_auto_follow) -> None:
    """Usernames are citext, so the URL casing a follower list link happens to
    use must not matter."""
    a, b = make_user(), make_user()
    assert a.client.post(f"/api/py/me/following/{b.username.upper()}").status_code == 204
    assert _edge_count(a.id, b.id) == 1


@requires_db
@pytest.mark.parametrize("method", ["post", "delete"])
def test_follow_requires_auth(method: str) -> None:
    # No dependency override: the real auth dependency runs and rejects.
    response = getattr(TestClient(create_app()), method)("/api/py/me/following/rgrassian")
    assert response.status_code == 401


# --- /me/relationship -----------------------------------------------------


@requires_db
def test_relationship_reflects_follow_state(make_user, no_auto_follow) -> None:
    a, b = make_user(), make_user()

    before = a.client.get(f"/api/py/me/relationship/{b.username}")
    assert before.status_code == 200
    assert before.json() == {"amIFollowing": False, "isMe": False}

    a.client.post(f"/api/py/me/following/{b.username}")
    after = a.client.get(f"/api/py/me/relationship/{b.username}")
    assert after.json() == {"amIFollowing": True, "isMe": False}

    # The other direction is unaffected — this is what stops the follow button
    # from rendering "Following" on someone who merely follows you.
    assert b.client.get(f"/api/py/me/relationship/{a.username}").json() == {
        "amIFollowing": False,
        "isMe": False,
    }


@requires_db
def test_relationship_with_self_reports_is_me(make_user, no_auto_follow) -> None:
    a = make_user()
    assert a.client.get(f"/api/py/me/relationship/{a.username}").json() == {
        "amIFollowing": False,
        "isMe": True,
    }


@requires_db
def test_relationship_works_before_onboarding(no_auto_follow) -> None:
    """A signed-in user with no profile follows nobody. Answering that plainly
    keeps the follow button from needing a not-onboarded branch."""
    response = client_as(uuid.uuid4()).get("/api/py/me/relationship/rgrassian")
    assert response.status_code == 200
    assert response.json() == {"amIFollowing": False, "isMe": False}


@requires_db
def test_relationship_unknown_user_is_404(make_user, no_auto_follow) -> None:
    a = make_user()
    assert a.client.get("/api/py/me/relationship/nobody").status_code == 404


@requires_db
def test_relationship_requires_auth() -> None:
    assert TestClient(create_app()).get("/api/py/me/relationship/rgrassian").status_code == 401


# --- public follower / following lists ------------------------------------


@requires_db
def test_lists_are_directional(make_user, no_auto_follow) -> None:
    a, b = make_user(), make_user()
    a.client.post(f"/api/py/me/following/{b.username}")
    client = TestClient(create_app())

    a_following = client.get(f"/api/py/users/{a.username}/following").json()
    assert [u["username"] for u in a_following] == [b.username]
    assert client.get(f"/api/py/users/{a.username}/followers").json() == []

    b_followers = client.get(f"/api/py/users/{b.username}/followers").json()
    assert [u["username"] for u in b_followers] == [a.username]
    assert client.get(f"/api/py/users/{b.username}/following").json() == []


@requires_db
def test_list_rows_carry_only_public_summary_fields(make_user, no_auto_follow) -> None:
    a, b = make_user(), make_user()
    a.client.post(f"/api/py/me/following/{b.username}")
    rows = TestClient(create_app()).get(f"/api/py/users/{a.username}/following").json()
    assert rows == [{"username": b.username, "displayName": b.username}]


@requires_db
def test_lists_are_public(make_user, no_auto_follow) -> None:
    """No auth on these reads: follower lists are public, like the libraries."""
    a, b = make_user(), make_user()
    a.client.post(f"/api/py/me/following/{b.username}")
    anonymous = TestClient(create_app())
    assert anonymous.get(f"/api/py/users/{b.username}/followers").status_code == 200


@requires_db
def test_profile_counts_track_the_graph(make_user, no_auto_follow) -> None:
    a, b, c = make_user(), make_user(), make_user()
    client = TestClient(create_app())

    def counts(username: str) -> tuple[int, int]:
        body = client.get(f"/api/py/users/{username}").json()
        return body["followerCount"], body["followingCount"]

    assert counts(b.username) == (0, 0)
    a.client.post(f"/api/py/me/following/{b.username}")
    c.client.post(f"/api/py/me/following/{b.username}")
    assert counts(b.username) == (2, 0)
    assert counts(a.username) == (0, 1)

    a.client.delete(f"/api/py/me/following/{b.username}")
    assert counts(b.username) == (1, 0)


# --- auto-follow at signup ------------------------------------------------


@requires_db
def test_signup_auto_follows_founder_in_both_directions(
    make_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The point of auto-follow: a brand-new account has a non-empty Following
    list and shows up in the founder's Followers list."""
    founder = make_user()
    monkeypatch.setattr(get_settings(), "founder_profile_id", founder.id)

    newcomer = make_user()
    assert _edge_count(newcomer.id, founder.id) == 1
    assert _edge_count(founder.id, newcomer.id) == 1


@requires_db
def test_signup_creates_no_edges_when_founder_unconfigured(make_user, no_auto_follow) -> None:
    newcomer = make_user()
    with get_sessionmaker()() as session:
        edges = session.execute(
            text("SELECT count(*) FROM follows WHERE follower_id = :id OR followee_id = :id"),
            {"id": newcomer.id},
        ).scalar_one()
    assert edges == 0


@requires_db
def test_founder_signing_up_does_not_self_follow(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the founder onboards their own account, founder_id == the new
    user's id. Skipping the edges is what keeps that from tripping the
    no_self_follow check constraint and failing the signup."""
    user_id = _make_auth_user()
    monkeypatch.setattr(get_settings(), "founder_profile_id", user_id)
    try:
        response = client_as(user_id).post(
            "/api/py/me/profile", json={"username": f"founder-{str(user_id)[:8]}"}
        )
        assert response.status_code == 201
        assert _edge_count(user_id, user_id) == 0
    finally:
        _delete_auth_user(user_id)


@requires_db
def test_misconfigured_founder_id_still_allows_signup(monkeypatch: pytest.MonkeyPatch) -> None:
    """A FOUNDER_PROFILE_ID naming no profile must not close signup. Without
    the existence check, the follow edges would violate their foreign key and
    roll the profile insert back with them, reporting a bogus "username taken"."""
    monkeypatch.setattr(get_settings(), "founder_profile_id", uuid.uuid4())
    user_id = _make_auth_user()
    try:
        response = client_as(user_id).post(
            "/api/py/me/profile", json={"username": f"orphan-{str(user_id)[:8]}"}
        )
        assert response.status_code == 201
    finally:
        _delete_auth_user(user_id)
