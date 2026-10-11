import unittest

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.db.import_csv import database_counts, import_data, verify_data
from backend.db.models import (
    DNAFeatureScaler,
    Game,
    MoveEvaluation,
    Player,
    PlayerDNA,
    PlayerGamePerformance,
    PlayerProfile,
    UserAccount,
)
from backend.repositories.matchmaking_repository import MatchmakingRepository
from backend.repositories.player_repository import PlayerRepository
from backend.services.matchmaking_service import MatchmakingService
from backend.services.player_service import PlayerService
from tests.database_support import configure_test_database, test_engine


class DatabaseIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = configure_test_database()

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def test_expected_row_counts_and_full_csv_consistency(self):
        with Session(self.engine) as session:
            counts = database_counts(session)
            self.assertEqual(counts, {
                "players": 30,
                "player_profiles": 30,
                "player_dna": 30,
                "dna_feature_scalers": 3,
                "games": 1200,
                "player_game_performance": 1200,
                "move_evaluations": 39097,
            })
            self.assertEqual(verify_data(session), counts)

    def test_database_fixture_creates_fresh_engine_after_disposal(self):
        first = test_engine()
        second = configure_test_database()
        self.assertIsNot(first, second)
        first.dispose()
        with Session(second) as session:
            self.assertEqual(database_counts(session)["games"], 1200)
        second.dispose()

    def test_foreign_keys_and_one_to_one_relationships(self):
        foreign_keys = {
            table: {fk["referred_table"] for fk in inspect(self.engine).get_foreign_keys(table)}
            for table in inspect(self.engine).get_table_names()
        }
        self.assertIn("players", foreign_keys["player_profiles"])
        self.assertIn("players", foreign_keys["player_dna"])
        self.assertIn("players", foreign_keys["games"])
        self.assertIn("games", foreign_keys["player_game_performance"])
        self.assertIn("games", foreign_keys["move_evaluations"])
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(Game).where(Game.game_id == "vfHOmHsK")).player_id, "dipset")
            self.assertIsNotNone(session.get(PlayerProfile, "dipset"))
            self.assertIsNotNone(session.get(PlayerDNA, ("dipset", "robust_iqr_v1")))

    def test_database_backed_services_preserve_api_data(self):
        with Session(self.engine) as session:
            player_service = PlayerService(PlayerRepository(session))
            profile = player_service.get_player("aaaaaaaddd")
            self.assertEqual(profile["games_analyzed"], 40)
            self.assertIn("median_cpl", profile["player_dna"])

            matchmaking_service = MatchmakingService(MatchmakingRepository(session))
            response = matchmaking_service.recommend("aaaaaaaddd", "most_similar", 5)
            self.assertEqual(len(response["recommendations"]), 5)
            self.assertEqual(response["recommendations"][0]["recommended_player_id"], "thebadfish")

    def test_importer_refuses_accidental_duplicate_reload(self):
        with Session(self.engine) as session:
            with self.assertRaisesRegex(RuntimeError, "--replace"):
                import_data(session)
            self.assertEqual(database_counts(session)["games"], 1200)

    def test_registered_players_are_not_counted_as_historical_cohort_data(self):
        with Session(self.engine) as session:
            player = Player(player_id="live-test-player", cohort_member=False)
            user = UserAccount(id="live-test-user", username="LiveTest", username_key="livetesting",
                               password_hash="hash", player_id=player.player_id)
            session.add_all([player, user])
            session.commit()
            self.assertEqual(database_counts(session)["players"], 30)
            self.assertEqual(verify_data(session)["players"], 30)
            session.rollback()
            with self.assertRaisesRegex(RuntimeError, "registered accounts"):
                import_data(session, replace=True)


if __name__ == "__main__":
    unittest.main()
