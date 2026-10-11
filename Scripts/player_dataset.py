"""Build and validate the fixed PlayerDNA cohort from the original games CSV."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "games.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "player_game_records.csv"
DEFAULT_MANIFEST = PROJECT_ROOT / "data" / "player_cohort_manifest.json"
DEFAULT_AUDIT = PROJECT_ROOT / "data" / "game_id_duplicate_audit.csv"
TIMESTAMP_FIELDS = {"created_at", "last_move_at"}
RECORD_COLUMNS = [
    "player_id", "game_id", "opponent_id", "player_color", "player_rating",
    "opponent_rating", "winner", "turns", "moves", "opening_eco",
    "opening_name", "opening_ply", "rated", "increment_code",
]
HEADER_REQUIRED = {
    "id", "white_id", "black_id", "white_rating", "black_rating",
    "winner", "moves",
}
SOURCE_REQUIRED = HEADER_REQUIRED | {
    "turns", "opening_eco", "opening_name", "opening_ply", "rated",
    "increment_code",
}
AUDIT_COLUMNS = [
    "game_id", "source_row_count", "distinct_full_rows",
    "exact_duplicate_rows", "differing_fields", "created_at_variants",
    "last_move_at_variants", "gameplay_conflict",
]


class DatasetConflictError(ValueError):
    """Source game IDs disagree on one or more gameplay fields."""


def load_manifest(path: Path | str = DEFAULT_MANIFEST) -> dict[str, Any]:
    """Load and validate the ordered cohort manifest."""
    with Path(path).open("r", encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    players = manifest.get("players")
    games_per_player = manifest.get("games_per_player")
    if (
        not isinstance(players, list)
        or not players
        or any(not isinstance(player, str) or not player for player in players)
        or len(players) != len(set(players))
    ):
        raise ValueError("Cohort manifest must contain unique, non-empty player IDs")
    if isinstance(games_per_player, bool) or not isinstance(games_per_player, int) or games_per_player < 1:
        raise ValueError("Cohort manifest games_per_player must be a positive integer")
    return {**manifest, "players": players, "games_per_player": games_per_player}


def read_games(path: Path | str) -> pd.DataFrame:
    """Read games.csv after locating its real header below optional comments."""
    path = Path(path)
    header_line = None
    with path.open("r", encoding="utf-8-sig", newline="") as source_file:
        for line_number, line in enumerate(source_file):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            try:
                columns = set(next(csv.reader([line])))
            except (csv.Error, StopIteration):
                continue
            if HEADER_REQUIRED <= columns:
                header_line = line_number
                break
    if header_line is None:
        raise ValueError(f"Could not locate the games.csv header in {path}")
    frame = pd.read_csv(path, skiprows=header_line, engine="python", on_bad_lines="error")
    missing = SOURCE_REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Source games CSV is missing columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("Source games CSV contains no game records")
    if frame["id"].isna().any() or frame["id"].astype(str).str.strip().eq("").any():
        raise ValueError("Source games CSV contains a missing or empty game ID")
    return frame


def inspect_duplicate_ids(games: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Summarize repeated source IDs and identify any gameplay-field conflict.

    The audit intentionally records IDs, row counts, changed field names, and
    timestamp variants only. It never copies full game rows or move strings.
    """
    if "id" not in games.columns:
        raise ValueError("Source games are missing the id column")
    repeated = games.loc[games["id"].duplicated(keep=False)]
    rows = []
    conflicts = []
    for game_id, group in repeated.groupby("id", sort=False, dropna=False):
        differing = [
            column
            for column in games.columns
            if column != "id" and group[column].nunique(dropna=False) > 1
        ]
        gameplay_differences = sorted(set(differing) - TIMESTAMP_FIELDS)
        if gameplay_differences:
            conflicts.append(str(game_id))
        rows.append({
            "game_id": game_id,
            "source_row_count": len(group),
            "distinct_full_rows": len(group.drop_duplicates()),
            "exact_duplicate_rows": len(group) - len(group.drop_duplicates()),
            "differing_fields": ",".join(differing),
            "created_at_variants": _format_variants(group, "created_at"),
            "last_move_at_variants": _format_variants(group, "last_move_at"),
            "gameplay_conflict": bool(gameplay_differences),
        })
    return pd.DataFrame(rows, columns=AUDIT_COLUMNS), conflicts


def _format_variants(group: pd.DataFrame, column: str) -> str:
    if column not in group.columns:
        return ""
    values = group[column].drop_duplicates().tolist()
    return " | ".join("<NA>" if pd.isna(value) else str(value) for value in values)


