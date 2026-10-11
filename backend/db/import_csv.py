"""Import and verify the validated 30-player analysis cohort."""

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from backend.config import PROJECT_ROOT
from backend.db.models import (
    DNA_VERSION,
    DNAFeatureScaler,
    Game,
    MoveEvaluation,
    Player,
    PlayerDNA,
    PlayerGamePerformance,
    PlayerProfile,
    UserAccount,
)
from backend.db.session import DatabaseUnavailableError, get_engine


DATA_DIR = PROJECT_ROOT / "data"
EXPECTED_PLAYERS = 30
EXPECTED_GAMES = EXPECTED_PLAYERS * 40


class DatasetValidationError(ValueError):
    pass


def _clean(value):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        if not math.isfinite(number):
            raise DatasetValidationError("Input contains an infinite numeric value")
        return number
    return str(value)


def _as_int(value):
    value = _clean(value)
    return None if value is None else int(value)


def read_source_data(data_dir: Path = DATA_DIR) -> dict[str, pd.DataFrame]:
    paths = {
        "profiles": "player_profiles.csv",
        "dna": "player_dna.csv",
        "scalers": "player_dna_scaler_parameters.csv",
        "games": "processed_player_games.csv",
        "performance": "chess_performance_features_v2.csv",
        "moves": "stockfish_move_audit_v2.csv",
    }
    frames = {}
    for key, filename in paths.items():
        try:
            frames[key] = pd.read_csv(data_dir / filename)
        except (OSError, pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeError) as exc:
            raise DatasetValidationError(f"Required validated source is unavailable: {filename}") from exc
    return frames


def validate_source_data(frames: dict[str, pd.DataFrame]) -> None:
    profiles, dna = frames["profiles"], frames["dna"]
    games, performance, moves = frames["games"], frames["performance"], frames["moves"]
    scalers = frames["scalers"]
    for name, frame, required in (
        ("profiles", profiles, {"player_id", "games_analyzed"}),
        ("DNA", dna, {"player_id", "dna_median_cpl", "dna_cpl_std", "dna_inaccuracies_per_100_cp_moves"}),
        ("games", games, {"player_id", "game_id", "opponent_id", "player_color", "winner", "moves"}),
        ("performance", performance, {"player_id", "game_id", "average_cpl", "accuracy"}),
        ("move audit", moves, {"player_id", "game_id", "player_move_number", "ply_number"}),
        ("scalers", scalers, {"feature", "median", "q1", "q3", "iqr_scale", "transformation"}),
    ):
        missing = required - set(frame.columns)
        if missing:
            raise DatasetValidationError(f"{name} is missing columns: {sorted(missing)}")
        if frame.empty:
            raise DatasetValidationError(f"{name} contains no rows")
        for column in frame.select_dtypes(include=["number"]).columns:
            values = frame[column].dropna().to_numpy(dtype=float)
            if not np.isfinite(values).all():
                raise DatasetValidationError(f"{name}.{column} contains non-finite values")

    if profiles.player_id.isna().any() or profiles.player_id.duplicated().any():
        raise DatasetValidationError("Profile player IDs are missing or duplicated")
    if len(profiles) != EXPECTED_PLAYERS:
        raise DatasetValidationError(f"Expected {EXPECTED_PLAYERS} profiles, found {len(profiles)}")
    cohort = set(profiles.player_id)
    if set(dna.player_id) != cohort or dna.player_id.duplicated().any():
        raise DatasetValidationError("Player DNA IDs do not exactly match the profile cohort")
    profiles_by_id = profiles.set_index("player_id")
    dna_by_id = dna.set_index("player_id")
    for feature in ("median_cpl", "cpl_std", "inaccuracies_per_100_cp_moves"):
        if not np.allclose(
            profiles_by_id[feature].to_numpy(dtype=float),
            dna_by_id[feature].to_numpy(dtype=float),
            rtol=1e-10,
            atol=1e-10,
            equal_nan=True,
        ):
            raise DatasetValidationError(
                f"Raw Player DNA feature {feature} differs from the player profile"
            )
    if games.game_id.isna().any() or games.game_id.duplicated().any():
        raise DatasetValidationError("Game IDs are missing or duplicated")
    if len(games) != EXPECTED_GAMES:
        raise DatasetValidationError(f"Expected {EXPECTED_GAMES} games, found {len(games)}")
    per_player = games.groupby("player_id").size()
    if set(per_player.index) != cohort or not (per_player == 40).all():
        raise DatasetValidationError("Processed games do not contain exactly 40 games per cohort player")
    if set(games.player_id) - cohort:
        raise DatasetValidationError("Processed games contain players outside the profile cohort")
    keys = set(zip(games.player_id, games.game_id))
    performance_keys = set(zip(performance.player_id, performance.game_id))
    if len(performance) != len(games) or performance_keys != keys:
        raise DatasetValidationError("Game performance keys do not match processed game keys")
    player_for_game = games.set_index("game_id").player_id.to_dict()
    if set(moves.game_id) - set(games.game_id):
        raise DatasetValidationError("Move audit includes an unknown game")
    if any(player_for_game[game_id] != player_id for player_id, game_id in zip(moves.player_id, moves.game_id)):
        raise DatasetValidationError("Move audit player/game mappings are inconsistent")
    if moves.duplicated(["game_id", "player_move_number"]).any():
        raise DatasetValidationError("Move audit key (game_id, player_move_number) is duplicated")
    if set(scalers.feature) != {
        "median_cpl", "cpl_std", "inaccuracies_per_100_cp_moves"
    } or scalers.feature.duplicated().any():
        raise DatasetValidationError("DNA scaling features are missing, extra, or duplicated")
    if (scalers.iqr_scale <= 0).any():
        raise DatasetValidationError("DNA scaler contains a nonpositive IQR")
    scalers_by_feature = scalers.set_index("feature")
    for raw_feature, dna_feature in (
        ("median_cpl", "dna_median_cpl"),
        ("cpl_std", "dna_cpl_std"),
        ("inaccuracies_per_100_cp_moves", "dna_inaccuracies_per_100_cp_moves"),
    ):
        scaler = scalers_by_feature.loc[raw_feature]
        expected = (
            dna_by_id[raw_feature].to_numpy(dtype=float) - float(scaler["median"])
        ) / float(scaler["iqr_scale"])
        if not np.allclose(
            expected, dna_by_id[dna_feature].to_numpy(dtype=float),
            rtol=1e-10, atol=1e-10, equal_nan=True,
        ):
            raise DatasetValidationError(
                f"Stored normalized DNA does not match scaler for {raw_feature}"
            )
    game_ids = set(games.game_id)
    for column in ("best_accuracy_game_id", "worst_accuracy_game_id", "best_cpl_game_id", "worst_cpl_game_id"):
        if column in profiles and set(profiles[column].dropna()) - game_ids:
            raise DatasetValidationError(f"Profile references an unknown game in {column}")


