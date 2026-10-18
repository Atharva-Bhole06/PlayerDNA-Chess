import os
import unittest
from datetime import datetime, timezone
import chess
from fastapi.testclient import TestClient

from backend.db.base import Base
from backend.db.models import (
    CompetitiveRatingHistory,
    GameAnalysisJob,
    LiveGame,
    LiveGameMove,
    LiveMoveAnalysis,
    Player,
    PlayerGameReport,
    UserAccount,
)
from backend.db.session import dispose_engine, get_engine
from backend.main import app
from backend.services.auth_service import AuthService
from sqlalchemy.orm import Session


class GameReportApiTests(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine
        from sqlalchemy.pool import StaticPool
        from backend.db.session import get_db

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

    def _create_user(self, session: Session, username: str) -> tuple[UserAccount, str]:
        auth = AuthService(session)
        user, token = auth.register(username, "Password123!")
        return user, token

    def test_report_endpoints_authorization_and_data(self):
        with Session(self.engine) as session:
            alice, token_alice = self._create_user(session, "AliceReport")
            bob, token_bob = self._create_user(session, "BobReport")
            charlie, token_charlie = self._create_user(session, "CharlieOutsider")
            alice_id = alice.id
            bob_id = bob.id

            # Game 1: Alice (White) vs Bob (Black), completed, rated
            g1 = LiveGame(
                id="game-report-1",
                white_user_id=alice_id,
                black_user_id=bob_id,
                white_rating_at_start=1200,
                black_rating_at_start=1200,
                status="completed",
                current_fen="rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                pgn="1. e4 e5",
                result="1-0",
                termination="resignation",
                finished_at=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
            )
            session.add(g1)
            session.add_all([
                CompetitiveRatingHistory(user_id=alice.id, game_id=g1.id, rating_before=1200, rating_after=1216),
                CompetitiveRatingHistory(user_id=bob.id, game_id=g1.id, rating_before=1200, rating_after=1184),
                GameAnalysisJob(game_id=g1.id, status="completed", analysis_version="stockfish_live_v1"),
                PlayerGameReport(
                    game_id=g1.id,
                    user_id=alice.id,
                    moves_analyzed=1,
                    cp_evaluable_moves=1,
                    average_cpl=15.0,
                    blunders=0,
                    mistakes=0,
                    inaccuracies=1,
                    best_move_agreement_pct=100.0,
                    accuracy_pct=86.1,
                    stars=4,
                    star_reason="4 stars: estimated accuracy 86.1% with 0 blunders",
                ),
                PlayerGameReport(
                    game_id=g1.id,
                    user_id=bob.id,
                    moves_analyzed=1,
                    cp_evaluable_moves=1,
                    average_cpl=45.0,
                    blunders=0,
                    mistakes=0,
                    inaccuracies=1,
                    best_move_agreement_pct=0.0,
                    accuracy_pct=63.8,
                    stars=3,
                    star_reason="3 stars",
                ),
                LiveGameMove(
                    game_id=g1.id,
                    ply_number=1,
                    user_id=alice.id,
                    uci="e2e4",
                    san="e4",
                    fen_before="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    fen_after="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                ),
                LiveMoveAnalysis(
                    game_id=g1.id,
                    ply_number=1,
                    user_id=alice.id,
                    best_move_uci="e2e4",
                    best_move_san="e4",
                    played_move_san="e4",
                    cpl=0,
                    best_move_agreement=True,
                    classification="best_or_near_best",
                    engine_depth=12,
                    engine_name="Stockfish",
                    analysis_time_ms=50.0,
                ),
            ])
            session.commit()

        # Charlie (not participant) should get 403
        self.client.cookies.set("playerdna_session", token_charlie)
        resp = self.client.get("/api/games/game-report-1/report")
        self.assertEqual(resp.status_code, 403)

        # Alice (White, Winner) views report
        self.client.cookies.set("playerdna_session", token_alice)
        resp_alice = self.client.get("/api/games/game-report-1/report")
        self.assertEqual(resp_alice.status_code, 200)
        data_a = resp_alice.json()
        self.assertEqual(data_a["color"], "white")
        self.assertEqual(data_a["user_won"], True)
        self.assertEqual(data_a["result_outcome"], "win")
        self.assertEqual(data_a["is_rated"], True)
        self.assertEqual(data_a["rating_change"], 16)
        self.assertEqual(data_a["stars"], 4)
        self.assertIsNotNone(data_a["opponent_report"])
        self.assertEqual(data_a["opponent_report"]["username"], "BobReport")
        self.assertEqual(data_a["opponent_report"]["accuracy_pct"], 63.8)
        self.assertIsNotNone(data_a["moves"])
        self.assertEqual(len(data_a["moves"]), 1)
        self.assertEqual(data_a["moves"][0]["played_san"], "e4")
        self.assertTrue(data_a["moves"][0]["best_move_agreement"])
        # No prior game yet -> previous_game_comparison is None
        self.assertIsNone(data_a["previous_game_comparison"])

        # Bob (Black, Loser) views report
        self.client.cookies.set("playerdna_session", token_bob)
        resp_bob = self.client.get("/api/games/game-report-1/report")
        self.assertEqual(resp_bob.status_code, 200)
        data_b = resp_bob.json()
        self.assertEqual(data_b["color"], "black")
        self.assertEqual(data_b["user_won"], False)
        self.assertEqual(data_b["result_outcome"], "loss")
        self.assertEqual(data_b["rating_change"], -16)

        # Now create Game 2 later in time for Alice to test previous game comparison
        with Session(self.engine) as session:
            g2 = LiveGame(
                id="game-report-2",
                white_user_id=alice_id,
                black_user_id=bob_id,
                white_rating_at_start=1216,
                black_rating_at_start=1184,
                status="completed",
                current_fen="rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                pgn="1. e4 e5",
                result="1-0",
                termination="checkmate",
                finished_at=datetime(2026, 1, 2, 12, 0, tzinfo=timezone.utc),
            )
            session.add(g2)
            session.add_all([
                CompetitiveRatingHistory(user_id=alice_id, game_id=g2.id, rating_before=1216, rating_after=1230),
                CompetitiveRatingHistory(user_id=bob_id, game_id=g2.id, rating_before=1184, rating_after=1170),
                GameAnalysisJob(game_id=g2.id, status="completed", analysis_version="stockfish_live_v1"),
                PlayerGameReport(
                    game_id=g2.id,
                    user_id=alice_id,
                    moves_analyzed=1,
                    cp_evaluable_moves=1,
                    average_cpl=10.0,
                    blunders=0,
                    mistakes=0,
                    inaccuracies=0,
                    best_move_agreement_pct=100.0,
                    accuracy_pct=90.5,
                    stars=5,
                    star_reason="5 stars",
                ),
            ])
            session.commit()

        # Alice views Game 2 report: should compare against Game 1
        self.client.cookies.set("playerdna_session", token_alice)
        resp_g2 = self.client.get("/api/games/game-report-2/report")
        self.assertEqual(resp_g2.status_code, 200)
        data_g2 = resp_g2.json()
        comp = data_g2["previous_game_comparison"]
        self.assertIsNotNone(comp)
        self.assertEqual(comp["previous_game_id"], "game-report-1")
        self.assertEqual(comp["accuracy_current"], 90.5)
        self.assertEqual(comp["accuracy_previous"], 86.1)
        self.assertAlmostEqual(comp["accuracy_delta"], 4.4, places=1)
        self.assertEqual(comp["average_cpl_current"], 10.0)
        self.assertEqual(comp["average_cpl_previous"], 15.0)
        self.assertAlmostEqual(comp["average_cpl_delta"], -5.0, places=1)

    def test_active_game_cannot_be_reported(self):
        with Session(self.engine) as session:
            alice, token_alice = self._create_user(session, "AliceActive")
            bob, token_bob = self._create_user(session, "BobActive")
            g = LiveGame(
                id="game-active-1",
                white_user_id=alice.id,
                black_user_id=bob.id,
                white_rating_at_start=1200,
                black_rating_at_start=1200,
                status="active",
                current_fen=chess.STARTING_FEN,
                pgn="",
            )
            session.add(g)
            session.commit()

        self.client.cookies.set("playerdna_session", token_alice)
        resp = self.client.get("/api/games/game-active-1/report")
        self.assertEqual(resp.status_code, 409)

    def test_trigger_or_retry_analysis_endpoint(self):
        with Session(self.engine) as session:
            alice, token_alice = self._create_user(session, "AliceRetry")
            bob, token_bob = self._create_user(session, "BobRetry")
            g = LiveGame(
                id="game-retry-1",
                white_user_id=alice.id,
                black_user_id=bob.id,
                white_rating_at_start=1200,
                black_rating_at_start=1200,
                status="completed",
                current_fen=chess.STARTING_FEN,
                pgn="",
                result="1-0",
                finished_at=datetime.now(timezone.utc),
            )
            session.add(g)
            job = GameAnalysisJob(game_id=g.id, status="failed", error_message="Engine failed previously")
            session.add(job)
            session.commit()

        self.client.cookies.set("playerdna_session", token_alice)
        # Calling POST /api/games/game-retry-1/analyze should reset to queued
        resp = self.client.post("/api/games/game-retry-1/analyze")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["analysis_status"], ("queued", "completed"))

    def test_historical_comparison_bypasses_un_evaluable_games(self):
        with Session(self.engine) as session:
            alice, token_alice = self._create_user(session, "AliceSkip")
            bob, token_bob = self._create_user(session, "BobSkip")
            alice_id = alice.id
            bob_id = bob.id

            # Game 1: valid analyzed game
            g1 = LiveGame(
                id="game-skip-1", white_user_id=alice_id, black_user_id=bob_id,
                white_rating_at_start=1200, black_rating_at_start=1200, status="completed",
                current_fen="", pgn="1. e4", result="1-0", termination="resignation",
                finished_at=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
            )
            session.add(g1)
            session.add_all([
                CompetitiveRatingHistory(user_id=alice_id, game_id=g1.id, rating_before=1200, rating_after=1216),
                GameAnalysisJob(game_id=g1.id, status="completed"),
                PlayerGameReport(
                    game_id=g1.id, user_id=alice_id, moves_analyzed=10, cp_evaluable_moves=10,
                    average_cpl=20.0, blunders=0, mistakes=1, inaccuracies=1,
                    best_move_agreement_pct=80.0, accuracy_pct=81.9, stars=4, star_reason="4 stars",
                ),
            ])

            # Game 2: aborted game with 0 moves, completed analysis job but null accuracy/CPL
            g2 = LiveGame(
                id="game-skip-2-aborted", white_user_id=alice_id, black_user_id=bob_id,
                white_rating_at_start=1216, black_rating_at_start=1184, status="completed",
                current_fen=chess.STARTING_FEN, pgn="", result="0-1", termination="abandoned",
                finished_at=datetime(2026, 1, 2, 12, 0, tzinfo=timezone.utc),
            )
            session.add(g2)
            session.add_all([
                GameAnalysisJob(game_id=g2.id, status="completed"),
                PlayerGameReport(
                    game_id=g2.id, user_id=alice_id, moves_analyzed=0, cp_evaluable_moves=0,
                    average_cpl=None, blunders=0, mistakes=0, inaccuracies=0,
                    best_move_agreement_pct=None, accuracy_pct=None, stars=None, star_reason=None,
                ),
            ])

            # Game 3: latest game with valid analysis
            g3 = LiveGame(
                id="game-skip-3", white_user_id=alice_id, black_user_id=bob_id,
                white_rating_at_start=1216, black_rating_at_start=1184, status="completed",
                current_fen="", pgn="1. d4", result="1-0", termination="resignation",
                finished_at=datetime(2026, 1, 3, 12, 0, tzinfo=timezone.utc),
            )
            session.add(g3)
            session.add_all([
                CompetitiveRatingHistory(user_id=alice_id, game_id=g3.id, rating_before=1216, rating_after=1230),
                GameAnalysisJob(game_id=g3.id, status="completed"),
                PlayerGameReport(
                    game_id=g3.id, user_id=alice_id, moves_analyzed=10, cp_evaluable_moves=10,
                    average_cpl=10.0, blunders=0, mistakes=0, inaccuracies=0,
                    best_move_agreement_pct=100.0, accuracy_pct=90.5, stars=5, star_reason="5 stars",
                ),
            ])
            session.commit()

        # Alice views Game 3 report: should bypass the aborted Game 2 and compare with Game 1
        self.client.cookies.set("playerdna_session", token_alice)
        resp = self.client.get("/api/games/game-skip-3/report")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        comp = data["previous_game_comparison"]
        self.assertIsNotNone(comp)
        self.assertEqual(comp["previous_game_id"], "game-skip-1")
        self.assertEqual(comp["accuracy_current"], 90.5)
        self.assertEqual(comp["accuracy_previous"], 81.9)
        self.assertAlmostEqual(comp["accuracy_delta"], 8.6, places=1)
        self.assertEqual(comp["average_cpl_current"], 10.0)
        self.assertEqual(comp["average_cpl_previous"], 20.0)
        self.assertAlmostEqual(comp["average_cpl_delta"], -10.0, places=1)
