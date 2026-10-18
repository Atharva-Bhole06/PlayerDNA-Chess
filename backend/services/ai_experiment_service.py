"""Service executing reproducible AI-vs-AI Stockfish experiments."""

from __future__ import annotations

import logging
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import chess
import chess.engine
import chess.pgn
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import AIExperiment
from backend.db.session import get_engine
from backend.services.chess_service import chess_service

logger = logging.getLogger(__name__)

STOCKFISH_PRESETS: dict[str, dict[str, Any]] = {
    "novice": {
        "name": "Novice Preset",
        "description": "Skill Level 3, max depth 5, 60ms move time. Casual play benchmark.",
        "skill_level": 3,
        "depth": 5,
        "movetime_ms": 60,
        "threads": 1,
        "hash_mb": 16,
    },
    "intermediate": {
        "name": "Intermediate Preset",
        "description": "Skill Level 10, max depth 8, 100ms move time. Club-level benchmark.",
        "skill_level": 10,
        "depth": 8,
        "movetime_ms": 100,
        "threads": 1,
        "hash_mb": 32,
    },
    "master": {
        "name": "Master Preset",
        "description": "Skill Level 20, max depth 12, 150ms move time. High tactical accuracy.",
        "skill_level": 20,
        "depth": 12,
        "movetime_ms": 150,
        "threads": 1,
        "hash_mb": 64,
    },
}


def get_engine_path() -> str:
    configured = os.environ.get("STOCKFISH_PATH") or chess_service.engine_path
    if configured and Path(configured).is_file():
        return str(Path(configured).resolve())
    discovered = shutil.which("stockfish")
    if discovered:
        return discovered
    raise RuntimeError("Stockfish executable not found. Configure STOCKFISH_PATH.")


def create_experiment(
    session: Session,
    name: str,
    white_preset: str,
    black_preset: str,
    user_id: str | None = None,
) -> AIExperiment:
    if white_preset not in STOCKFISH_PRESETS:
        raise ValueError(f"Invalid white preset '{white_preset}'. Choose from {list(STOCKFISH_PRESETS.keys())}")
    if black_preset not in STOCKFISH_PRESETS:
        raise ValueError(f"Invalid black preset '{black_preset}'. Choose from {list(STOCKFISH_PRESETS.keys())}")

    white_config = STOCKFISH_PRESETS[white_preset]
    black_config = STOCKFISH_PRESETS[black_preset]

    experiment = AIExperiment(
        id=str(uuid.uuid4()),
        name=name.strip() or f"{white_config['name']} vs {black_config['name']}",
        white_preset=white_preset,
        black_preset=black_preset,
        white_config=white_config,
        black_config=black_config,
        games_total=1,
        status="queued",
        created_by_user_id=user_id,
    )
    session.add(experiment)
    session.commit()
    return experiment


