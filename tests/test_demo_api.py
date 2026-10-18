import unittest
from fastapi.testclient import TestClient
from backend.main import app


from tests.database_support import configure_test_database


class DemoApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous_dependency_overrides = app.dependency_overrides.copy()
        configure_test_database()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        app.dependency_overrides.update(cls.previous_dependency_overrides)

    def setUp(self):
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)

    def test_demo_overview_returns_complete_payload(self):
        response = self.client.get("/api/demo/overview")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Check sample game
        self.assertIn("sample_game", data)
        sample = data["sample_game"]
        self.assertEqual(sample["game_id"], "demo-opera-game-1858")
        self.assertEqual(len(sample["moves"]), 33)
        self.assertEqual(sample["result"], "1-0")
        self.assertGreater(sample["accuracy_pct"], 0)
        self.assertIn("important_moments", sample)
        self.assertGreater(len(sample["important_moments"]), 4)

        # Check move analysis structure
        first_move = sample["moves"][0]
        self.assertEqual(first_move["played_san"], "e4")
        self.assertIn("fen_before", first_move)
        self.assertIn("fen_after", first_move)
        self.assertIn("classification", first_move)

        # Check player profile
        self.assertIn("player_profile", data)
        profile = data["player_profile"]
        self.assertIn("current_rating", profile)
        self.assertIn("is_provisional", profile)
        self.assertIn("initial_rating_explanation", profile)

        # Check model status
        self.assertIn("model_status", data)
        model = data["model_status"]
        self.assertIn("is_model_trained", model)
        self.assertEqual(model["min_users_required"], 10)
        self.assertEqual(model["min_analyzed_games_per_user"], 3)
        self.assertIn("components_summary", model)
        self.assertEqual(len(model["components_summary"]), 5)

        # Check elo formula info
        self.assertIn("elo_formula_info", data)
        elo = data["elo_formula_info"]
        self.assertEqual(elo["k_factor"], 32)
        self.assertIn("formula", elo)

        # Check workflow steps
        self.assertIn("system_workflow_steps", data)
        self.assertEqual(len(data["system_workflow_steps"]), 6)


if __name__ == "__main__":
    unittest.main()
