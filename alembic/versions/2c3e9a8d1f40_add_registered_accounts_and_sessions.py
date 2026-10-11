"""add registered accounts and sessions

Revision ID: 2c3e9a8d1f40
Revises: 648bf21baae5
Create Date: 2026-10-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "2c3e9a8d1f40"
down_revision = "648bf21baae5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_accounts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("username", sa.String(length=32), nullable=False),
        sa.Column("username_key", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="1200"),
        sa.Column("games_played", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("draws", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["player_id"], ["players.player_id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("player_id", name="uq_user_accounts_player_id"),
        sa.UniqueConstraint("username_key", name="uq_user_accounts_username_key"),
    )
    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])


def downgrade():
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("user_accounts")
