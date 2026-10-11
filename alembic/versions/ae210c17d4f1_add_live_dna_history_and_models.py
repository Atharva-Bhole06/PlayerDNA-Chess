"""add live DNA history and model metadata

Revision ID: ae210c17d4f1
Revises: 9dfc4a120a66
Create Date: 2026-10-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "ae210c17d4f1"
down_revision = "9dfc4a120a66"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "live_player_dna_history",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("game_id", sa.String(36), sa.ForeignKey("live_games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("games_analyzed", sa.Integer(), nullable=False),
        sa.Column("median_cpl", sa.Float(), nullable=False),
        sa.Column("cpl_std", sa.Float(), nullable=False),
        sa.Column("inaccuracies_per_100_cp_moves", sa.Float(), nullable=False),
        sa.Column("feature_version", sa.String(40), nullable=False, server_default="live_dna_raw_v1"),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_live_player_dna_history_user_snapshot", "live_player_dna_history", ["user_id", "snapshot_at"])
    op.create_table(
        "player_dna_style_models",
        sa.Column("version", sa.String(80), primary_key=True),
        sa.Column("model_type", sa.String(40), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("feature_version", sa.String(40), nullable=False),
        sa.Column("training_rows", sa.Integer(), nullable=False),
        sa.Column("data_fingerprint", sa.String(64), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("artifact_path", sa.Text(), nullable=False),
        sa.Column("trained_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("player_dna_style_models")
    op.drop_index("ix_live_player_dna_history_user_snapshot", table_name="live_player_dna_history")
    op.drop_table("live_player_dna_history")
