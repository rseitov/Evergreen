"""add steps.url

Revision ID: 9a1c7e2b4d10
Revises: 7c39f94cfd69
Create Date: 2026-06-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9a1c7e2b4d10"
down_revision: Union[str, None] = "7c39f94cfd69"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("steps", sa.Column("url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("steps", "url")
