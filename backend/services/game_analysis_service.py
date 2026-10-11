"""Idempotent post-game Stockfish processing and explainable reports."""

import logging
import math
import statistics
from datetime import datetime, timezone

import chess
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import (
    GameAnalysisJob, LiveGame, LiveGameMove, LiveMoveAnalysis, LivePlayerDNAHistory,
    PlayerGameReport, UserAccount,
)


logger = logging.getLogger(__name__)
ANALYSIS_VERSION = "stockfish_live_v1"
STAR_VERSION = "performance_stars_v1"
MIN_CP_MOVES_FOR_STARS = 8
ACCURACY_FORMULA = "100 * exp(-average_cpl / 100); engine-depth estimate, not a universal playing-strength probability"


def _make_report(game: LiveGame, user: UserAccount, opponent: UserAccount,
                 analyses: list[LiveMoveAnalysis], moves_by_ply: dict[int, LiveGameMove]) -> dict:
    own = [row for row in analyses if row.user_id == user.id]
    cp_rows = [row for row in own if row.cpl is not None]
    average_cpl = sum(row.cpl for row in cp_rows) / len(cp_rows) if cp_rows else None
    accuracy = 100 * math.exp(-average_cpl / 100) if average_cpl is not None else None
    blunders = sum(row.classification == "blunder" for row in own)
    mistakes = sum(row.classification == "mistake" for row in own)
    inaccuracies = sum(row.classification == "inaccuracy" for row in own)
    agreement = (100 * sum(row.best_move_agreement for row in own) / len(own)) if own else None
    events = {name: sum(row.classification == name for row in own) for name in (
        "missed_forced_mate", "allowed_forced_mate", "mate_score_changed", "mate_outcome_preserved")
    }
    if accuracy is None or len(cp_rows) < MIN_CP_MOVES_FOR_STARS:
        stars = None
        star_reason = f"Unavailable: at least {MIN_CP_MOVES_FOR_STARS} centipawn-evaluable moves are required."
    elif accuracy >= 90 and blunders == 0:
        stars = 5
        star_reason = f"5 stars: estimated accuracy {accuracy:.1f}% and no engine-defined blunders."
    elif accuracy >= 75 and blunders <= 1:
        stars = 4
        star_reason = f"4 stars: estimated accuracy {accuracy:.1f}% with {blunders} engine-defined blunders."
    else:
        stars = 3
        star_reason = f"3 stars: estimated accuracy {accuracy:.1f}%; {blunders} blunders, {mistakes} mistakes, {inaccuracies} inaccuracies."
    critical = []
    for row in sorted((item for item in own if item.cpl is not None and item.cpl >= 50), key=lambda item: (-item.cpl, item.ply_number))[:5]:
        move = moves_by_ply[row.ply_number]
        critical.append({"ply": row.ply_number, "played_move": move.san,
                         "best_move": row.best_move_san, "cpl": row.cpl,
                         "classification": row.classification})
    recommendations = []
    if blunders:
        recommendations.append(f"Review the {blunders} move(s) classified as blunders; the report lists the largest losses.")
    if events["missed_forced_mate"]:
        recommendations.append(f"Review {events['missed_forced_mate']} missed forced-mate opportunity/opportunities found by the engine.")
    if inaccuracies + mistakes:
        recommendations.append("Before committing, check forcing captures, checks, and threats for both sides.")
    if not cp_rows:
        recommendations.append("This game has no centipawn-evaluable moves; play additional games for a comparable accuracy estimate.")
    recommendations.append("Engine evaluations depend on search depth and are estimates, not ground truth.")
    is_white = user.id == game.white_user_id
    return {
        "game_id": game.id, "user_id": user.id, "moves_analyzed": len(own),
        "cp_evaluable_moves": len(cp_rows), "average_cpl": average_cpl,
        "blunders": blunders, "mistakes": mistakes, "inaccuracies": inaccuracies,
        "best_move_agreement_pct": agreement, "accuracy_pct": accuracy,
        "stars": stars, "star_reason": star_reason, "performance_version": STAR_VERSION,
        "mate_events": events, "critical_moves": critical,
        "recommendations": recommendations,
    }


