import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.repositories.player_repository import PlayerRepository
from backend.schemas.players import PlayerProfileResponse, PlayerSummary
from backend.services.player_service import (
    PlayerDataUnavailableError,
    PlayerService,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])
PlayerId = Annotated[
    str,
    Path(
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9_.-]+$",
        description="Player username from the analyzed cohort",
    ),
]


def _player_service(session: Session = Depends(get_db)) -> PlayerService:
    return PlayerService(PlayerRepository(session))


@router.get(
    "",
    response_model=list[PlayerSummary],
    summary="List analyzed players",
    description="Returns player IDs and summary fields for player selection/search.",
    responses={503: {"description": "Player data is unavailable"}},
)
def list_players(service: PlayerService = Depends(_player_service)):
    try:
        return service.list_players()
    except PlayerDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Player list request failed")
        raise HTTPException(status_code=500, detail="Unable to load players") from exc


@router.get(
    "/{player_id}",
    response_model=PlayerProfileResponse,
    summary="Get a player profile",
    description="Returns curated performance statistics and Player DNA features.",
    responses={404: {"description": "Player not found"}, 422: {"description": "Invalid player ID"}, 503: {"description": "Player data is unavailable"}},
)
def get_player(player_id: PlayerId, service: PlayerService = Depends(_player_service)):
    try:
        result = service.get_player(player_id)
    except PlayerDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Player profile request failed")
        raise HTTPException(status_code=500, detail="Unable to load player profile") from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return result
