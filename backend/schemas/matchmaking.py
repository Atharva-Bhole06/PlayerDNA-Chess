from typing import Literal

from pydantic import BaseModel, ConfigDict


class FeatureGap(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature: str
    query_value: float
    candidate_value: float
    raw_gap: float
    normalized_gap: float


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommended_player_id: str
    rank: int
    score: float
    score_type: str
    explanation: str
    feature_gaps: list[FeatureGap]


class MatchmakingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_id: str
    mode: Literal["most_similar"]
    recommendations: list[Recommendation]
