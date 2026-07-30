"""Business logic for the follow graph.

Usernames on the wire, ids in the database: every function here takes the
username the URL carried and resolves it to a profile id, raising the same
``UserNotFoundError`` the public reads use so an unknown username is a 404
whether you are reading a library or trying to follow it.

Follow/unfollow are idempotent (see repositories/follows.py). The one genuine
error is following yourself, which the DB also refuses via
ck_follows_no_self_follow — caught here first so the caller gets a sentence
instead of a constraint violation.
"""

import uuid

from sqlalchemy.orm import Session

from app.models import Profile
from app.repositories import follows as follows_repo
from app.repositories import users as users_repo
from app.schemas.me import RelationshipRead
from app.schemas.users import UserSummary
from app.services.users import UserNotFoundError


class SelfFollowError(Exception):
    """A user tried to follow their own account."""

    def __init__(self) -> None:
        super().__init__("You can't follow yourself.")


def _require_profile(db: Session, username: str) -> Profile:
    """Resolve a username to its profile or raise. Mirrors the helper in
    services/users.py rather than importing it: both are three lines over the
    same repository call, and reaching across services for a private name
    would couple these two modules for no gain."""
    profile = users_repo.get_profile_by_username(db, username)
    if profile is None:
        raise UserNotFoundError(username)
    return profile


def _to_summary(profile: Profile) -> UserSummary:
    return UserSummary(username=profile.username, display_name=profile.display_name)


def get_followers(db: Session, username: str) -> list[UserSummary]:
    """Public: who follows this user. Follower lists are public by design, in
    step with libraries themselves being public."""
    profile = _require_profile(db, username)
    return [_to_summary(p) for p in follows_repo.list_followers(db, profile.id)]


def get_following(db: Session, username: str) -> list[UserSummary]:
    """Public: who this user follows."""
    profile = _require_profile(db, username)
    return [_to_summary(p) for p in follows_repo.list_following(db, profile.id)]


def get_relationship(db: Session, viewer_id: uuid.UUID, username: str) -> RelationshipRead:
    """The caller's relationship to ``username``.

    Deliberately does NOT require the caller to be onboarded: a signed-in user
    with no profile yet simply follows nobody, so answering "not following,
    not you" is more useful than a 403 the button would have to special-case.
    """
    target = _require_profile(db, username)
    if target.id == viewer_id:
        return RelationshipRead(am_i_following=False, is_me=True)
    return RelationshipRead(
        am_i_following=follows_repo.is_following(db, viewer_id, target.id),
        is_me=False,
    )


def follow_user(db: Session, viewer_id: uuid.UUID, username: str) -> None:
    """Follow ``username`` on the caller's behalf. Already following is a
    no-op, not a conflict."""
    target = _require_profile(db, username)
    if target.id == viewer_id:
        raise SelfFollowError()
    follows_repo.follow(db, viewer_id, target.id)


def unfollow_user(db: Session, viewer_id: uuid.UUID, username: str) -> None:
    """Unfollow ``username``. Not following is a no-op.

    Applies to the founder edge like any other: it is an ordinary row with no
    special-case protection.
    """
    target = _require_profile(db, username)
    if target.id == viewer_id:
        raise SelfFollowError()
    follows_repo.unfollow(db, viewer_id, target.id)
