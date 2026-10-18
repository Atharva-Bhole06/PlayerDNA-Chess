import unittest

import chess
import chess.engine

from Scripts.stockfish_service import (
    EngineUnavailableError,
    InvalidPositionError,
    StockfishService,
)


class FakeEngine:
    def __init__(self, move=None, score=None, played_score=None):
        self.move = move
        self.score = score or chess.engine.PovScore(chess.engine.Cp(42), chess.WHITE)
        self.played_score = played_score
        self.calls = 0
        self.quitted = False
        self.options = None

    def configure(self, options):
        self.options = options

    def analyse(self, board, _limit, **kwargs):
        self.calls += 1
        roots = kwargs.get("root_moves")
        move = roots[0] if roots else self.move or next(iter(board.legal_moves))
        score = self.played_score if roots and self.played_score else self.score
        return {"pv": [move], "score": score, "depth": 10}

    def quit(self):
        self.quitted = True


class StockfishServiceTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeEngine()
        self.service = StockfishService(
            engine_path="fake-stockfish",
            engine_factory=lambda _path: self.fake,
        )

    def tearDown(self):
        self.service.close()

    def test_starting_and_opening_positions_return_legal_moves(self):
        boards = [
            chess.Board(),
            chess.Board("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
        ]
        for board in boards:
            with self.subTest(fen=board.fen()):
                result = self.service.analyze(board.fen())
                self.assertIn(chess.Move.from_uci(result["best_move"]), board.legal_moves)
                self.assertEqual(result["evaluation_type"], "cp")
                self.assertEqual(result["evaluation"], 0.42)
                self.assertIsNone(result["evaluation_mate"])
                self.assertTrue(result["best_move_san"])

    def test_tactical_and_check_positions_are_analyzed(self):
        tactical = chess.Board("r1bq1rk1/ppp2ppp/2n1pn2/2b1N3/2B1P3/2P2N2/PP3PPP/RNBQR1K1 w - - 0 1")
        in_check = chess.Board("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1")
        for board in (tactical, in_check):
            if board.is_check():
                self.assertTrue(board.is_check())
            result = self.service.analyze(board.fen())
            self.assertIn(chess.Move.from_uci(result["best_move"]), board.legal_moves)

    def test_mate_score_is_separate_from_centipawns(self):
        self.fake.score = chess.engine.PovScore(chess.engine.Mate(3), chess.WHITE)
        result = self.service.analyze(chess.STARTING_FEN)
        self.assertEqual(result["evaluation_type"], "mate")
        self.assertIsNone(result["evaluation"])
        self.assertEqual(result["evaluation_mate"], 3)

    def test_checkmate_stalemate_and_draw_are_terminal_without_engine(self):
        terminal_fens = [
            ("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", "checkmate"),
            ("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "stalemate"),
            ("7k/8/8/8/8/8/P7/4K3 w - - 100 1", "fifty_moves"),
        ]
        for fen, reason in terminal_fens:
            result = self.service.analyze(fen)
            self.assertEqual(result["evaluation_type"], "terminal")
            self.assertIsNone(result["best_move"])
            self.assertEqual(result["terminal_reason"], reason)
        self.assertEqual(self.fake.calls, 0)

    def test_invalid_and_illegal_fens_raise_useful_errors(self):
        for fen in ("not a FEN", "8/8/8/8/8/8/8/8 w - - 0 1", "8/8/8/8/8/8/8/8 x - - 0 1"):
            with self.subTest(fen=fen):
                with self.assertRaises(InvalidPositionError):
                    self.service.analyze(fen)
        self.assertEqual(self.fake.calls, 0)

    def test_engine_is_reused_and_settings_are_bounded(self):
        self.assertEqual(self.service.engine_timeout, 20.0)
        for _ in range(3):
            self.service.analyze(chess.STARTING_FEN)
        self.assertEqual(self.fake.calls, 3)
        self.assertEqual(self.fake.options, {"Threads": 1, "Hash": 64})
        self.assertGreaterEqual(self.service.time_limit, 0.1)
        self.assertLessEqual(self.service.time_limit, 0.5)

    def test_recorded_move_analysis_compares_best_and_played_move(self):
        self.fake.move = chess.Move.from_uci("d2d4")
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(-58), chess.WHITE)
        result = self.service.analyze_move(chess.STARTING_FEN, "e2e4", depth=10)
        self.assertEqual(result["best_move_uci"], "d2d4")
        self.assertEqual(result["played_move_san"], "e4")
        self.assertEqual(result["cpl"], 100)
        self.assertEqual(result["classification"], "blunder")
        self.assertFalse(result["best_move_agreement"])
        self.assertEqual(self.fake.calls, 2)

    def test_recorded_illegal_moves_are_rejected_before_engine_use(self):
        with self.assertRaises(InvalidPositionError):
            self.service.analyze_move(chess.STARTING_FEN, "e2e5")
        self.assertEqual(self.fake.calls, 0)

    def test_failed_initialization_retries_and_reuses_successful_engine(self):
        attempts = []

        def fail_once_then_start(_path):
            attempts.append("start")
            if len(attempts) == 1:
                raise TimeoutError("simulated UCI startup timeout")
            return self.fake

        service = StockfishService(
            engine_path="fake-stockfish",
            engine_factory=fail_once_then_start,
        )
        with self.assertRaises(EngineUnavailableError):
            service.analyze(chess.STARTING_FEN)
        self.assertIsNone(service._engine)

        result = service.analyze(chess.STARTING_FEN)
        self.assertIn(chess.Move.from_uci(result["best_move"]), chess.Board().legal_moves)
        self.assertIs(service._engine, self.fake)

        service.analyze(chess.STARTING_FEN)
        self.assertEqual(attempts, ["start", "start"])
        self.assertEqual(self.fake.calls, 2)
        service.close()
        self.assertTrue(self.fake.quitted)

    def test_recorded_move_best_move_agreement_yields_zero_cpl_and_single_engine_call(self):
        self.fake.move = chess.Move.from_uci("e2e4")
        self.fake.score = chess.engine.PovScore(chess.engine.Cp(35), chess.WHITE)
        result = self.service.analyze_move(chess.STARTING_FEN, "e2e4", depth=10)
        self.assertTrue(result["best_move_agreement"])
        self.assertEqual(result["best_move_uci"], "e2e4")
        self.assertEqual(result["cpl"], 0)
        self.assertEqual(result["classification"], "best_or_near_best")
        self.assertEqual(self.fake.calls, 1)

    def test_recorded_move_black_perspective_and_inaccuracy_classification(self):
        # Position after 1. e4 (Black's turn to move)
        fen_after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        self.fake.move = chess.Move.from_uci("e7e5")
        # Best move e5 leaves Black at -29 cp (from Black's perspective)
        self.fake.score = chess.engine.PovScore(chess.engine.Cp(-29), chess.BLACK)
        # Played move d6 leaves Black at -43 cp (from Black's perspective)
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(-43), chess.BLACK)
        result = self.service.analyze_move(fen_after_e4, "d7d6", depth=10)
        self.assertFalse(result["best_move_agreement"])
        self.assertEqual(result["best_move_uci"], "e7e5")
        self.assertEqual(result["played_move_san"], "d6")
        # CPL = best_cp - played_cp = -29 - (-43) = 14
        self.assertEqual(result["cpl"], 14)
        self.assertEqual(result["classification"], "inaccuracy")
        self.assertGreaterEqual(result["cpl"], 0)

    def test_recorded_move_mistake_and_blunder_thresholds(self):
        # Inaccuracy: CPL > 10 and < 50
        # Mistake: CPL >= 50 and < 100
        # Blunder: CPL >= 100
        self.fake.move = chess.Move.from_uci("d2d4")
        self.fake.score = chess.engine.PovScore(chess.engine.Cp(40), chess.WHITE)

        # Test Mistake (CPL = 60)
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(-20), chess.WHITE)
        res_mistake = self.service.analyze_move(chess.STARTING_FEN, "e2e4", depth=10)
        self.assertEqual(res_mistake["cpl"], 60)
        self.assertEqual(res_mistake["classification"], "mistake")

        # Test Blunder (CPL = 150)
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(-110), chess.WHITE)
        res_blunder = self.service.analyze_move(chess.STARTING_FEN, "e2e4", depth=10)
        self.assertEqual(res_blunder["cpl"], 150)
        self.assertEqual(res_blunder["classification"], "blunder")

    def test_recorded_move_forced_mate_scores_exclude_cpl(self):
        self.fake.move = chess.Move.from_uci("d2d4")
        # Best move has mate in 3
        self.fake.score = chess.engine.PovScore(chess.engine.Mate(3), chess.WHITE)
        # Played move has only centipawn score 250
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(250), chess.WHITE)
        result = self.service.analyze_move(chess.STARTING_FEN, "e2e4", depth=10)
        self.assertIsNone(result["cpl"])
        self.assertEqual(result["classification"], "mate_evaluation")
        self.assertEqual(result["best_score_mate"], 3)
        self.assertIsNone(result["best_score_cp"])
        self.assertEqual(result["played_score_cp"], 250)

    def test_cpl_is_never_negative_even_with_negative_evaluations(self):
        # Black to move, both moves are in a losing position (negative cp)
        fen_black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        self.fake.move = chess.Move.from_uci("c7c5")
        self.fake.score = chess.engine.PovScore(chess.engine.Cp(-200), chess.BLACK)
        # Suppose played move evaluates slightly better by 5 cp due to search noise (-195)
        self.fake.played_score = chess.engine.PovScore(chess.engine.Cp(-195), chess.BLACK)
        result = self.service.analyze_move(fen_black, "e7e5", depth=10)
        self.assertGreaterEqual(result["cpl"], 0)
        self.assertEqual(result["cpl"], 0)


if __name__ == "__main__":
    unittest.main()
