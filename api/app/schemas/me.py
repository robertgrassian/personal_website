"""DTOs for the authenticated /me endpoints (spec §6).

Same wire conventions as schemas/users.py (camelCase via CamelModel), but
these payloads are per-viewer by definition — they are never cached or shared
(spec §7.2), which is exactly why they live on /me/* routes instead of the
public /users/* ones.
"""

from app.schemas.users import CamelModel


class MyProfileRead(CamelModel):
    """The caller's own profile. Existence of this payload == onboarding done."""

    username: str
    display_name: str


class ProfileCreate(CamelModel):
    """Onboarding payload: pick a username (and display name) to create the
    profile row. Normalization and validation (format, reserved list, cap)
    live in the service — the schema stays a plain shape so every rejection
    flows through one code path with one error style."""

    username: str
    display_name: str = ""  # "" → service defaults it to the username