def execute_experiment(experiment_id: str) -> None:
    """Run the experiment game using two concurrent Stockfish engine instances."""
    with Session(get_engine()) as session:
        exp = session.get(AIExperiment, experiment_id)
        if exp is None or exp.status in ("completed", "failed", "cancelled"):
            return
        exp.status = "running"
        exp.started_at = datetime.now(timezone.utc)
        exp.error_message = None
        session.commit()

        white_cfg = exp.white_config
        black_cfg = exp.black_config

    engine_white = None
    engine_black = None
    board = chess.Board()

    try:
        path = get_engine_path()
        engine_white = chess.engine.SimpleEngine.popen_uci(path, timeout=15.0)
        engine_white.configure({
            "Skill Level": white_cfg["skill_level"],
            "Threads": white_cfg.get("threads", 1),
            "Hash": white_cfg.get("hash_mb", 16),
        })

        engine_black = chess.engine.SimpleEngine.popen_uci(path, timeout=15.0)
        engine_black.configure({
            "Skill Level": black_cfg["skill_level"],
            "Threads": black_cfg.get("threads", 1),
            "Hash": black_cfg.get("hash_mb", 16),
        })

        limit_white = chess.engine.Limit(
            depth=white_cfg["depth"],
            time=white_cfg["movetime_ms"] / 1000.0,
        )
        limit_black = chess.engine.Limit(
            depth=black_cfg["depth"],
            time=black_cfg["movetime_ms"] / 1000.0,
        )

        max_plies = 150
        while not board.is_game_over(claim_draw=True) and board.ply() < max_plies:
            active_engine = engine_white if board.turn == chess.WHITE else engine_black
            active_limit = limit_white if board.turn == chess.WHITE else limit_black

            play_res = active_engine.play(board, active_limit)
            if play_res.move is None or play_res.move not in board.legal_moves:
                break
            board.push(play_res.move)

        # Build outcome
        if board.is_checkmate():
            result = "1-0" if board.turn == chess.BLACK else "0-1"
            term = "checkmate"
            white_wins = 1 if result == "1-0" else 0
            black_wins = 1 if result == "0-1" else 0
            draws = 0
        elif board.is_stalemate():
            result = "1/2-1/2"
            term = "stalemate"
            white_wins = 0
            black_wins = 0
            draws = 1
        elif board.is_threefold_repetition():
            result = "1/2-1/2"
            term = "threefold_repetition"
            white_wins = 0
            black_wins = 0
            draws = 1
        elif board.is_insufficient_material():
            result = "1/2-1/2"
            term = "insufficient_material"
            white_wins = 0
            black_wins = 0
            draws = 1
        elif board.is_fifty_moves():
            result = "1/2-1/2"
            term = "fifty_move_rule"
            white_wins = 0
            black_wins = 0
            draws = 1
        else:
            result = "1/2-1/2"
            term = "move_limit_draw"
            white_wins = 0
            black_wins = 0
            draws = 1

        game_pgn = chess.pgn.Game.from_board(board)
        game_pgn.headers["Event"] = f"AI Arena: {white_cfg['name']} vs {black_cfg['name']}"
        game_pgn.headers["Site"] = "PlayerDNA Research Portal"
        game_pgn.headers["Date"] = datetime.now(timezone.utc).strftime("%Y.%m.%d")
        game_pgn.headers["White"] = f"Stockfish ({white_cfg['name']})"
        game_pgn.headers["Black"] = f"Stockfish ({black_cfg['name']})"
        game_pgn.headers["Result"] = result
        game_pgn.headers["Termination"] = term

        pgn_text = str(game_pgn)

        with Session(get_engine()) as session:
            exp = session.get(AIExperiment, experiment_id)
            if exp is not None:
                exp.status = "completed"
                exp.white_wins = white_wins
                exp.black_wins = black_wins
                exp.draws = draws
                exp.pgn = pgn_text
                exp.final_fen = board.fen()
                exp.termination = term
                exp.completed_at = datetime.now(timezone.utc)
                session.commit()

    except Exception as exc:
        logger.exception("AI experiment run failed: %s", exc)
        with Session(get_engine()) as session:
            exp = session.get(AIExperiment, experiment_id)
            if exp is not None:
                exp.status = "failed"
                exp.error_message = str(exc)
                exp.completed_at = datetime.now(timezone.utc)
                session.commit()

    finally:
        if engine_white is not None:
            try:
                engine_white.quit()
            except Exception:
                pass
        if engine_black is not None:
            try:
                engine_black.quit()
            except Exception:
                pass


def run_experiment_async(experiment_id: str) -> None:
    thread = threading.Thread(target=execute_experiment, args=(experiment_id,), daemon=True)
    thread.start()


def cancel_experiment(session: Session, experiment_id: str) -> AIExperiment:
    exp = session.get(AIExperiment, experiment_id)
    if exp is None:
        raise ValueError("Experiment not found")
    if exp.status in ("completed", "failed"):
        raise ValueError(f"Cannot cancel experiment in '{exp.status}' state")
    exp.status = "cancelled"
    exp.completed_at = datetime.now(timezone.utc)
    session.commit()
    return exp
