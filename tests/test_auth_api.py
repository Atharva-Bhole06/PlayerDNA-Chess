import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.session import get_db
from backend.main import app


class AuthApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        self.previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = override_get_db
        self.client_context = TestClient(app, base_url="https://testserver")
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.previous_overrides)
        self.engine.dispose()

    def test_registration_session_login_and_logout(self):
        created = self.client.post("/api/auth/register", json={"username": "PlayerOne", "password": "a-long-password"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["rating"], 1200)
        self.assertIn("httponly", created.headers["set-cookie"].lower())
        self.assertEqual(self.client.get("/api/auth/me").json()["username"], "PlayerOne")
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "playerone", "password": "another-long-password"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        invalid = self.client.post("/api/auth/login", json={"username": "PlayerOne", "password": "wrong-password"})
        self.assertEqual(invalid.status_code, 401)
        signed_in = self.client.post("/api/auth/login", json={"username": "PlayerOne", "password": "a-long-password"})
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_authenticated_queue_pairs_users_and_restores_game_state(self):
        other = TestClient(app, base_url="https://testserver")
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "QueueA", "password": "a-long-password"}).status_code, 201)
        self.assertEqual(other.post("/api/auth/register", json={"username": "QueueB", "password": "another-long-password"}).status_code, 201)
        self.assertEqual(self.client.post("/api/matchmaking/queue").json()["status"], "waiting")
        self.assertEqual(self.client.get("/api/matchmaking/queue").json()["status"], "waiting")
        matched = other.post("/api/matchmaking/queue").json()
        self.assertEqual(matched["status"], "matched")
        self.assertTrue(matched["game_id"])
        restored = self.client.get(f"/api/games/{matched['game_id']}")
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json()["status"], "active")
        self.assertEqual(restored.json()["ply_count"], 0)
        ranking = self.client.get("/api/leaderboard").json()
        self.assertEqual([entry["username"] for entry in ranking], ["QueueA", "QueueB"])
        self.assertEqual(self.client.get("/api/profiles/QueueA").json()["rating"], 1200)
        self.assertEqual(self.client.get("/api/games/unknown-game").status_code, 404)
        intruder = TestClient(app, base_url="https://testserver")
        intruder.post("/api/auth/register", json={"username": "Intruder", "password": "a-long-password"})
        self.assertEqual(intruder.get(f"/api/games/{matched['game_id']}").status_code, 403)

    def test_websocket_moves_finalize_once_and_report_stays_queued_without_worker(self):
        other = TestClient(app, base_url="https://testserver")
        self.client.post("/api/auth/register", json={"username": "SocketA", "password": "a-long-password"})
        other.post("/api/auth/register", json={"username": "SocketB", "password": "another-long-password"})
        self.client.post("/api/matchmaking/queue")
        pairing = other.post("/api/matchmaking/queue").json()
        game_id = pairing["game_id"]
        initial = self.client.get(f"/api/games/{game_id}").json()
        white_client, black_client = (self.client, other) if initial["color"] == "white" else (other, self.client)

        with patch("backend.routes.live_games.CORS_ORIGINS", ("https://testserver",)), \
             patch("backend.routes.live_games.get_engine", return_value=self.engine):
            with white_client.websocket_connect(f"/api/games/{game_id}/ws", headers={"origin": "https://testserver"}) as white_ws, \
                 black_client.websocket_connect(f"/api/games/{game_id}/ws", headers={"origin": "https://testserver"}) as black_ws:
                self.assertEqual(white_ws.receive_json()["type"], "state")
                self.assertEqual(black_ws.receive_json()["type"], "state")
                moves = [(white_ws, "e2e4", 0), (black_ws, "e7e5", 1),
                         (white_ws, "g1f3", 2), (black_ws, "b8c6", 3),
                         (white_ws, "f1c4", 4), (black_ws, "g8f6", 5),
                         (white_ws, "d2d3", 6), (black_ws, "f8c5", 7),
                         (white_ws, "c2c3", 8), (black_ws, "d7d6", 9),
                         (white_ws, "e1g1", 10), (black_ws, "e8g8", 11),
                         (white_ws, "h2h3", 12), (black_ws, "a7a6", 13),
                         (white_ws, "f1e1", 14), (black_ws, "c5b6", 15)]
                for socket, uci, ply in moves:
                    socket.send_json({"type": "move", "uci": uci, "expected_ply": ply})
                    event = socket.receive_json()
                    while event.get("game", {}).get("ply_count") != ply + 1 and event.get("type") != "error":
                        event = socket.receive_json()
                    self.assertEqual(event["game"]["ply_count"], ply + 1)
                white_ws.send_json({"type": "action", "action": "resign"})
                event = white_ws.receive_json()
                while event.get("game", {}).get("status") != "completed":
                    event = white_ws.receive_json()
                self.assertEqual(event["game"]["termination"], "resignation")

        report = self.client.get(f"/api/games/{game_id}/report")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.json()["analysis_status"], "queued")
        self.assertIsNone(report.json()["accuracy_pct"])
        recent = self.client.get("/api/account/games").json()
        self.assertEqual(recent[0]["analysis_status"], "queued")
        self.assertIsNone(recent[0]["stars"])


if __name__ == "__main__":
    unittest.main()
