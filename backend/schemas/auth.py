from pydantic import BaseModel, ConfigDict, Field


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=10, max_length=128)


class AuthenticatedProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    rating: int
    games_played: int
    wins: int
    losses: int
    draws: int
    player_dna_status: str
    is_admin: bool = False
