"""DTOs for the authenticated /me endpoints (spec §6).

Same wire conventions as schemas/users.py (camelCase via CamelModel), but
these payloads are per-viewer by definition — they are never cached or shared
(spec §7.2), which is exactly why they live on /me/* routes instead of the
public /users/* ones.
"""

from pydantic import Field

from app.schemas.users import CamelModel

# Matches the client hint (OnboardingForm maxLength) and bounds what we store.
MAX_DISPLAY_NAME = 80


class MyProfileRead(CamelModel):
    """The caller's own profile. Existence of this payload == onboarding done."""

    username: str
    display_name: str


class ProfileCreate(CamelModel):
    """Onboarding payload: pick a username (and display name) to create the
    profile row. Username format/reserved/cap validation lives in the service
    (one error path, one style); length caps live here because the Server
    Action is directly invocable — the client's maxLength is only a hint, so
    the server must be the real bound. Over-length → FastAPI 422."""

    username: str = Field(max_length=64)  # generous; the service regex caps at 30
    display_name: str = Field(default="", max_length=MAX_DISPLAY_NAME)
