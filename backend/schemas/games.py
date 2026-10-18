from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QueueStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    game_id: str | None
    wait_seconds: int
    rating_window: int | None


class GameState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game_id: str
    status: str
    color: str
    white_username: str
    black_username: str
    white_rating: int
    black_rating: int
    fen: str
    pgn: str
    result: str | None
    termination: str | None
    white_time_ms: int
    black_time_ms: int
    turn_started_at: datetime | None
    ply_count: int
    draw_offered_by: str | None
    analysis_status: str


class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rank: int
    username: str
    rating: int
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float | None


class RegisteredProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    rating: int
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float | None
    style_cluster: int | None
    style_model_version: str | None


class LiveDNASnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game_id: str
    games_analyzed: int
    median_cpl: float
    cpl_std: float
    inaccuracies_per_100_cp_moves: float
    feature_version: str
    snapshot_at: datetime


class RecentGame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game_id: str
    opponent_username: str
    opponent_rating: int
    color: str
    result: str
    termination: str
    rating_before: int
    rating_after: int
    rating_change: int
    finished_at: datetime | None = None
    analysis_status: str
    stars: int | None


class MoveAnalysisItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ply: int
    move_number: int
    color: str
    user_id: str
    is_user_move: bool
    played_san: str
    played_uci: str
    best_move_san: str | None = None
    best_move_uci: str | None = None
    cpl: int | None = None
    best_move_agreement: bool | None = None
    classification: str | None = None
    fen_before: str
    fen_after: str
    played_score_cp: int | None = None
    played_score_mate: int | None = None
    best_score_cp: int | None = None
    best_score_mate: int | None = None
    engine_depth: int | None = None
    explanation: str | None = None


class OpponentReportSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    rating: int
    rating_after: int | None = None
    rating_change: int | None = None
    color: str
    accuracy_pct: float | None = None
    average_cpl: float | None = None
    stars: int | None = None
    star_reason: str | None = None
    blunders: int | None = None
    mistakes: int | None = None
    inaccuracies: int | None = None
    best_move_agreement_pct: float | None = None


class PreviousGameComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previous_game_id: str
    finished_at: datetime | None = None
    opponent_username: str
    accuracy_current: float | None = None
    accuracy_previous: float | None = None
    accuracy_delta: float | None = None
    average_cpl_current: float | None = None
    average_cpl_previous: float | None = None
    average_cpl_delta: float | None = None
    blunders_current: int | None = None
    blunders_previous: int | None = None
    blunders_delta: int | None = None
    mistakes_current: int | None = None
    mistakes_previous: int | None = None
    mistakes_delta: int | None = None
    inaccuracies_current: int | None = None
    inaccuracies_previous: int | None = None
    inaccuracies_delta: int | None = None


class PerformanceReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game_id: str
    analysis_status: str
    result: str
    opponent_username: str
    opponent_rating: int
    move_count: int
    duration_seconds: int
    moves_analyzed: int | None
    cp_evaluable_moves: int | None
    average_cpl: float | None
    blunders: int | None
    mistakes: int | None
    inaccuracies: int | None
    best_move_agreement_pct: float | None
    accuracy_pct: float | None
    stars: int | None
    star_reason: str | None
    performance_version: str | None
    mate_events: dict[str, int] | None
    critical_moves: list[dict] | None
    recommendations: list[str] | None
    message: str | None
    color: str | None = None
    user_won: bool | None = None
    result_outcome: str | None = None
    user_rating: int | None = None
    user_rating_after: int | None = None
    rating_change: int | None = None
    is_rated: bool = False
    finished_at: datetime | None = None
    termination: str | None = None
    pgn: str | None = None
    current_fen: str | None = None
    moves: list[MoveAnalysisItem] | None = None
    opponent_report: OpponentReportSummary | None = None
    previous_game_comparison: PreviousGameComparison | None = None


class MoveCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uci: str
    expected_ply: int
