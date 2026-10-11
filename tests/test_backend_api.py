import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from Scripts.stockfish_service import EngineAnalysisTimeoutError, EngineUnavailableError
from tests.database_support import configure_test_database
from backend.db.session import DatabaseUnavailableError, get_db


class BackendApiTests(unittest.TestCase):
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

    def test_health_and_openapi(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        self.assertIsInstance(health.json()["database_available"], bool)
        self.assertIn("stockfish_available", health.json())
        self.assertEqual(self.client.get("/openapi.json").status_code, 200)
        self.assertEqual(self.client.get("/docs").status_code, 200)

    def test_database_unconfigured_is_a_clean_service_unavailable(self):
        override = app.dependency_overrides.pop(get_db)
        def unavailable_database():
            raise DatabaseUnavailableError("private configuration detail")
        try:
            app.dependency_overrides[get_db] = unavailable_database
            response = self.client.get("/api/players")
        finally:
            app.dependency_overrides[get_db] = override
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Database is unavailable"})
        self.assertNotIn("Traceback", response.text)

    def test_player_list_and_profile(self):
        players = self.client.get("/api/players")
        self.assertEqual(players.status_code, 200)
        self.assertEqual(len(players.json()), 30)
        self.assertIn("player_id", players.json()[0])

        profile = self.client.get("/api/players/aaaaaaaddd")
        self.assertEqual(profile.status_code, 200)
        data = profile.json()
        self.assertEqual(data["player_id"], "aaaaaaaddd")
        self.assertEqual(data["games_analyzed"], 40)
        self.assertIn("median_cpl", data["player_dna"])
        self.assertIn("record", data)

    def test_unknown_and_invalid_player_ids(self):
        self.assertEqual(self.client.get("/api/players/no-such-player").status_code, 404)
        self.assertEqual(self.client.get("/api/players/%20").status_code, 422)

    def test_matchmaking_and_parameter_validation(self):
        response = self.client.get("/api/matchmaking/aaaaaaaddd?mode=most_similar&top_n=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["mode"], "most_similar")
        self.assertEqual(len(data["recommendations"]), 5)
        self.assertNotIn("aaaaaaaddd", [r["recommended_player_id"] for r in data["recommendations"]])
        self.assertIn("explanation", data["recommendations"][0])
        self.assertEqual(self.client.get("/api/matchmaking/unknown").status_code, 404)
        self.assertEqual(self.client.get("/api/matchmaking/aaaaaaaddd?mode=challenge").status_code, 422)
        self.assertEqual(self.client.get("/api/matchmaking/aaaaaaaddd?top_n=0").status_code, 422)
        self.assertEqual(self.client.get("/api/matchmaking/aaaaaaaddd?top_n=30").status_code, 422)

    def test_chess_valid_and_terminal_positions(self):
        valid = self.client.post("/api/chess/recommend", json={"fen": "startpos"})
        self.assertEqual(valid.status_code, 422)
        mocked = {
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "best_move": "e2e4", "best_move_san": "e4", "evaluation": 0.42,
            "evaluation_mate": None, "evaluation_type": "cp",
            "principal_variation": ["e4"], "depth": 10,
            "analysis_time_ms": 201.0, "terminal_reason": None,
        }
        with patch("backend.routes.chess.chess_service.analyze", return_value=mocked):
            response = self.client.post("/api/chess/recommend", json={"fen": mocked["fen"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["best_move"], "e2e4")
        self.assertEqual(response.json()["evaluation_type"], "cp")

        checkmate = "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"
        terminal = self.client.post("/api/chess/recommend", json={"fen": checkmate})
        self.assertEqual(terminal.status_code, 200)
        self.assertEqual(terminal.json()["evaluation_type"], "terminal")
        self.assertIsNone(terminal.json()["best_move"])

    def test_chess_invalid_fen_engine_unavailable_and_timeout(self):
        invalid = self.client.post("/api/chess/recommend", json={"fen": "not-fen"})
        self.assertEqual(invalid.status_code, 422)
        illegal = self.client.post(
            "/api/chess/recommend",
            json={"fen": "8/8/8/8/8/8/8/8 w - - 0 1"},
        )
        self.assertEqual(illegal.status_code, 422)
        missing_body = self.client.post("/api/chess/recommend", json={})
        self.assertEqual(missing_body.status_code, 422)

        active_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        with patch("backend.routes.chess.chess_service.analyze", side_effect=EngineUnavailableError("test engine unavailable")):
            unavailable = self.client.post("/api/chess/recommend", json={"fen": active_fen})
        self.assertEqual(unavailable.status_code, 503)
        self.assertNotIn("stockfish.exe", unavailable.text.lower())
        with patch(
            "backend.routes.chess.chess_service.analyze",
            side_effect=EngineAnalysisTimeoutError("sensitive diagnostic"),
        ):
            timed_out = self.client.post("/api/chess/recommend", json={"fen": active_fen})
        self.assertEqual(timed_out.status_code, 504)
        self.assertNotIn("sensitive diagnostic", timed_out.text)


if __name__ == "__main__":
    unittest.main()
