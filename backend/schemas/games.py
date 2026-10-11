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
    finished_at: datetime
    analysis_status: str
    stars: int | None


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


class MoveCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uci: str
    expected_ply: int
