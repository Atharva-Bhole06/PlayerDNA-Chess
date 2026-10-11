from pydantic import BaseModel, ConfigDict


class PlayerSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_id: str
    games_analyzed: int | None
    mean_player_rating: float | None
    win_rate_pct: float | None


class PlayerDNAResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    median_cpl: float | None
    cpl_std: float | None
    inaccuracies_per_100_cp_moves: float | None
    version: str


class PlayerProfileResponse(PlayerSummary):
    record: dict[str, int | None]
    performance: dict[str, float | int | None]
    player_dna: PlayerDNAResponse | None
