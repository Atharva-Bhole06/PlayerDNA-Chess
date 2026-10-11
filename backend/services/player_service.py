"""Player profile serialization over the repository interface."""

import math

from backend.db.models import PlayerProfile
from backend.repositories.player_repository import PlayerRepository


class PlayerDataUnavailableError(RuntimeError):
    pass


def _number(value):
    if value is None:
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    if number.is_integer():
        return int(number)
    return number


class PlayerService:
    def __init__(self, repository: PlayerRepository):
        self.repository = repository

    def list_players(self) -> list[dict]:
        result = []
        for player, profile in self.repository.list_players():
            result.append({
                "player_id": player.player_id,
                "games_analyzed": _number(profile.games_analyzed) if profile else None,
                "mean_player_rating": _number(profile.mean_player_rating) if profile else None,
                "win_rate_pct": _number(profile.win_rate_pct) if profile else None,
            })
        return result

    def get_player(self, player_id: str) -> dict | None:
        records = self.repository.get_player(player_id)
        if records is None:
            return None
        player, profile, dna = records
        if profile is None:
            raise PlayerDataUnavailableError("Player profile data is incomplete")

        performance_fields = (
            "mean_accuracy_pct", "median_accuracy_pct", "accuracy_std_pct",
            "mean_cpl", "median_cpl", "cpl_std", "mean_best_move_percentage",
            "blunders_per_100_cp_moves", "mistakes_per_100_cp_moves",
            "inaccuracies_per_100_cp_moves", "white_mean_accuracy_pct",
            "black_mean_accuracy_pct", "games_as_white", "games_as_black",
        )
        dna_data = None
        if dna is not None:
            # Raw measurements live in the profile; DNA stores normalized dimensions.
            dna_data = {
                "median_cpl": _number(profile.median_cpl),
                "cpl_std": _number(profile.cpl_std),
                "inaccuracies_per_100_cp_moves": _number(
                    profile.inaccuracies_per_100_cp_moves
                ),
                "version": dna.version,
            }
        return {
            "player_id": player.player_id,
            "games_analyzed": _number(profile.games_analyzed),
            "mean_player_rating": _number(profile.mean_player_rating),
            "win_rate_pct": _number(profile.win_rate_pct),
            "record": {
                key: _number(getattr(profile, key))
                for key in ("wins", "draws", "losses")
            },
            "performance": {
                key: _number(getattr(profile, key)) for key in performance_fields
            },
            "player_dna": dna_data,
        }