GAME_FIELDS = (
    "player_id", "game_id", "opponent_id", "player_color", "player_rating",
    "opponent_rating", "winner", "turns", "moves", "opening_eco",
    "opening_name", "opening_ply", "rated", "increment_code",
    "total_plies_processed", "player_moves_processed", "opponent_moves_processed",
    "player_captures", "opponent_captures", "player_checks", "opponent_checks",
    "player_castles", "opponent_castles", "player_pawn_moves", "opponent_pawn_moves",
    "player_piece_moves", "opponent_piece_moves", "player_promotions",
    "opponent_promotions", "final_fen",
)
PERFORMANCE_FIELDS = (
    "game_id", "total_player_moves", "cp_evaluable_moves", "mate_evaluation_moves",
    "average_cpl", "blunders", "mistakes", "inaccuracies", "best_moves",
    "best_move_percentage", "accuracy", "missed_forced_mates", "allowed_forced_mates",
    "mate_score_changed", "mate_outcome_preserved", "engine_name", "engine_depth",
    "cpl_definition", "accuracy_definition",
)
MOVE_FIELDS = (
    "game_id", "player_move_number", "ply_number", "fen_before", "played_move_san",
    "played_move_uci", "best_move_san", "best_move_uci", "best_score_cp",
    "best_score_mate", "played_score_cp", "played_score_mate", "cpl",
    "move_classification", "mate_event", "engine_name", "engine_depth",
    "evaluation_method",
)


