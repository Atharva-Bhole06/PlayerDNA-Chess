"""Adapter around the existing ranking method with database-backed inputs."""

from backend.repositories.matchmaking_repository import MatchmakingRepository
from Scripts.matchmaking import get_recommendations, validate_dna


class MatchmakingDataUnavailableError(RuntimeError):
    pass


class MatchmakingService:
    def __init__(self, repository: MatchmakingRepository):
        self.repository = repository

    def recommend(self, player_id: str, mode: str, top_n: int) -> dict:
        try:
            frame = self.repository.load_dna_frame()
            validate_dna(frame)
            rows = get_recommendations(
                player_id, mode=mode, top_n=top_n, frame=frame
            )
        except ValueError as exc:
            # Unknown player IDs are input errors; malformed/missing DNA is data failure.
            if "Unknown player_id" in str(exc):
                raise
            raise MatchmakingDataUnavailableError("Player DNA data is invalid") from exc
        if frame.empty:
            raise MatchmakingDataUnavailableError("Player DNA data is empty")
        return {
            "player_id": player_id,
            "mode": mode,
            "recommendations": [
                {
                    "recommended_player_id": row["recommended_player_id"],
                    "rank": row["rank"],
                    "score": row["score"],
                    "score_type": row["score_type"],
                    "explanation": row["explanation"],
                    "feature_gaps": row["feature_gaps"],
                }
                for row in rows
            ],
        }
