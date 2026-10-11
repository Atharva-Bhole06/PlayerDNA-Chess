"""add post-game analysis reports

Revision ID: 9dfc4a120a66
Revises: 48ac7f90b12d
Create Date: 2026-10-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "9dfc4a120a66"
down_revision = "48ac7f90b12d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "game_analysis_jobs",
        sa.Column("game_id", sa.String(36), sa.ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text()),
        sa.Column("analysis_version", sa.String(40), nullable=False, server_default="stockfish_live_v1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name="ck_game_analysis_jobs_status"),
    )
    op.create_index("ix_game_analysis_jobs_status", "game_analysis_jobs", ["status"])
    op.create_table(
        "live_move_analyses",
        sa.Column("game_id", sa.String(36), primary_key=True),
        sa.Column("ply_number", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("best_move_uci", sa.String(10), nullable=False),
        sa.Column("best_move_san", sa.String(20), nullable=False),
        sa.Column("played_move_san", sa.String(20), nullable=False),
        sa.Column("best_score_cp", sa.Integer()), sa.Column("best_score_mate", sa.Integer()),
        sa.Column("played_score_cp", sa.Integer()), sa.Column("played_score_mate", sa.Integer()),
        sa.Column("cpl", sa.Integer()), sa.Column("best_move_agreement", sa.Boolean(), nullable=False),
        sa.Column("classification", sa.String(40), nullable=False),
        sa.Column("engine_depth", sa.Integer(), nullable=False),
        sa.Column("engine_name", sa.String(100), nullable=False),
        sa.Column("analysis_time_ms", sa.Float(), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["game_id", "ply_number"], ["live_game_moves.game_id", "live_game_moves.ply_number"], ondelete="CASCADE"),
    )
    op.create_index("ix_live_move_analyses_user_id", "live_move_analyses", ["user_id"])
    op.create_table(
        "player_game_reports",
        sa.Column("game_id", sa.String(36), sa.ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("moves_analyzed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cp_evaluable_moves", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("average_cpl", sa.Float()),
        sa.Column("blunders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mistakes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inaccuracies", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_move_agreement_pct", sa.Float()),
        sa.Column("accuracy_pct", sa.Float()),
        sa.Column("stars", sa.Integer()),
        sa.Column("star_reason", sa.Text()),
        sa.Column("performance_version", sa.String(40), nullable=False, server_default="performance_stars_v1"),
        sa.Column("mate_events", sa.JSON(), nullable=False),
        sa.Column("critical_moves", sa.JSON(), nullable=False),
        sa.Column("recommendations", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("stars IS NULL OR stars BETWEEN 3 AND 5", name="ck_player_game_reports_stars"),
        sa.CheckConstraint("moves_analyzed >= 0", name="ck_player_game_reports_moves_nonnegative"),
    )


def downgrade():
    op.drop_table("player_game_reports")
    op.drop_index("ix_live_move_analyses_user_id", table_name="live_move_analyses")
    op.drop_table("live_move_analyses")
    op.drop_index("ix_game_analysis_jobs_status", table_name="game_analysis_jobs")
    op.drop_table("game_analysis_jobs")
