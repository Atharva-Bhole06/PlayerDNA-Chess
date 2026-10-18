"""Schemas for the College Demonstration Mode."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class DemoMoveAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ply: int
    move_number: int
    color: str
    played_san: str
    played_uci: str
    best_san: str
    best_uci: str
    cpl: int | None = None
    classification: str
    fen_before: str
    fen_after: str
    best_score_cp: int | None = None
    played_score_cp: int | None = None
    best_score_mate: int | None = None
    played_score_mate: int | None = None
    depth: int | None = None
    analysis_time_ms: float | None = None
    explanation: str


class DemoImportantMoment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ply: int
    title: str
    category: str
    description: str
    move_san: str
    best_san: str


class DemoGameSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    game_id: str
    white_player: str
    white_rating: int
    black_player: str
    black_rating: int
    result: str
    termination: str
    pgn: str
    moves: list[DemoMoveAnalysis]
    important_moments: list[DemoImportantMoment]
    moves_analyzed: int
    average_cpl: float
    accuracy_pct: float
    stars: int
    star_reason: str
    best_move_agreement_pct: float
    blunders: int
    mistakes: int
    inaccuracies: int
    recommendations: list[str]


class DemoActualRatedGame(BaseModel):
    model_config = ConfigDict(extra="ignore")
    game_id: str
    white_username: str
    white_rating_before: int
    white_rating_after: int
    white_rating_delta: int
    black_username: str
    black_rating_before: int
    black_rating_after: int
    black_rating_delta: int
    result: str
    termination: str
    k_factor: int
    expected_score_white: float
    expected_score_black: float
    finished_at: datetime | None = None
    has_actual_data: bool = True


class DemoPlayerProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    username: str
    current_rating: int
    is_provisional: bool
    games_played: int
    wins: int
    losses: int
    draws: int
    initial_rating_explanation: str
    provisional_policy_explanation: str
    rating_history: list[dict[str, Any]]


class DemoModelStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    is_model_trained: bool
    model_version: str | None = None
    model_type: str
    training_rows: int | None = None
    data_fingerprint: str | None = None
    metrics: dict[str, Any] | None = None
    min_users_required: int
    min_analyzed_games_per_user: int
    eligible_users_count: int
    individual_inference_games_required: int
    explanation: str
    components_summary: list[dict[str, str]]


class DemoOverviewResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sample_game: DemoGameSummary
    actual_rated_game: DemoActualRatedGame | None = None
    player_profile: DemoPlayerProfile
    model_status: DemoModelStatus
    elo_formula_info: dict[str, Any]
    system_workflow_steps: list[dict[str, Any]]
