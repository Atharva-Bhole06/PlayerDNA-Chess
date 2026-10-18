import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db.session import get_db, get_engine
from backend.db.models import (
    CompetitiveRatingHistory,
    GameAnalysisJob,
    LiveGame,
    LiveGameMove,
    LiveMoveAnalysis,
    PlayerGameReport,
    UserAccount,
)
from backend.config import CORS_ORIGINS
from backend.routes.auth import SESSION_COOKIE
from backend.routes.dependencies import current_user
from backend.schemas.games import GameState, MoveCommand, PerformanceReport
from backend.services.auth_service import AuthService
from backend.services.chess_service import chess_service
from backend.services.game_analysis_service import process_game_analysis
from backend.services.live_game_service import GameError, LiveGameService


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/games", tags=["multiplayer games"])


class Connections:
    def __init__(self):
        self.by_game: dict[str, dict[WebSocket, str]] = {}
        self.lock = asyncio.Lock()

    async def add(self, game_id: str, socket: WebSocket, user_id: str):
        async with self.lock:
            self.by_game.setdefault(game_id, {})[socket] = user_id

    async def remove(self, game_id: str, socket: WebSocket):
        async with self.lock:
            peers = self.by_game.get(game_id, {})
            peers.pop(socket, None)
            if not peers:
                self.by_game.pop(game_id, None)

    async def broadcast(self, game_id: str, event: str):
        async with self.lock:
            peers = list(self.by_game.get(game_id, {}).items())
            connected_users = {user_id for _, user_id in peers}
        if not peers:
            return
        states = {}
        white_user_id = None
        black_user_id = None
        with Session(get_engine()) as session:
            try:
                service = LiveGameService(session)
                game = session.get(LiveGame, game_id)
                if game:
                    white_user_id = game.white_user_id
                    black_user_id = game.black_user_id
                    for uid in connected_users:
                        states[uid] = service.state(game_id, uid, lock=False)
            finally:
                session.rollback()

        for socket, user_id in peers:
            try:
                state = states.get(user_id)
                if state:
                    opponent_id = black_user_id if user_id == white_user_id else white_user_id
                    await socket.send_json(jsonable_encoder({"type": event, "game": state,
                                            "opponent_connected": opponent_id in connected_users})
                    )
            except Exception:
                logger.debug("Unable to broadcast game state", exc_info=True)


connections = Connections()


@router.get("/{game_id}", response_model=GameState)
def get_game(game_id: str, user=Depends(current_user), session: Session = Depends(get_db)):
    return LiveGameService(session).state(game_id, user.id)