def _frame_records(frame: pd.DataFrame, fields: tuple[str, ...], rename=None) -> list[dict]:
    rename = rename or {}
    result = []
    for row in frame.to_dict(orient="records"):
        record = {}
        for source in fields:
            key = rename.get(source, source)
            value = row[source]
            if key in {
                "opening_ply", "player_move_number", "ply_number", "engine_depth",
                "best_score_mate", "played_score_mate",
            }:
                value = _as_int(value)
            else:
                value = _clean(value)
            record[key] = value
        result.append(record)
    return result


def _insert_batches(session: Session, model, rows: list[dict], batch_size: int = 2000) -> None:
    for start in range(0, len(rows), batch_size):
        session.execute(insert(model), rows[start : start + batch_size])


def _row_count(session: Session, model) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def import_data(session: Session, data_dir: Path = DATA_DIR, replace: bool = False) -> dict[str, int]:
    frames = read_source_data(data_dir)
    validate_source_data(frames)
    with session.begin():
        cohort_count = session.scalar(select(func.count()).select_from(Player).where(Player.cohort_member.is_(True))) or 0
        if cohort_count and not replace:
            raise RuntimeError("Database already contains historical cohort rows; pass --replace to reload the cohort")
        if replace:
            if _row_count(session, UserAccount):
                raise RuntimeError("Cannot replace the historical cohort while registered accounts exist")
            for model in (MoveEvaluation, PlayerGamePerformance, PlayerProfile, PlayerDNA,
                          DNAFeatureScaler, Game, Player):
                session.execute(delete(model))

        players = [{"player_id": str(player_id), "cohort_member": True}
                   for player_id in frames["profiles"].player_id]
        _insert_batches(session, Player, players)

        game_rows = _frame_records(
            frames["games"], GAME_FIELDS, rename={"moves": "moves_san"}
        )
        _insert_batches(session, Game, game_rows)

        performance_rows = _frame_records(frames["performance"], PERFORMANCE_FIELDS)
        _insert_batches(session, PlayerGamePerformance, performance_rows)

        move_rows = _frame_records(frames["moves"], MOVE_FIELDS)
        _insert_batches(session, MoveEvaluation, move_rows)

        profile_fields = tuple(
            column.name for column in PlayerProfile.__table__.columns
            if column.name != "player_id"
        )
        profile_rows = _frame_records(
            frames["profiles"], ("player_id", *profile_fields)
        )
        _insert_batches(session, PlayerProfile, profile_rows)

        dna_fields = (
            "player_id", "dna_median_cpl", "dna_cpl_std",
            "dna_inaccuracies_per_100_cp_moves",
        )
        dna_rows = _frame_records(frames["dna"], dna_fields)
        for row in dna_rows:
            row["version"] = DNA_VERSION
        _insert_batches(session, PlayerDNA, dna_rows)

        scaler_rows = []
        for row in frames["scalers"].to_dict(orient="records"):
            scaler_rows.append({
                "version": DNA_VERSION,
                "feature_name": str(row["feature"]),
                "median": _clean(row["median"]),
                "q1": _clean(row["q1"]),
                "q3": _clean(row["q3"]),
                "iqr_scale": _clean(row["iqr_scale"]),
                "transformation": str(row["transformation"]),
            })
        _insert_batches(session, DNAFeatureScaler, scaler_rows)

    return database_counts(session)


def database_counts(session: Session) -> dict[str, int]:
    return {
        "players": session.scalar(select(func.count()).select_from(Player).where(Player.cohort_member.is_(True))) or 0,
        "player_profiles": _row_count(session, PlayerProfile),
        "player_dna": _row_count(session, PlayerDNA),
        "dna_feature_scalers": _row_count(session, DNAFeatureScaler),
        "games": _row_count(session, Game),
        "player_game_performance": _row_count(session, PlayerGamePerformance),
        "move_evaluations": _row_count(session, MoveEvaluation),
    }


def _equal_value(source, stored) -> bool:
    source = _clean(source)
    stored = _clean(stored)
    if source is None or stored is None:
        return source is stored
    if isinstance(source, float) and isinstance(stored, (float, int)):
        return math.isclose(source, float(stored), rel_tol=1e-10, abs_tol=1e-10)
    return source == stored


