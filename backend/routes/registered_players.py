from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import CompetitiveRatingHistory, GameAnalysisJob, LiveGame, LivePlayerDNAHistory, PlayerGameReport, UserAccount
from backend.db.session import get_db
from backend.routes.dependencies import current_user
from backend.schemas.games import LeaderboardEntry, LiveDNASnapshot, RecentGame, RegisteredProfile
from backend.services.player_style_model import predict_player_style
from fastapi import HTTPException


router = APIRouter(tags=["registered players"])


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(session: Session = Depends(get_db)):
    users = session.scalars(select(UserAccount).order_by(UserAccount.rating.desc(), UserAccount.username_key.asc())).all()
    return [{"rank": rank, "username": user.username, "rating": user.rating,
             "games_played": user.games_played, "wins": user.wins, "losses": user.losses,
             "draws": user.draws, "win_rate": user.wins / user.games_played if user.games_played else None}
            for rank, user in enumerate(users, start=1)]


@router.get("/profiles/{username}", response_model=RegisteredProfile)
def registered_profile(username: str, session: Session = Depends(get_db)):
    user = session.scalar(select(UserAccount).where(UserAccount.username_key == username.casefold()))
    if user is None:
        raise HTTPException(status_code=404, detail="Registered player not found")
    style = predict_player_style(session, user.id)
    return {"username": user.username, "rating": user.rating, "games_played": user.games_played,
            "wins": user.wins, "losses": user.losses, "draws": user.draws,
            "win_rate": user.wins / user.games_played if user.games_played else None,
            "style_cluster": style["cluster"] if style else None,
            "style_model_version": style["model_version"] if style else None}


@router.get("/profiles/{username}/dna", response_model=list[LiveDNASnapshot])
def registered_dna_history(username: str, session: Session = Depends(get_db)):
    user = session.scalar(select(UserAccount).where(UserAccount.username_key == username.casefold()))
    if user is None:
        raise HTTPException(status_code=404, detail="Registered player not found")
    rows = session.scalars(select(LivePlayerDNAHistory).where(
        LivePlayerDNAHistory.user_id == user.id,
    ).order_by(LivePlayerDNAHistory.snapshot_at, LivePlayerDNAHistory.game_id)).all()
    return [{"game_id": row.game_id, "games_analyzed": row.games_analyzed,
             "median_cpl": row.median_cpl, "cpl_std": row.cpl_std,
             "inaccuracies_per_100_cp_moves": row.inaccuracies_per_100_cp_moves,
             "feature_version": row.feature_version, "snapshot_at": row.snapshot_at}
            for row in rows]


@router.get("/account/games", response_model=list[RecentGame])
def recent_games(user=Depends(current_user), session: Session = Depends(get_db)):
    games = session.scalars(select(LiveGame).where(
        LiveGame.status == "completed",
        (LiveGame.white_user_id == user.id) | (LiveGame.black_user_id == user.id),
    ).order_by(LiveGame.finished_at.desc(), LiveGame.id).limit(10)).all()
    results = []
    for game in games:
        is_white = game.white_user_id == user.id
        opponent = session.get(UserAccount, game.black_user_id if is_white else game.white_user_id)
        history = session.get(CompetitiveRatingHistory, (user.id, game.id))
        job = session.get(GameAnalysisJob, game.id)
        report = session.get(PlayerGameReport, (game.id, user.id))
        if game.result == "1/2-1/2":
            outcome = "draw"
        elif (game.result == "1-0") == is_white:
            outcome = "win"
        else:
            outcome = "loss"
        before = history.rating_before if history else (game.white_rating_at_start if is_white else game.black_rating_at_start)
        after = history.rating_after if history else user.rating
        results.append({
            "game_id": game.id, "opponent_username": opponent.username,
            "opponent_rating": game.black_rating_at_start if is_white else game.white_rating_at_start,
            "color": "white" if is_white else "black", "result": outcome,
            "termination": game.termination or "unknown", "rating_before": before,
            "rating_after": after, "rating_change": after - before,
            "finished_at": game.finished_at, "analysis_status": job.status if job else "not_queued",
            "stars": report.stars if report else None,
        })
    return results
