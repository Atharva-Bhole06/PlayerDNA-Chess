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

    def test_four_star_and_three_star_fallback_rules_with_actual_metrics(self):
        # Alice plays with 1 blunder and 25 cp average loss (acc = 100 * exp(-0.25) = 77.88% -> 4 stars)
        # Bob plays with 3 blunders and 60 cp average loss (acc = 100 * exp(-0.6) = 54.88% -> falls back to 3 stars)
        ply_counter = [0]
        def evaluate(fen, uci):
            ply_counter[0] += 1
            board = chess.Board(fen)
            move = chess.Move.from_uci(uci)
            is_white = board.turn == chess.WHITE
            if is_white:
                # White: 7 best moves (cpl=0), 1 blunder at ply 15 (cpl=200) -> avg CPL = 200/8 = 25, acc ~ 77.9%, blunders=1
                is_blunder = (ply_counter[0] == 15)
                cpl = 200 if is_blunder else 0
                cls = "blunder" if is_blunder else "best_or_near_best"
            else:
                # Black: 3 blunders (cpl=150 each), 5 best moves (cpl=0) -> avg CPL = 450/8 = 56.25, acc ~ 57.0%, blunders=3
                is_blunder = (ply_counter[0] in (2, 4, 6))
                cpl = 150 if is_blunder else 0
                cls = "blunder" if is_blunder else "best_or_near_best"
            return {
                "best_move_uci": uci, "best_move_san": board.san(move), "played_move_san": board.san(move),
                "best_score_cp": 50, "best_score_mate": None, "played_score_cp": 50 - cpl,
                "played_score_mate": None, "cpl": cpl, "best_move_agreement": cpl == 0,
                "classification": cls, "depth": 10, "analysis_time_ms": 1,
            }

        self.assertEqual(process_game_analysis(self.session, self.game.id, evaluate), "completed")
        alice_rep = self.session.get(PlayerGameReport, (self.game.id, self.alice.id))
        bob_rep = self.session.get(PlayerGameReport, (self.game.id, self.bob.id))

        # Alice: accuracy ~ 77.9% >= 75 and blunders == 1 -> qualifies for 4 stars
        self.assertEqual(alice_rep.stars, 4)
        self.assertEqual(alice_rep.blunders, 1)
        self.assertAlmostEqual(alice_rep.average_cpl, 25.0, places=1)
        self.assertIn("4 stars", alice_rep.star_reason)

        # Bob: accuracy ~ 57.0% < 75 and blunders == 3 -> falls back to 3 stars
        self.assertEqual(bob_rep.stars, 3)
        self.assertEqual(bob_rep.blunders, 3)
        self.assertAlmostEqual(bob_rep.average_cpl, 56.25, places=1)
        self.assertIn("3 stars", bob_rep.star_reason)

    def test_forced_mate_moves_are_excluded_from_cp_averaging_and_track_events(self):
        # Position with mate evaluations: cpl is None on mate plies
        ply_counter = [0]
        def evaluate(fen, uci):
            ply_counter[0] += 1
            board = chess.Board(fen)
            move = chess.Move.from_uci(uci)
            if ply_counter[0] == 1:
                # White missed a mate in 2
                return {
                    "best_move_uci": "d2d4", "best_move_san": "d4", "played_move_san": board.san(move),
                    "best_score_cp": None, "best_score_mate": 2, "played_score_cp": 100,
                    "played_score_mate": None, "cpl": None, "best_move_agreement": False,
                    "classification": "missed_forced_mate", "depth": 10, "analysis_time_ms": 1,
                }
            if ply_counter[0] == 2:
                # Black allowed a mate in 1
                return {
                    "best_move_uci": "e7e5", "best_move_san": "e5", "played_move_san": board.san(move),
                    "best_score_cp": -50, "best_score_mate": None, "played_score_cp": None,
                    "played_score_mate": -1, "cpl": None, "best_move_agreement": False,
                    "classification": "allowed_forced_mate", "depth": 10, "analysis_time_ms": 1,
                }
            # All other moves are best moves with 0 cpl
            return {
                "best_move_uci": uci, "best_move_san": board.san(move), "played_move_san": board.san(move),
                "best_score_cp": 20, "best_score_mate": None, "played_score_cp": 20,
                "played_score_mate": None, "cpl": 0, "best_move_agreement": True,
                "classification": "best_or_near_best", "depth": 10, "analysis_time_ms": 1,
            }

        self.assertEqual(process_game_analysis(self.session, self.game.id, evaluate), "completed")
        alice_rep = self.session.get(PlayerGameReport, (self.game.id, self.alice.id))
        bob_rep = self.session.get(PlayerGameReport, (self.game.id, self.bob.id))

        # Alice had 1 mate ply (cpl=None), so only 7 cp-evaluable moves
        self.assertEqual(alice_rep.cp_evaluable_moves, 7)
        self.assertEqual(alice_rep.moves_analyzed, 8)
        # Because cp_evaluable_moves < 8 (MIN_CP_MOVES_FOR_STARS), stars must be None!
        self.assertIsNone(alice_rep.stars)
        self.assertIn("at least 8 centipawn-evaluable moves are required", alice_rep.star_reason)
        # Mate event tracked
        self.assertEqual(alice_rep.mate_events["missed_forced_mate"], 1)

        # Bob had 1 allowed mate ply (cpl=None), so 7 cp-evaluable moves
        self.assertEqual(bob_rep.cp_evaluable_moves, 7)
        self.assertIsNone(bob_rep.stars)
        self.assertEqual(bob_rep.mate_events["allowed_forced_mate"], 1)


if __name__ == "__main__":
    unittest.main()
