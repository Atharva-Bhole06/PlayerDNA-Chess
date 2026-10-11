from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChessRecommendationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fen: str = Field(min_length=1, max_length=200, description="Current legal chess position in FEN")


class ChessRecommendationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fen: str
    best_move: str | None
    best_move_san: str | None
    evaluation: float | None = Field(description="Pawn units, from White's perspective, for cp scores")
    evaluation_mate: int | None = Field(description="Signed mate distance from White's perspective")
    evaluation_type: Literal["cp", "mate", "terminal"]
    principal_variation: list[str]
    depth: int | None
    analysis_time_ms: float
    terminal_reason: str | None
