import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.repositories.matchmaking_repository import MatchmakingRepository
from backend.routes.dependencies import admin_user
from backend.schemas.matchmaking import MatchmakingResponse
from backend.services.matchmaking_service import MatchmakingDataUnavailableError, MatchmakingService


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])
PlayerId = Annotated[str, Path(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")]
Mode = Literal["most_similar"]


def _matchmaking_service(session: Session = Depends(get_db)) -> MatchmakingService:
    return MatchmakingService(MatchmakingRepository(session))


@router.get(
    "/{player_id}",
    response_model=MatchmakingResponse,
    summary="Recommend similar players",
    description="Ranks the existing Player DNA cohort using the supported matchmaking mode. Restricted to administrators.",
    responses={401: {"description": "Authentication required"}, 403: {"description": "Administrator research access required"}, 404: {"description": "Player not found"}, 422: {"description": "Invalid mode or top_n"}, 503: {"description": "Matchmaking data is unavailable"}},
)
def get_recommendations(
    player_id: PlayerId,
    mode: Mode = Query("most_similar", description="Supported mode: most_similar"),
    top_n: Annotated[int, Query(ge=1, le=29, description="Number of recommendations (1–29)")] = 5,
    _admin=Depends(admin_user),
    service: MatchmakingService = Depends(_matchmaking_service),
):
    try:
        return service.recommend(player_id, mode, top_n)
    except MatchmakingDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        message = str(exc)
        if "Unknown player_id" in message:
            raise HTTPException(status_code=404, detail="Player not found") from exc
        raise HTTPException(status_code=422, detail="Invalid matchmaking request") from exc
    except Exception as exc:
        logger.exception("Matchmaking request failed")
        raise HTTPException(status_code=500, detail="Unable to generate recommendations") from exc
