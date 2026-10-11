"""Reusable, persistent Stockfish service for live FEN recommendations."""

from __future__ import annotations

import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any

import chess
import chess.engine


class InvalidPositionError(ValueError):
    """The submitted FEN is malformed or represents an illegal position."""


class EngineUnavailableError(RuntimeError):
    """Stockfish cannot be located or started."""


class EngineAnalysisTimeoutError(EngineUnavailableError):
    """Stockfish did not complete an analysis within its protocol timeout."""


class StockfishService:
    """Validate FENs and analyze them with one serialized UCI process.

    Defaults target interactive use: one engine thread, 64 MiB hash, and a
    200 ms search limit. The engine starts only when the first valid, active
    position is analyzed and is reused until ``close()`` is called.
    """

    def __init__(
        self,
        engine_path: str | None = None,
        time_limit: float = 0.2,
        threads: int = 1,
        hash_mb: int = 64,
        engine_factory=None,
        engine_timeout: float = 20.0,
    ):
        if time_limit <= 0 or engine_timeout <= 0:
            raise ValueError("time_limit and engine_timeout must be positive")
        if threads < 1 or hash_mb < 1:
            raise ValueError("threads and hash_mb must be positive integers")
        self.engine_path = engine_path
        self.time_limit = time_limit
        self.engine_timeout = engine_timeout
        self.threads = threads
        self.hash_mb = hash_mb
        self._engine_factory = engine_factory or (
            lambda path: chess.engine.SimpleEngine.popen_uci(
                path, timeout=self.engine_timeout
            )
        )
        self._injected_factory = engine_factory is not None
        self._engine = None
        self._lock = threading.Lock()

    def _resolve_engine_path(self) -> str:
        configured = self.engine_path or os.environ.get("STOCKFISH_PATH")
        if configured:
            if self._injected_factory:
                return configured
            candidate = Path(configured).expanduser()
            if candidate.is_file():
                return str(candidate.resolve())
            raise EngineUnavailableError(
                f"Configured Stockfish executable does not exist: {candidate}"
            )
        discovered = shutil.which("stockfish")
        if discovered:
            return discovered
        raise EngineUnavailableError(
            "Stockfish was not found. Set STOCKFISH_PATH or add stockfish to PATH."
        )

    def is_available(self) -> bool:
        """Check configuration and executable discovery without starting Stockfish."""
        try:
            self._resolve_engine_path()
            return True
        except EngineUnavailableError:
            return False

    def _get_engine(self):
        if self._engine is None:
            path = self._resolve_engine_path()
            try:
                self._engine = self._engine_factory(path)
                self._engine.configure({"Threads": self.threads, "Hash": self.hash_mb})
            except Exception as exc:
                if self._engine is not None:
                    try:
                        self._engine.quit()
                    except Exception:
                        pass
                    self._engine = None
                raise EngineUnavailableError(
                    f"Stockfish could not be started from {path}: {exc}"
                ) from exc
        return self._engine

    @staticmethod
    def _board_from_fen(fen: str) -> chess.Board:
        if not isinstance(fen, str) or not fen.strip():
            raise InvalidPositionError("fen must be a non-empty string")
        try:
            board = chess.Board(fen.strip())
        except (ValueError, TypeError) as exc:
            raise InvalidPositionError(f"Invalid FEN: {exc}") from exc
        if not board.is_valid():
            status = board.status()
            raise InvalidPositionError(
                f"Illegal chess position (python-chess status: {status})"
            )
        return board

    def analyze(self, fen: str) -> dict[str, Any]:
        """Return a legal best move or a terminal-position result.

        Evaluations are from White's point of view. ``evaluation`` is in pawns
        for ``evaluation_type == 'cp'``. Mate distance is returned separately
        in ``evaluation_mate`` and is never converted to a centipawn number.
        """
        board = self._board_from_fen(fen)
        normalized_fen = board.fen()
        if board.is_game_over(claim_draw=True):
            outcome = board.outcome(claim_draw=True)
            reason = outcome.termination.name.lower() if outcome else "game_over"
            return {
                "fen": normalized_fen,
                "best_move": None,
                "best_move_san": None,
                "evaluation": None,
                "evaluation_mate": None,
                "evaluation_type": "terminal",
                "principal_variation": [],
                "depth": None,
                "analysis_time_ms": 0.0,
                "terminal_reason": reason,
            }

        started = time.perf_counter()
        with self._lock:
            engine = self._get_engine()
            try:
                info = engine.analyse(board, chess.engine.Limit(time=self.time_limit))
            except TimeoutError as exc:
                raise EngineAnalysisTimeoutError(
                    "Stockfish did not respond before the engine timeout"
                ) from exc
            except Exception as exc:
                raise EngineUnavailableError(f"Stockfish analysis failed: {exc}") from exc
        elapsed_ms = (time.perf_counter() - started) * 1000

        pv = info.get("pv") or []
        if not pv or pv[0] not in board.legal_moves:
            raise EngineUnavailableError("Stockfish returned no legal principal variation")
        best_move = pv[0]
        score = info.get("score")
        if score is None:
            raise EngineUnavailableError("Stockfish returned no evaluation score")
        white_score = score.pov(chess.WHITE)
        if white_score.is_mate():
            evaluation_type = "mate"
            evaluation = None
            evaluation_mate = white_score.mate()
        else:
            centipawns = white_score.score()
            if centipawns is None:
                raise EngineUnavailableError("Stockfish returned an unsupported score")
            evaluation_type = "cp"
            evaluation = centipawns / 100.0
            evaluation_mate = None

        san_pv = []
        pv_board = board.copy()
        for move in pv:
            if move not in pv_board.legal_moves:
                break
            san_pv.append(pv_board.san(move))
            pv_board.push(move)

        return {
            "fen": normalized_fen,
            "best_move": best_move.uci(),
            "best_move_san": board.san(best_move),
            "evaluation": evaluation,
            "evaluation_mate": evaluation_mate,
            "evaluation_type": evaluation_type,
            "principal_variation": san_pv,
            "depth": info.get("depth"),
            "analysis_time_ms": round(elapsed_ms, 2),
            "terminal_reason": None,
        }

    def analyze_move(self, fen: str, played_uci: str, depth: int = 10) -> dict[str, Any]:
        """Compare one recorded move with the best move from the same root.

        Scores are from the side-to-move perspective. Mate evaluations remain
        separate from centipawns; CPL is only defined when both searches return
        centipawn scores.
        """
        if depth < 1 or depth > 30:
            raise ValueError("depth must be between 1 and 30")
        board = self._board_from_fen(fen)
        try:
            played = chess.Move.from_uci(played_uci)
        except ValueError as exc:
            raise InvalidPositionError("Recorded move is not valid UCI") from exc
        if played not in board.legal_moves:
            raise InvalidPositionError("Recorded move is illegal in its stored position")
        started = time.perf_counter()
        with self._lock:
            engine = self._get_engine()
            try:
                limit = chess.engine.Limit(depth=depth)
                best_info = engine.analyse(board, limit)
                played_info = engine.analyse(board, limit, root_moves=[played])
            except TimeoutError as exc:
                raise EngineAnalysisTimeoutError("Stockfish did not respond before the engine timeout") from exc
            except Exception as exc:
                raise EngineUnavailableError(f"Stockfish game analysis failed: {exc}") from exc
        best_pv = best_info.get("pv") or []
        if not best_pv or best_pv[0] not in board.legal_moves:
            raise EngineUnavailableError("Stockfish returned no legal best move")
        best_score = best_info.get("score")
        played_score = played_info.get("score")
        if best_score is None or played_score is None:
            raise EngineUnavailableError("Stockfish returned no move evaluation")
        perspective = board.turn
        best_relative = best_score.pov(perspective)
        played_relative = played_score.pov(perspective)
        best_mate = best_relative.mate() if best_relative.is_mate() else None
        played_mate = played_relative.mate() if played_relative.is_mate() else None
        best_cp = None if best_mate is not None else best_relative.score()
        played_cp = None if played_mate is not None else played_relative.score()
        cpl = max(0, best_cp - played_cp) if best_cp is not None and played_cp is not None else None
        pv_board = board.copy()
        best_san = pv_board.san(best_pv[0])
        result = {"best_move_uci": best_pv[0].uci(), "best_move_san": best_san,
                  "played_move_san": board.san(played), "best_score_cp": best_cp,
                  "best_score_mate": best_mate, "played_score_cp": played_cp,
                  "played_score_mate": played_mate, "cpl": cpl,
                  "best_move_agreement": best_pv[0] == played,
                  "depth": best_info.get("depth", depth),
                  "analysis_time_ms": round((time.perf_counter() - started) * 1000, 2)}
        if cpl is not None:
            result["classification"] = "best_or_near_best" if cpl <= 10 else "inaccuracy" if cpl < 50 else "mistake" if cpl < 100 else "blunder"
        else:
            result["classification"] = "mate_evaluation"
        return result

    def close(self) -> None:
        """Shut down the persistent engine process, if it was started."""
        with self._lock:
            if self._engine is not None:
                try:
                    self._engine.quit()
                finally:
                    self._engine = None
