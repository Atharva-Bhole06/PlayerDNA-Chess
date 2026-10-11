"""add live matchmaking and persisted games

Revision ID: 48ac7f90b12d
Revises: 2c3e9a8d1f40
Create Date: 2026-10-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "48ac7f90b12d"
down_revision = "2c3e9a8d1f40"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "match_queue_entries",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("rating_at_join", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_match_queue_entries_joined_at", "match_queue_entries", ["joined_at"])
    op.create_table(
        "live_games",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("white_user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("black_user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("white_rating_at_start", sa.Integer(), nullable=False, server_default="1200"),
        sa.Column("black_rating_at_start", sa.Integer(), nullable=False, server_default="1200"),
        sa.Column("status", sa.String(12), nullable=False, server_default="active"),
        sa.Column("current_fen", sa.Text(), nullable=False),
        sa.Column("pgn", sa.Text(), nullable=False, server_default=""),
        sa.Column("result", sa.String(7)), sa.Column("termination", sa.String(32)),
        sa.Column("draw_offered_by", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="SET NULL")),
        sa.Column("white_time_ms", sa.Integer(), nullable=False, server_default="300000"),
        sa.Column("black_time_ms", sa.Integer(), nullable=False, server_default="300000"),
        sa.Column("increment_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("turn_started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("white_user_id <> black_user_id", name="ck_live_games_distinct_players"),
        sa.CheckConstraint("status IN ('active', 'completed')", name="ck_live_games_status"),
        sa.CheckConstraint("result IS NULL OR result IN ('1-0', '0-1', '1/2-1/2')", name="ck_live_games_result"),
    )
    for column in ("white_user_id", "black_user_id", "status"):
        op.create_index(f"ix_live_games_{column}", "live_games", [column])
    op.create_table(
        "live_game_moves",
        sa.Column("game_id", sa.String(36), sa.ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ply_number", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("uci", sa.String(10), nullable=False), sa.Column("san", sa.String(20), nullable=False),
        sa.Column("fen_before", sa.Text(), nullable=False), sa.Column("fen_after", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("ply_number > 0", name="ck_live_game_moves_ply_positive"),
    )
    op.create_table(
        "competitive_rating_history",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("game_id", sa.String(36), sa.ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("rating_before", sa.Integer(), nullable=False), sa.Column("rating_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("competitive_rating_history")
    op.drop_table("live_game_moves")
    for column in ("status", "black_user_id", "white_user_id"):
        op.drop_index(f"ix_live_games_{column}", table_name="live_games")
    op.drop_table("live_games")
    op.drop_index("ix_match_queue_entries_joined_at", table_name="match_queue_entries")
    op.drop_table("match_queue_entries")
