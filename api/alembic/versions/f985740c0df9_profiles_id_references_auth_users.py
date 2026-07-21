"""profiles id references auth users

Adds the constraint deferred out of the baseline: ``profiles.id`` REFERENCES
``auth.users(id)`` ON DELETE CASCADE, so deleting an auth account (GoTrue Admin
API) takes the profile — and, via the existing cascades, the whole library —
with it.

Deferred because Phase 1 seeded a placeholder Robert profile with no
``auth.users`` row. From this revision on, every profile must be backed by an
auth user; the seed script now creates a local auth user for Robert first.

Orphan handling: any profile without a matching auth user is DELETED before
the constraint is added (cascading away its library data). This only ever
bites the local placeholder — rerun ``uv run python scripts/seed.py`` after
upgrading and Robert comes back auth-backed. Production never has orphans:
the schema arrives there with both migrations applied before any data exists.

The FK is deliberately NOT declared on the SQLAlchemy model: ``auth.users``
belongs to GoTrue and stays out of our metadata. env.py's ``include_object``
filter keeps autogenerate from proposing to drop it.

Revision ID: f985740c0df9
Revises: fe5fe4c238ae
Create Date: 2026-07-19

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "f985740c0df9"
down_revision = "fe5fe4c238ae"
branch_labels = None
depends_on = None

# Named to match the metadata naming convention (fk_<table>_<col>_<referred>)
# even though this constraint lives only in migrations, never in the models.
FK_NAME = "fk_profiles_id_users"


def upgrade() -> None:
    op.execute(
        "DELETE FROM profiles"
        " WHERE id NOT IN (SELECT id FROM auth.users)"
    )
    op.create_foreign_key(
        FK_NAME,
        source_table="profiles",
        referent_table="users",
        local_cols=["id"],
        remote_cols=["id"],
        referent_schema="auth",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(FK_NAME, "profiles", type_="foreignkey")
