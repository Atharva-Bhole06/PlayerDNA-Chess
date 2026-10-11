import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.schemas.chess import (
    ChessRecommendationRequest,
    ChessRecommendationResponse,
)
from backend.services.chess_service import chess_service
from Scripts.stockfish_service import (
    EngineAnalysisTimeoutError,
    EngineUnavailableError,
    InvalidPositionError,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chess", tags=["live chess"])


@router.post(
    "/recommend",
    response_model=ChessRecommendationResponse,
    summary="Recommend a move for a FEN position",
    description="Validates the current position and returns Stockfish's best move, evaluation, and principal variation.",
    responses={
        422: {"description": "Invalid FEN, illegal position, or invalid request body"},
        503: {"description": "Stockfish is unavailable"},
        504: {"description": "Stockfish analysis timed out"},
    },
)
async def recommend_move(request: ChessRecommendationRequest):
    try:
        return await run_in_threadpool(chess_service.analyze, request.fen)
    except InvalidPositionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except EngineAnalysisTimeoutError as exc:
        raise HTTPException(status_code=504, detail="Stockfish analysis timed out") from exc
    except EngineUnavailableError as exc:
        # Avoid returning executable paths or UCI process details to clients.
        logger.warning("Stockfish unavailable for recommendation: %s", exc)
        raise HTTPException(status_code=503, detail="Stockfish is unavailable") from exc
    except Exception as exc:
        logger.exception("Chess recommendation request failed")
        raise HTTPException(status_code=500, detail="Unable to analyze position") from exc