def process_game_analysis(session: Session, game_id: str, analyze_move, engine_name: str = "Stockfish") -> str:
    job = session.get(GameAnalysisJob, game_id)
    game = session.get(LiveGame, game_id)
    if job is None or game is None or game.status != "completed":
        return "missing"
    if job.status == "completed":
        return "completed"
    moves = session.scalars(select(LiveGameMove).where(LiveGameMove.game_id == game_id).order_by(LiveGameMove.ply_number)).all()
    previous = session.scalars(select(LiveMoveAnalysis).where(LiveMoveAnalysis.game_id == game_id)).all()
    analyzed = {row.ply_number: row for row in previous}
    board = chess.Board()
    for index, move in enumerate(moves, start=1):
        if move.ply_number != index or move.fen_before != board.fen():
            job.status = "failed"
            job.error_message = "Saved move history failed replay validation."
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            return "failed"
        try:
            parsed = chess.Move.from_uci(move.uci)
            if parsed not in board.legal_moves:
                raise ValueError("illegal saved move")
            if move.ply_number not in analyzed:
                values = analyze_move(move.fen_before, move.uci)
                result = values.get("classification")
                if values.get("best_score_mate") is not None and values["best_score_mate"] > 0 and (
                    values.get("played_score_mate") is None or values["played_score_mate"] <= 0
                ):
                    result = "missed_forced_mate"
                elif values.get("played_score_mate") is not None and values["played_score_mate"] < 0 and (
                    values.get("best_score_mate") is None or values["best_score_mate"] >= 0
                ):
                    result = "allowed_forced_mate"
                elif values.get("best_score_mate") is not None or values.get("played_score_mate") is not None:
                    result = "mate_outcome_preserved" if values.get("best_score_mate") == values.get("played_score_mate") else "mate_score_changed"
                record = LiveMoveAnalysis(
                    game_id=game_id, ply_number=move.ply_number, user_id=move.user_id,
                    best_move_uci=values["best_move_uci"], best_move_san=values["best_move_san"],
                    played_move_san=values["played_move_san"], best_score_cp=values.get("best_score_cp"),
                    best_score_mate=values.get("best_score_mate"), played_score_cp=values.get("played_score_cp"),
                    played_score_mate=values.get("played_score_mate"), cpl=values.get("cpl"),
                    best_move_agreement=bool(values["best_move_agreement"]), classification=result or "mate_evaluation",
                    engine_depth=int(values.get("depth") or 10), engine_name=engine_name,
                    analysis_time_ms=float(values.get("analysis_time_ms") or 0),
                )
                session.add(record)
                session.commit()
                analyzed[move.ply_number] = record
            board.push(parsed)
        except Exception as exc:
            logger.exception("Game analysis failed for %s at ply %s", game_id, move.ply_number)
            session.rollback()
            job = session.get(GameAnalysisJob, game_id)
            if job is None:
                return "failed"
            job.status = "failed"
            job.error_message = "Stockfish analysis failed; no performance report is available."
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            return "failed"

    analyses = list(analyzed.values())
    moves_by_ply = {move.ply_number: move for move in moves}
    for user_id, opponent_id in ((game.white_user_id, game.black_user_id), (game.black_user_id, game.white_user_id)):
        user = session.get(UserAccount, user_id)
        opponent = session.get(UserAccount, opponent_id)
        report_data = _make_report(game, user, opponent, analyses, moves_by_ply)
        session.merge(PlayerGameReport(**report_data))
    job = session.get(GameAnalysisJob, game_id)
    job.status = "completed"
    job.error_message = None
    job.completed_at = datetime.now(timezone.utc)
    session.flush()
    _snapshot_live_dna(session, game, game.white_user_id)
    _snapshot_live_dna(session, game, game.black_user_id)
    session.commit()
    return "completed"


def _snapshot_live_dna(session: Session, game: LiveGame, user_id: str) -> None:
    if session.get(LivePlayerDNAHistory, (user_id, game.id)) is not None:
        return
    rows = session.scalars(select(LiveMoveAnalysis).join(
        GameAnalysisJob, GameAnalysisJob.game_id == LiveMoveAnalysis.game_id,
    ).where(LiveMoveAnalysis.user_id == user_id, GameAnalysisJob.status == "completed")).all()
    cp = [row.cpl for row in rows if row.cpl is not None]
    if not cp:
        return
    inaccurate = sum(row.classification == "inaccuracy" for row in rows)
    game_count = len({row.game_id for row in rows})
    session.add(LivePlayerDNAHistory(
        user_id=user_id, game_id=game.id, games_analyzed=game_count,
        median_cpl=float(statistics.median(cp)),
        cpl_std=float(statistics.pstdev(cp)) if len(cp) > 1 else 0.0,
        inaccuracies_per_100_cp_moves=100.0 * inaccurate / len(cp),
        feature_version="live_dna_raw_v1",
    ))
