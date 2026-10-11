"""Backend configuration kept separate from route and service logic."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env", override=False)
PLAYER_PROFILES_CSV = Path(
    os.environ.get("PLAYER_PROFILES_CSV", PROJECT_ROOT / "data" / "player_profiles.csv")
)
PLAYER_DNA_CSV = Path(
    os.environ.get("PLAYER_DNA_CSV", PROJECT_ROOT / "data" / "player_dna.csv")
)

_default_origins = "http://localhost:5173,http://localhost:3000"
CORS_ORIGINS = tuple(
    origin.strip()
    for origin in os.environ.get("PLAYERDNA_CORS_ORIGINS", _default_origins).split(",")
    if origin.strip()
)
if "*" in CORS_ORIGINS:
    raise ValueError("PLAYERDNA_CORS_ORIGINS must list exact origins; wildcard is disabled")
