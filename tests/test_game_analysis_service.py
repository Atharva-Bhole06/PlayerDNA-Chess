import unittest
import uuid

import chess
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.models import GameAnalysisJob, LiveGame, LiveGameMove, LiveMoveAnalysis, LivePlayerDNAHistory, Player, PlayerGameReport, UserAccount
from backend.services.game_analysis_service import process_game_analysis


class GameAnalysisServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.alice = self._user("Alice")
        self.bob = self._user("Bob")
        self.game = LiveGame(id=str(uuid.uuid4()), white_user_id=self.alice.id, black_user_id=self.bob.id,
                             white_rating_at_start=1200, black_rating_at_start=1200, status="completed",
                             current_fen="", pgn="", result="1-0", termination="resignation",
                             white_time_ms=100_000, black_time_ms=200_000)
        self.session.add(self.game)
        self.session.flush()
        self.session.add(GameAnalysisJob(game_id=self.game.id, status="queued"))
        board = chess.Board()
        sequence = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3", "f8c5",
                    "c2c3", "d7d6", "e1g1", "e8g8", "h2h3", "a7a6", "f1e1", "c5b6"]
        for ply, uci in enumerate(sequence, start=1):
            move = chess.Move.from_uci(uci)
            user_id = self.alice.id if board.turn == chess.WHITE else self.bob.id
            san, before = board.san(move), board.fen()
            board.push(move)
            self.session.add(LiveGameMove(game_id=self.game.id, ply_number=ply, user_id=user_id,
                                          uci=uci, san=san, fen_before=before, fen_after=board.fen()))
        self.game.current_fen = board.fen()
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _user(self, username):
        player_id = f"live-{uuid.uuid4()}"
        user = UserAccount(id=str(uuid.uuid4()), username=username, username_key=username.casefold(),
                           password_hash="test", player_id=player_id, rating=1200)
        self.session.add_all([Player(player_id=player_id, cohort_member=False), user])
        self.session.flush()
        return user

    def test_engine_features_generate_deterministic_stars_and_idempotent_reports(self):
        calls = []
        def evaluate(fen, uci):
            calls.append((fen, uci))
            board = chess.Board(fen)
            move = chess.Move.from_uci(uci)
            return {"best_move_uci": uci, "best_move_san": board.san(move), "played_move_san": board.san(move),
                    "best_score_cp": 0, "best_score_mate": None, "played_score_cp": 0,
                    "played_score_mate": None, "cpl": 0, "best_move_agreement": True,
                    "classification": "best_or_near_best", "depth": 10, "analysis_time_ms": 1}
        self.assertEqual(process_game_analysis(self.session, self.game.id, evaluate), "completed")
        alice_report = self.session.get(PlayerGameReport, (self.game.id, self.alice.id))
        self.assertEqual(alice_report.moves_analyzed, 8)
        self.assertEqual(alice_report.cp_evaluable_moves, 8)
        self.assertEqual(alice_report.accuracy_pct, 100)
        self.assertEqual(alice_report.stars, 5)
        self.assertIn("no engine-defined blunders", alice_report.star_reason)
        self.assertEqual(len(calls), 16)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(LiveMoveAnalysis)), 16)
        self.assertEqual(process_game_analysis(self.session, self.game.id, evaluate), "completed")
        self.assertEqual(len(calls), 16)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(PlayerGameReport)), 2)
        snapshots = self.session.scalars(select(LivePlayerDNAHistory).where(LivePlayerDNAHistory.game_id == self.game.id)).all()
        self.assertEqual(len(snapshots), 2)
        self.assertTrue(all(snapshot.feature_version == "live_dna_raw_v1" for snapshot in snapshots))

    def test_failed_engine_job_has_no_fabricated_report(self):
        def unavailable(_fen, _uci):
            raise RuntimeError("engine is not configured")
        self.assertEqual(process_game_analysis(self.session, self.game.id, unavailable), "failed")
        self.assertEqual(self.session.get(GameAnalysisJob, self.game.id).status, "failed")
        self.assertIsNone(self.session.get(PlayerGameReport, (self.game.id, self.alice.id)))


if __name__ == "__main__":
    unittest.main()