@router.get("/{game_id}/report", response_model=PerformanceReport)
def get_report(game_id: str, user=Depends(current_user), session: Session = Depends(get_db)):
    game = LiveGameService(session)._game(game_id, user.id)
    if game.status != "completed":
        raise HTTPException(status_code=409, detail="The game must finish before analysis is available")
    job = session.get(GameAnalysisJob, game_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    is_white = user.id == game.white_user_id
    user_color = "white" if is_white else "black"
    opponent_id = game.black_user_id if is_white else game.white_user_id
    opponent = session.get(UserAccount, opponent_id)
    report = session.get(PlayerGameReport, (game_id, user.id))
    move_count = session.scalar(select(func.count()).select_from(LiveGameMove).where(LiveGameMove.game_id == game_id)) or 0
    duration = max(0, int((game.finished_at - game.created_at).total_seconds())) if game.finished_at else 0

    # Perspective outcomes
    if game.result == "1/2-1/2":
        user_won = None
        result_outcome = "draw"
    elif (game.result == "1-0") == is_white:
        user_won = True
        result_outcome = "win"
    else:
        user_won = False
        result_outcome = "loss"

    # Rating progression
    user_history = session.get(CompetitiveRatingHistory, (user.id, game.id))
    is_rated = user_history is not None
    user_before = user_history.rating_before if is_rated else (game.white_rating_at_start if is_white else game.black_rating_at_start)
    user_after = user_history.rating_after if is_rated else user_before
    rating_change = (user_after - user_before) if is_rated else None

    # Opponent summary
    opponent_report = None
    if opponent is not None:
        opp_report_entity = session.get(PlayerGameReport, (game.id, opponent_id))
        opp_history = session.get(CompetitiveRatingHistory, (opponent_id, game.id))
        opp_is_white = opponent_id == game.white_user_id
        opp_before = opp_history.rating_before if opp_history else (game.white_rating_at_start if opp_is_white else game.black_rating_at_start)
        opp_after = opp_history.rating_after if opp_history else opp_before
        opp_change = (opp_after - opp_before) if opp_history else None
        opponent_report = {
            "username": opponent.username,
            "rating": opp_before,
            "rating_after": opp_after,
            "rating_change": opp_change,
            "color": "white" if opp_is_white else "black",
            "accuracy_pct": opp_report_entity.accuracy_pct if opp_report_entity else None,
            "average_cpl": opp_report_entity.average_cpl if opp_report_entity else None,
            "stars": opp_report_entity.stars if opp_report_entity else None,
            "star_reason": opp_report_entity.star_reason if opp_report_entity else None,
            "blunders": opp_report_entity.blunders if opp_report_entity else None,
            "mistakes": opp_report_entity.mistakes if opp_report_entity else None,
            "inaccuracies": opp_report_entity.inaccuracies if opp_report_entity else None,
            "best_move_agreement_pct": opp_report_entity.best_move_agreement_pct if opp_report_entity else None,
        }

    # Move-by-move analyses
    live_moves = session.scalars(
        select(LiveGameMove).where(LiveGameMove.game_id == game_id).order_by(LiveGameMove.ply_number.asc())
    ).all()
    analyses_list = session.scalars(
        select(LiveMoveAnalysis).where(LiveMoveAnalysis.game_id == game_id).order_by(LiveMoveAnalysis.ply_number.asc())
    ).all()
    analyses_by_ply = {a.ply_number: a for a in analyses_list}

    moves_data = []
    for lm in live_moves:
        an = analyses_by_ply.get(lm.ply_number)
        is_user_move = lm.user_id == user.id
        move_color = "white" if (lm.ply_number % 2 == 1) else "black"
        move_number = (lm.ply_number + 1) // 2

        explanation = None
        if an:
            if an.best_move_agreement or an.classification == "best_or_near_best":
                explanation = f"Optimal choice. Stockfish agrees with {an.played_move_san}."
            elif an.classification == "missed_forced_mate":
                mate_in = an.best_score_mate if an.best_score_mate is not None else 1
                explanation = f"Missed forced mate: {an.best_move_san} offered mate in {mate_in} move(s)."
            elif an.classification == "allowed_forced_mate":
                mate_in = abs(an.played_score_mate or 1)
                explanation = f"Allowed forced mate in {mate_in} move(s). {an.best_move_san} defended the position."
            elif an.classification == "blunder":
                explanation = f"Blunder: conceded {an.cpl} centipawns ({(an.cpl or 0)/100:.2f} pawns). Better was {an.best_move_san}."
            elif an.classification == "mistake":
                explanation = f"Mistake: conceded {an.cpl} centipawns. Stockfish preferred {an.best_move_san}."
            elif an.classification == "inaccuracy":
                explanation = f"Inaccuracy: minor concession of {an.cpl} centipawns compared to {an.best_move_san}."
            elif an.classification == "mate_outcome_preserved":
                explanation = "Maintains the forced mate sequence."
            elif an.classification == "mate_score_changed":
                explanation = f"Forced mate progression changed. Stockfish preferred {an.best_move_san}."
            else:
                explanation = f"Evaluated at depth {an.engine_depth}."

        moves_data.append({
            "ply": lm.ply_number,
            "move_number": move_number,
            "color": move_color,
            "user_id": lm.user_id,
            "is_user_move": is_user_move,
            "played_san": lm.san,
            "played_uci": lm.uci,
            "best_move_san": an.best_move_san if an else None,
            "best_move_uci": an.best_move_uci if an else None,
            "cpl": an.cpl if an else None,
            "best_move_agreement": an.best_move_agreement if an else None,
            "classification": an.classification if an else None,
            "fen_before": lm.fen_before,
            "fen_after": lm.fen_after,
            "played_score_cp": an.played_score_cp if an else None,
            "played_score_mate": an.played_score_mate if an else None,
            "best_score_cp": an.best_score_cp if an else None,
            "best_score_mate": an.best_score_mate if an else None,
            "engine_depth": an.engine_depth if an else None,
            "explanation": explanation,
        })

    # Previous eligible completed & analyzed game comparison
    current_finish = game.finished_at or game.created_at
    prev_game = session.scalar(
        select(LiveGame)
        .join(GameAnalysisJob, GameAnalysisJob.game_id == LiveGame.id)
        .join(PlayerGameReport, (PlayerGameReport.game_id == LiveGame.id) & (PlayerGameReport.user_id == user.id))
        .where(
            LiveGame.status == "completed",
            GameAnalysisJob.status == "completed",
            PlayerGameReport.accuracy_pct.isnot(None),
            PlayerGameReport.average_cpl.isnot(None),
            (LiveGame.white_user_id == user.id) | (LiveGame.black_user_id == user.id),
            LiveGame.id != game.id,
            func.coalesce(LiveGame.finished_at, LiveGame.created_at) < current_finish,
        )
        .order_by(func.coalesce(LiveGame.finished_at, LiveGame.created_at).desc(), LiveGame.id.desc())
        .limit(1)
    )

    previous_comparison = None
    if prev_game is not None and report is not None and report.accuracy_pct is not None and report.average_cpl is not None:
        prev_report = session.get(PlayerGameReport, (prev_game.id, user.id))
        if prev_report is not None and prev_report.accuracy_pct is not None and prev_report.average_cpl is not None:
            prev_opp_id = prev_game.black_user_id if user.id == prev_game.white_user_id else prev_game.white_user_id
            prev_opp = session.get(UserAccount, prev_opp_id)
            previous_comparison = {
                "previous_game_id": prev_game.id,
                "finished_at": prev_game.finished_at or prev_game.created_at,
                "opponent_username": prev_opp.username if prev_opp else "Opponent",
                "accuracy_current": report.accuracy_pct,
                "accuracy_previous": prev_report.accuracy_pct,
                "accuracy_delta": round(report.accuracy_pct - prev_report.accuracy_pct, 1),
                "average_cpl_current": report.average_cpl,
                "average_cpl_previous": prev_report.average_cpl,
                "average_cpl_delta": round(report.average_cpl - prev_report.average_cpl, 1),
                "blunders_current": report.blunders,
                "blunders_previous": prev_report.blunders,
                "blunders_delta": (report.blunders - prev_report.blunders) if (report.blunders is not None and prev_report.blunders is not None) else None,
                "mistakes_current": report.mistakes,
                "mistakes_previous": prev_report.mistakes,
                "mistakes_delta": (report.mistakes - prev_report.mistakes) if (report.mistakes is not None and prev_report.mistakes is not None) else None,
                "inaccuracies_current": report.inaccuracies,
                "inaccuracies_previous": prev_report.inaccuracies,
                "inaccuracies_delta": (report.inaccuracies - prev_report.inaccuracies) if (report.inaccuracies is not None and prev_report.inaccuracies is not None) else None,
            }

    base = {
        "game_id": game.id,
        "analysis_status": job.status,
        "result": game.result,
        "opponent_username": opponent.username if opponent else "Opponent",
        "opponent_rating": game.black_rating_at_start if is_white else game.white_rating_at_start,
        "move_count": move_count,
        "duration_seconds": duration,
        "message": (
            "Analysis is queued."
            if job.status == "queued"
            else "Analysis is processing."
            if job.status == "processing"
            else job.error_message
            if job.status == "failed"
            else None
        ),
        "color": user_color,
        "user_won": user_won,
        "result_outcome": result_outcome,
        "user_rating": user_before,
        "user_rating_after": user_after,
        "rating_change": rating_change,
        "is_rated": is_rated,
        "finished_at": game.finished_at,
        "termination": game.termination,
        "pgn": game.pgn,
        "current_fen": game.current_fen,
        "moves": moves_data if moves_data else None,
        "opponent_report": opponent_report,
        "previous_game_comparison": previous_comparison,
    }

    if report is None:
        return {
            **base,
            "moves_analyzed": None,
            "cp_evaluable_moves": None,
            "average_cpl": None,
            "blunders": None,
            "mistakes": None,
            "inaccuracies": None,
            "best_move_agreement_pct": None,
            "accuracy_pct": None,
            "stars": None,
            "star_reason": None,
            "performance_version": None,
            "mate_events": None,
            "critical_moves": None,
            "recommendations": None,
        }

    return {
        **base,
        "moves_analyzed": report.moves_analyzed,
        "cp_evaluable_moves": report.cp_evaluable_moves,
        "average_cpl": report.average_cpl,
        "blunders": report.blunders,
        "mistakes": report.mistakes,
        "inaccuracies": report.inaccuracies,
        "best_move_agreement_pct": report.best_move_agreement_pct,
        "accuracy_pct": report.accuracy_pct,
        "stars": report.stars,
        "star_reason": report.star_reason,
        "performance_version": report.performance_version,
        "mate_events": report.mate_events,
        "critical_moves": report.critical_moves,
        "recommendations": report.recommendations,
    }


@router.post("/{game_id}/analyze", response_model=PerformanceReport)
def trigger_or_retry_analysis(game_id: str, user=Depends(current_user), session: Session = Depends(get_db)):
    game = LiveGameService(session)._game(game_id, user.id)
    if game.status != "completed":
        raise HTTPException(status_code=409, detail="The game must finish before analysis can be run")
    job = session.get(GameAnalysisJob, game_id)
    if job is None:
        job = GameAnalysisJob(game_id=game_id, status="queued", analysis_version="stockfish_live_v1")
        session.add(job)
        session.commit()
    elif job.status == "failed":
        job.status = "queued"
        job.error_message = None
        job.started_at = None
        job.completed_at = None
        session.commit()

    if job.status == "queued" and chess_service.is_available():
        try:
            process_game_analysis(session, game_id, chess_service.analyze_move, "Stockfish (UCI)")
        except Exception as exc:
            logger.warning("Synchronous game analysis attempt encountered an error: %s", exc)

    return get_report(game_id=game_id, user=user, session=session)



@router.websocket("/{game_id}/ws")
async def game_socket(socket: WebSocket, game_id: str):
    await socket.accept()
    origin = socket.headers.get("origin")
    if origin not in CORS_ORIGINS:
        logger.warning("WebSocket rejected: origin '%s' not in CORS_ORIGINS for game %s", origin, game_id)
        await socket.close(code=4403, reason="Origin is not allowed")
        return
    with Session(get_engine()) as session:
        try:
            user = AuthService(session).authenticate(socket.cookies.get(SESSION_COOKIE))
            if user is None:
                logger.warning("WebSocket rejected: unauthenticated connection for game %s", game_id)
                await socket.close(code=4401, reason="Authentication required")
                return
            user_id = user.id
            try:
                state = LiveGameService(session).state(game_id, user_id, lock=False)
            except GameError as exc:
                logger.warning("WebSocket rejected for user %s on game %s: %s", user_id, game_id, str(exc))
                await socket.close(code=4404 if exc.status_code == 404 else 4403, reason=str(exc))
                return
        finally:
            session.rollback()
    await connections.add(game_id, socket, user_id)
    logger.info("WebSocket connected for user %s on game %s", user_id, game_id)
    try:
        await socket.send_json(jsonable_encoder({"type": "state", "game": state}))
        await connections.broadcast(game_id, "connection")
        while True:
            payload = await socket.receive_json()
            if not isinstance(payload, dict):
                await socket.send_json({"type": "error", "detail": "Message must be an object"})
                continue
            try:
                with Session(get_engine()) as session:
                    service = LiveGameService(session)
                    if payload.get("type") == "move":
                        command = MoveCommand.model_validate({"uci": payload.get("uci"), "expected_ply": payload.get("expected_ply")})
                        state = service.move(game_id, user_id, command.uci, command.expected_ply)
                    elif payload.get("type") == "action" and payload.get("action") in {"resign", "offer_draw", "accept_draw", "decline_draw", "withdraw_draw", "claim_draw"}:
                        state = service.action(game_id, user_id, payload["action"])
                    else:
                        await socket.send_json({"type": "error", "detail": "Unknown game command"})
                        continue
                await connections.broadcast(game_id, "state")
            except GameError as exc:
                await socket.send_json({"type": "error", "detail": str(exc)})
            except (ValidationError, TypeError, ValueError):
                await socket.send_json({"type": "error", "detail": "Invalid game command"})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for user %s on game %s", user_id, game_id)
    except Exception:
        logger.warning("WebSocket error for user %s on game %s", user_id, game_id, exc_info=True)
    finally:
        await connections.remove(game_id, socket)
        await connections.broadcast(game_id, "connection")
