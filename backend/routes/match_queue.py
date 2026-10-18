from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.routes.dependencies import current_user
from backend.schemas.games import QueueStatus
from backend.services.match_queue_service import MatchQueueService


router = APIRouter(prefix="/matchmaking/queue", tags=["competitive matchmaking"])


@router.post("", response_model=QueueStatus)
def join_queue(mode: str = Query("competitive"), user=Depends(current_user), session: Session = Depends(get_db)):
    return MatchQueueService(session).join(user, mode=mode)


@router.get("", response_model=QueueStatus)
def queue_status(user=Depends(current_user), session: Session = Depends(get_db)):
    return MatchQueueService(session).status(user)


@router.delete("", response_model=QueueStatus)
def cancel_queue(user=Depends(current_user), session: Session = Depends(get_db)):
    return MatchQueueService(session).cancel(user.id)