def canonicalize_source_games(games: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Drop exact/timestamp-only repeated IDs, rejecting gameplay conflicts."""
    audit, conflicts = inspect_duplicate_ids(games)
    if conflicts:
        raise DatasetConflictError(
            f"{len(conflicts)} repeated game IDs differ in gameplay fields; "
            f"inspect the duplicate audit (examples: {', '.join(conflicts[:10])})."
        )
    # Keep the first source occurrence, matching the historical behavior.
    canonical = games.drop_duplicates(subset=["id"], keep="first").copy()
    return canonical, audit


def validate_player_game_records(
    records: pd.DataFrame, manifest: dict[str, Any]
) -> None:
    """Require the already-selected cohort; this stage never selects players."""
    players = manifest["players"]
    games_per_player = manifest["games_per_player"]
    expected_rows = len(players) * games_per_player
    required = {"player_id", "game_id"}
    if missing := required - set(records.columns):
        raise ValueError(f"Player-game records are missing columns: {sorted(missing)}")
    if len(records) != expected_rows:
        raise ValueError(
            f"Expected the selected cohort's {expected_rows} records; found {len(records)}. "
            "Run the manifest-based record generator before game processing."
        )
    actual_order = records["player_id"].drop_duplicates().tolist()
    if actual_order != players:
        raise ValueError("Player-game record order/membership does not match the cohort manifest")
    per_player = records.groupby("player_id", sort=False)["game_id"].nunique()
    if len(per_player) != len(players) or not (per_player == games_per_player).all():
        raise ValueError("Every manifest player must have exactly the configured game count")
    if records.duplicated(["player_id", "game_id"]).any():
        raise ValueError("Player-game records contain duplicate player/game keys")


def build_player_game_records(
    games: pd.DataFrame, manifest: dict[str, Any]
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build exactly the manifest cohort, taking each player's first N games."""
    missing = SOURCE_REQUIRED - set(games.columns)
    if missing:
        raise ValueError(f"Source games are missing columns: {sorted(missing)}")
    if games["id"].isna().any() or games["id"].astype(str).str.strip().eq("").any():
        raise ValueError("Source games contain a missing or empty game ID")
    canonical, audit = canonicalize_source_games(games)

    players = manifest["players"]
    games_per_player = manifest["games_per_player"]
    records = []
    unavailable = []
    for player_id in players:
        player_games = canonical.loc[
            (canonical["white_id"] == player_id)
            | (canonical["black_id"] == player_id)
        ].head(games_per_player)
        if len(player_games) != games_per_player:
            unavailable.append(f"{player_id}={len(player_games)}")
            continue
        for _, game in player_games.iterrows():
            if game["white_id"] == player_id:
                color = "white"
                opponent = game["black_id"]
                player_rating = game["white_rating"]
                opponent_rating = game["black_rating"]
            else:
                color = "black"
                opponent = game["white_id"]
                player_rating = game["black_rating"]
                opponent_rating = game["white_rating"]
            records.append({
                "player_id": player_id,
                "game_id": game["id"],
                "opponent_id": opponent,
                "player_color": color,
                "player_rating": player_rating,
                "opponent_rating": opponent_rating,
                "winner": game["winner"],
                "turns": game["turns"],
                "moves": game["moves"],
                "opening_eco": game["opening_eco"],
                "opening_name": game["opening_name"],
                "opening_ply": game["opening_ply"],
                "rated": game["rated"],
                "increment_code": game["increment_code"],
            })
    if unavailable:
        raise ValueError(
            "Source does not support the manifest cohort's first "
            f"{games_per_player} games for: {', '.join(unavailable)}"
        )
    result = pd.DataFrame(records, columns=RECORD_COLUMNS)
    validate_player_game_records(result, manifest)
    return result, audit


def generate_from_paths(
    input_path: Path | str,
    manifest_path: Path | str,
    output_path: Path | str,
    audit_path: Path | str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build outputs; always write the compact duplicate audit before failing."""
    games = read_games(input_path)
    audit, conflicts = inspect_duplicate_ids(games)
    audit_path = Path(audit_path)
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit.to_csv(audit_path, index=False)
    if conflicts:
        raise DatasetConflictError(
            f"{len(conflicts)} repeated game IDs differ in gameplay fields; "
            f"inspect {audit_path} (examples: {', '.join(conflicts[:10])})."
        )
    manifest = load_manifest(manifest_path)
    records, _ = build_player_game_records(games, manifest)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records.to_csv(output_path, index=False)
    return records, audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    args = parser.parse_args()
    manifest = load_manifest(args.manifest)
    records, audit = generate_from_paths(
        args.input, args.manifest, args.output, args.audit
    )
    timestamp_only = int(
        audit.differing_fields.map(
            lambda fields: bool(fields) and set(fields.split(",")) <= TIMESTAMP_FIELDS
        ).sum()
    ) if not audit.empty else 0
    exact_duplicates = int(audit.exact_duplicate_rows.sum()) if not audit.empty else 0
    print(f"Cohort players: {len(manifest['players'])}")
    print(f"Games per player: {manifest['games_per_player']}")
    print(f"Player-game records: {len(records)}")
    print(f"Repeated game IDs audited: {len(audit)}")
    print(f"Exact duplicate rows removed: {exact_duplicates}")
    print(f"Timestamp-only conflict IDs: {timestamp_only}")
    print(f"Records: {args.output}")
    print(f"Duplicate audit: {args.audit}")


if __name__ == "__main__":
    main()
