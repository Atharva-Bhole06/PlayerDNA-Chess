"""Tests covering backend research authorization, RBAC enforcement, and AI experiments."""

import unittest
import uuid
from unittest.mock import MagicMock, patch

import chess
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.session import get_db
from backend.db.models import AIExperiment, LivePlayerDNAHistory, Player, PlayerDNAStyleModel, UserAccount, UserSession
from backend.main import app
from backend.routes.auth import SESSION_COOKIE
from backend.services.ai_experiment_service import (
    STOCKFISH_PRESETS,
    cancel_experiment,
    create_experiment,
    execute_experiment,
)


class ResearchSecurityAndExperimentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.client = TestClient(app)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        self.previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = override_get_db

        self.engine_patcher = patch("backend.db.session.get_engine", return_value=self.engine)
        self.exp_engine_patcher = patch("backend.services.ai_experiment_service.get_engine", return_value=self.engine)
        self.exp_path_patcher = patch("backend.services.ai_experiment_service.get_engine_path", return_value="mock_path")
        self.engine_patcher.start()
        self.exp_engine_patcher.start()
        self.exp_path_patcher.start()

        # Seed sample cohort players
        with Session(self.engine) as session:
            session.add_all([
                Player(player_id="cohort_p1", cohort_member=True),
                Player(player_id="cohort_p2", cohort_member=True),
            ])
            session.commit()

        # Create ordinary user
        self.user = self._create_user("NormalPlayer", is_admin=False)
        self.admin = self._create_user("ResearchAdmin", is_admin=True)

    def tearDown(self):
        self.exp_path_patcher.stop()
        self.exp_engine_patcher.stop()
        self.engine_patcher.stop()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.previous_overrides)
        self.engine.dispose()

    def _create_user(self, username: str, is_admin: bool = False) -> UserAccount:
        player_id = f"live-{uuid.uuid4()}"
        user_id = str(uuid.uuid4())
        with Session(self.engine) as session:
            player = Player(player_id=player_id, cohort_member=False)
            user = UserAccount(
                id=user_id,
                username=username,
                username_key=username.casefold(),
                password_hash="fakehash",
                player_id=player_id,
                rating=1200,
                is_admin=is_admin,
            )
            session.add_all([player, user])
            session.commit()
            session.refresh(user)
            session.expunge_all()
            return user

    def _create_session(self, user_id: str) -> str:
        token = f"token-{uuid.uuid4()}"
        from backend.services.auth_service import AuthService
        token_hash = AuthService._token_hash(token)
        from datetime import datetime, timedelta, timezone
        with Session(self.engine) as session:
            sess = UserSession(
                token_hash=token_hash,
                user_id=user_id,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
            session.add(sess)
            session.commit()
        return token

    def test_unauthenticated_requests_are_denied_with_401(self):
        res = self.client.get("/api/players")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authentication required", res.json()["detail"])

        res = self.client.get("/api/players/cohort_p1")
        self.assertEqual(res.status_code, 401)

        res = self.client.get("/api/matchmaking/cohort_p1")
        self.assertEqual(res.status_code, 401)

        res = self.client.get("/api/research/experiments")
        self.assertEqual(res.status_code, 401)

        res = self.client.post("/api/research/experiments", json={"white_preset": "novice", "black_preset": "master"})
        self.assertEqual(res.status_code, 401)

        res = self.client.get("/api/research/ml/status")
        self.assertEqual(res.status_code, 401)

    def test_ordinary_authenticated_player_is_forbidden_with_403(self):
        token = self._create_session(self.user.id)
        self.client.cookies.set(SESSION_COOKIE, token)

        # /api/players
        res = self.client.get("/api/players")
        self.assertEqual(res.status_code, 403)
        self.assertIn("Administrator research access required", res.json()["detail"])

        # /api/matchmaking/cohort_p1
        res = self.client.get("/api/matchmaking/cohort_p1")
        self.assertEqual(res.status_code, 403)

        # /api/research/experiments
        res = self.client.get("/api/research/experiments")
        self.assertEqual(res.status_code, 403)

        # /api/research/ml/status
        res = self.client.get("/api/research/ml/status")
        self.assertEqual(res.status_code, 403)

        # /api/auth/me confirms ordinary player is_admin is False
        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.json()["is_admin"])

    def test_administrator_is_granted_research_access(self):
        token = self._create_session(self.admin.id)
        self.client.cookies.set(SESSION_COOKIE, token)

        # /api/auth/me shows is_admin is True
        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["is_admin"])

        # /api/research/engine-presets
        presets_res = self.client.get("/api/research/engine-presets")
        self.assertEqual(presets_res.status_code, 200)
        data = presets_res.json()
        self.assertIn("novice", data)
        self.assertIn("intermediate", data)
        self.assertIn("master", data)

        # /api/research/ml/status
        ml_res = self.client.get("/api/research/ml/status")
        self.assertEqual(ml_res.status_code, 200)
        ml_data = ml_res.json()
        self.assertEqual(ml_data["status"], "insufficient_data")
        self.assertEqual(ml_data["required_users_count"], 10)
        self.assertEqual(ml_data["analyzed_users_count"], 0)

    def test_ai_experiment_creation_validation_and_cancellation(self):
        token = self._create_session(self.admin.id)
        self.client.cookies.set(SESSION_COOKIE, token)

        # Invalid preset rejected with 422
        bad_res = self.client.post(
            "/api/research/experiments",
            json={"name": "Bad Run", "white_preset": "invalid_engine", "black_preset": "master"},
        )
        self.assertEqual(bad_res.status_code, 422)

        # Valid creation
        with Session(self.engine) as session:
            exp = create_experiment(
                session=session,
                name="Test Bench",
                white_preset="novice",
                black_preset="master",
                user_id=self.admin.id,
            )
            self.assertEqual(exp.status, "queued")
            self.assertEqual(exp.white_preset, "novice")
            self.assertEqual(exp.black_preset, "master")
            self.assertIn("Skill Level", exp.white_config["description"])

            # Cancel experiment
            cancelled = cancel_experiment(session, exp.id)
            self.assertEqual(cancelled.status, "cancelled")

    def test_ai_experiment_execution_plays_moves_and_records_pgn(self):
        with Session(self.engine) as session:
            exp = create_experiment(
                session=session,
                name="Simulated Dual Match",
                white_preset="novice",
                black_preset="intermediate",
                user_id=self.admin.id,
            )
            exp_id = exp.id

        # Mock engine popen to simulate deterministic quick play
        mock_white = MagicMock()
        mock_black = MagicMock()

        # Simulate 2 moves then checkmate
        b = chess.Board()
        m1 = chess.Move.from_uci("e2e4")
        m2 = chess.Move.from_uci("e7e5")
        m3 = chess.Move.from_uci("d1h5")
        m4 = chess.Move.from_uci("b8c6")
        m5 = chess.Move.from_uci("f1c4")
        m6 = chess.Move.from_uci("g8f6")
        m7 = chess.Move.from_uci("h5f7") # scholar's checkmate!

        moves = [m1, m2, m3, m4, m5, m6, m7]
        mock_responses = [chess.engine.PlayResult(m, None) for m in moves]

        def play_side(board, limit):
            return mock_responses.pop(0)

        mock_white.play.side_effect = play_side
        mock_black.play.side_effect = play_side

        with patch("chess.engine.SimpleEngine.popen_uci") as mock_popen:
            mock_popen.side_effect = [mock_white, mock_black]
            execute_experiment(exp_id)

        with Session(self.engine) as session:
            finished = session.get(AIExperiment, exp_id)
            self.assertEqual(finished.status, "completed")
            self.assertEqual(finished.white_wins, 1)
            self.assertEqual(finished.black_wins, 0)
            self.assertEqual(finished.termination, "checkmate")
            self.assertIn("1-0", finished.pgn)
            self.assertIn("White \"Stockfish (Novice Preset)\"", finished.pgn)
            self.assertIsNotNone(finished.final_fen)


if __name__ == "__main__":
    unittest.main()
