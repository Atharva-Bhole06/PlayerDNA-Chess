import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db.session import get_db, get_engine
from backend.db.models import GameAnalysisJob, LiveGame, LiveGameMove, PlayerGameReport, UserAccount
from backend.config import CORS_ORIGINS
from backend.routes.auth import SESSION_COOKIE
from backend.routes.dependencies import current_user
from backend.schemas.games import GameState, MoveCommand, PerformanceReport
from backend.services.auth_service import AuthService
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
        for socket, user_id in peers:
            try:
                with Session(get_engine()) as session:
                    service = LiveGameService(session)
                    state = service.state(game_id, user_id)
                    game = session.get(LiveGame, game_id)
                    opponent_id = game.black_user_id if user_id == game.white_user_id else game.white_user_id
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
    opponent_id = game.black_user_id if user.id == game.white_user_id else game.white_user_id
    opponent = session.get(UserAccount, opponent_id)
    report = session.get(PlayerGameReport, (game_id, user.id))
    move_count = session.scalar(select(func.count()).select_from(LiveGameMove).where(LiveGameMove.game_id == game_id)) or 0
    duration = max(0, int((game.finished_at - game.created_at).total_seconds())) if game.finished_at else 0
    base = {"game_id": game.id, "analysis_status": job.status, "result": game.result,
            "opponent_username": opponent.username,
            "opponent_rating": game.black_rating_at_start if user.id == game.white_user_id else game.white_rating_at_start,
            "move_count": move_count, "duration_seconds": duration,
            "message": "Analysis is queued." if job.status == "queued" else "Analysis is processing." if job.status == "processing" else job.error_message if job.status == "failed" else None}
    if report is None:
        return {**base, "moves_analyzed": None, "cp_evaluable_moves": None, "average_cpl": None,
                "blunders": None, "mistakes": None, "inaccuracies": None,
                "best_move_agreement_pct": None, "accuracy_pct": None, "stars": None,
                "star_reason": None, "performance_version": None, "mate_events": None,
                "critical_moves": None, "recommendations": None}
    return {**base, "moves_analyzed": report.moves_analyzed, "cp_evaluable_moves": report.cp_evaluable_moves,
            "average_cpl": report.average_cpl, "blunders": report.blunders,
            "mistakes": report.mistakes, "inaccuracies": report.inaccuracies,
            "best_move_agreement_pct": report.best_move_agreement_pct, "accuracy_pct": report.accuracy_pct,
            "stars": report.stars, "star_reason": report.star_reason,
            "performance_version": report.performance_version, "mate_events": report.mate_events,
            "critical_moves": report.critical_moves, "recommendations": report.recommendations}


@router.websocket("/{game_id}/ws")
async def game_socket(socket: WebSocket, game_id: str):
    origin = socket.headers.get("origin")
    if origin not in CORS_ORIGINS:
        await socket.close(code=4403, reason="Origin is not allowed")
        return
    with Session(get_engine()) as session:
        user = AuthService(session).authenticate(socket.cookies.get(SESSION_COOKIE))
        if user is None:
            await socket.close(code=4401, reason="Authentication required")
            return
        user_id = user.id
        try:
            state = LiveGameService(session).state(game_id, user_id)
        except GameError as exc:
            await socket.close(code=4404 if exc.status_code == 404 else 4403, reason=str(exc))
            return
    await socket.accept()
    await connections.add(game_id, socket, user_id)
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
        pass
    finally:
        await connections.remove(game_id, socket)
        await connections.broadcast(game_id, "connection")
