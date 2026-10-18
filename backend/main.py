"""FastAPI application entry point for PlayerDNA AI."""

from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from backend.config import CORS_ORIGINS
from backend.db.session import DatabaseUnavailableError, database_is_available, dispose_engine
from backend.routes import auth, chess, demo, matchmaking, players
from backend.routes.match_queue import router as match_queue_router
from backend.routes.live_games import router as live_games_router
from backend.routes.registered_players import router as registered_players_router
from backend.routes.research import router as research_router
from backend.schemas.health import HealthResponse
from backend.services.chess_service import chess_service
from backend.services.live_game_service import GameError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    chess_service.close()
    dispose_engine()


app = FastAPI(
    title="PlayerDNA AI API",
    description=(
        "Registered multiplayer chess with Elo matchmaking, persistent games, "
        "post-game Stockfish reports, and separate historical Player DNA analytics."
    ),
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

api = APIRouter(prefix="/api")
api.include_router(players.router)
api.include_router(auth.router)
api.include_router(match_queue_router)
api.include_router(matchmaking.router)
api.include_router(chess.router)
api.include_router(live_games_router)
api.include_router(registered_players_router)
api.include_router(research_router)
api.include_router(demo.router)




@api.get(
    "/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Check API liveness and Stockfish configuration",
    description="Does not launch Stockfish or run an analysis.",
)
def health():
    return {
        "status": "ok",
        "database_available": database_is_available(),
        "stockfish_available": chess_service.is_available(),
    }


app.include_router(api)


@app.exception_handler(DatabaseUnavailableError)
async def database_unavailable(_request: Request, _exc: DatabaseUnavailableError):
    return JSONResponse(status_code=503, content={"detail": "Database is unavailable"})


@app.exception_handler(SQLAlchemyError)
async def database_error(_request: Request, _exc: SQLAlchemyError):
    return JSONResponse(status_code=503, content={"detail": "Database operation failed"})


@app.exception_handler(GameError)
async def game_error(_request: Request, exc: GameError):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})
