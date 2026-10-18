"""add admin role and ai experiments

Revision ID: b5f81d4e2c90
Revises: ae210c17d4f1
Create Date: 2026-10-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "b5f81d4e2c90"
down_revision = "ae210c17d4f1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user_accounts",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "ai_experiments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("white_preset", sa.String(50), nullable=False),
        sa.Column("black_preset", sa.String(50), nullable=False),
        sa.Column("white_config", sa.JSON(), nullable=False),
        sa.Column("black_config", sa.JSON(), nullable=False),
        sa.Column("games_total", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("white_wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("black_wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("draws", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pgn", sa.Text(), nullable=False, server_default=""),
        sa.Column("final_fen", sa.Text(), nullable=True),
        sa.Column("termination", sa.String(50), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ai_experiments_created_at", "ai_experiments", ["created_at"])


def downgrade():
    op.drop_index("ix_ai_experiments_created_at", table_name="ai_experiments")
    op.drop_table("ai_experiments")
    op.drop_column("user_accounts", "is_admin")
