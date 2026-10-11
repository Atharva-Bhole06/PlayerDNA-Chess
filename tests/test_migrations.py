import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import URL


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class MigrationTests(unittest.TestCase):
    def test_alembic_migrations_create_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            database_file = str(Path(directory) / "migration.sqlite")
            database_url = URL.create("sqlite+pysqlite", database=database_file).render_as_string()
            config = Config(str(PROJECT_ROOT / "alembic.ini"))
            with patch.dict(os.environ, {"DATABASE_URL": database_url}):
                command.upgrade(config, "head")
                engine = create_engine(database_url)
                try:
                    tables = set(inspect(engine).get_table_names())
                finally:
                    engine.dispose()
            self.assertTrue({
                "players", "games", "player_game_performance", "move_evaluations",
                "player_profiles", "player_dna", "dna_feature_scalers", "alembic_version",
                "user_accounts", "user_sessions", "match_queue_entries", "live_games",
                "live_game_moves", "competitive_rating_history", "game_analysis_jobs",
                "player_game_reports", "live_move_analyses", "live_player_dna_history",
                "player_dna_style_models",
            } <= tables)


if __name__ == "__main__":
    unittest.main()
