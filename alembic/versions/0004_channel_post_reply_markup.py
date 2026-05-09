"""add reply_markup_json to channel_posts

Revision ID: 0004_channel_post_reply_markup
Revises: bcfe200c3b63
Create Date: 2026-03-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004_channel_post_reply_markup'
down_revision: Union[str, None] = 'bcfe200c3b63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c['name'] for c in insp.get_columns('channel_posts')}
    if 'reply_markup_json' not in cols:
        op.add_column('channel_posts', sa.Column('reply_markup_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('channel_posts', 'reply_markup_json')