def _verify_table(session, frame, model, fields, key_fields, rename=None) -> int:
    rename = rename or {}
    objects = session.scalars(select(model)).all()
    by_key = {
        tuple(getattr(obj, rename.get(field, field)) for field in key_fields): obj
        for obj in objects
    }
    source_rows = frame.to_dict(orient="records")
    if len(source_rows) != len(objects):
        raise AssertionError(f"{model.__tablename__} row count differs: CSV={len(source_rows)}, DB={len(objects)}")
    for row in source_rows:
        key = tuple(str(row[field]) if field in {"game_id", "player_id"} else row[field] for field in key_fields)
        stored = by_key.get(key)
        if stored is None:
            raise AssertionError(f"Missing {model.__tablename__} key {key}")
        for field in fields:
            db_field = rename.get(field, field)
            if not _equal_value(row[field], getattr(stored, db_field)):
                raise AssertionError(f"Mismatch {model.__tablename__}.{field} at {key}")
    return len(source_rows)


def verify_data(session: Session, data_dir: Path = DATA_DIR) -> dict[str, int]:
    frames = read_source_data(data_dir)
    validate_source_data(frames)
    checks = {
        "players": (frames["profiles"], Player, ("player_id",), ("player_id",)),
        "player_profiles": (frames["profiles"], PlayerProfile, tuple(frames["profiles"].columns), ("player_id",)),
        "player_dna": (frames["dna"], PlayerDNA,
                       ("player_id", "dna_median_cpl", "dna_cpl_std", "dna_inaccuracies_per_100_cp_moves"),
                       ("player_id",)),
        "games": (frames["games"], Game, GAME_FIELDS,
                  ("game_id",)),
        "player_game_performance": (frames["performance"], PlayerGamePerformance,
                                     tuple(field for field in PERFORMANCE_FIELDS if field != "game_id"),
                                     ("game_id",)),
        "move_evaluations": (frames["moves"], MoveEvaluation, MOVE_FIELDS,
                             ("game_id", "player_move_number")),
    }
    results = {}
    for name, (frame, model, fields, keys) in checks.items():
        if name == "players":
            objects = {obj.player_id for obj in session.scalars(select(Player).where(Player.cohort_member.is_(True))).all()}
            source = set(frame.player_id.astype(str))
            if objects != source:
                raise AssertionError("Player IDs differ between profiles CSV and database")
            results[name] = len(objects)
            continue
        rename = {"moves": "moves_san"} if name == "games" else None
        results[name] = _verify_table(session, frame, model, fields, keys, rename)

    stored_dna = session.scalars(select(PlayerDNA)).all()
    source_dna = frames["dna"].set_index("player_id")
    for row in stored_dna:
        source = source_dna.loc[row.player_id]
        for field in ("dna_median_cpl", "dna_cpl_std", "dna_inaccuracies_per_100_cp_moves"):
            if not _equal_value(source[field], getattr(row, field)):
                raise AssertionError(f"Mismatch player_dna.{field} for {row.player_id}")
    scaler_source = frames["scalers"].set_index("feature")
    scaler_objects = session.scalars(select(DNAFeatureScaler)).all()
    if len(scaler_objects) != len(scaler_source):
        raise AssertionError("DNA scaler row count differs between CSV and database")
    for row in scaler_objects:
        source = scaler_source.loc[row.feature_name]
        for field in ("median", "q1", "q3", "iqr_scale", "transformation"):
            if not _equal_value(source[field], getattr(row, field)):
                raise AssertionError(f"Mismatch dna_feature_scalers.{field} for {row.feature_name}")
    results["dna_feature_scalers"] = len(scaler_objects)
    for key, value in database_counts(session).items():
        if results.get(key, value) != value:
            raise AssertionError(f"Database count mismatch for {key}")
        results[key] = value
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true", help="Delete and reload the cohort data")
    parser.add_argument("--verify", action="store_true", help="Compare database rows to source CSVs")
    args = parser.parse_args()
    if args.replace and args.verify:
        parser.error("--replace and --verify cannot be used together")
    try:
        engine = get_engine()
        with Session(engine) as session:
            result = verify_data(session) if args.verify else import_data(session, replace=args.replace)
    except DatabaseUnavailableError as exc:
        parser.exit(2, f"Database unavailable: {exc}\n")
    except Exception as exc:
        parser.exit(1, f"Import/verification failed: {exc}\n")
    for table, count in result.items():
        print(f"{table}: {count}")


if __name__ == "__main__":
    main()
