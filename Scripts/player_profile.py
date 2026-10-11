"""Aggregate corrected game-level Stockfish metrics into player profiles.

The descriptive outcome and rating columns are retained for analysis, but
they are deliberately separate from the candidate behavioral feature vector.
This stage does not train a model or create recommendations.
"""

from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_FILE = PROJECT_ROOT / "data" / "chess_performance_features_v2.csv"
OUTPUT_FILE = PROJECT_ROOT / "data" / "player_profiles.csv"
EXPECTED_PLAYERS = 30
GAMES_PER_PLAYER = 40

REQUIRED_COLUMNS = {
    "player_id",
    "game_id",
    "opponent_id",
    "player_color",
    "player_rating",
    "opponent_rating",
    "winner",
    "total_player_moves",
    "cp_evaluable_moves",
    "mate_evaluation_moves",
    "average_cpl",
    "blunders",
    "mistakes",
    "inaccuracies",
    "best_moves",
    "best_move_percentage",
    "accuracy",
    "missed_forced_mates",
    "allowed_forced_mates",
    "mate_score_changed",
    "mate_outcome_preserved",
}

NUMERIC_INPUTS = [
    "player_rating",
    "opponent_rating",
    "total_player_moves",
    "cp_evaluable_moves",
    "mate_evaluation_moves",
    "average_cpl",
    "blunders",
    "mistakes",
    "inaccuracies",
    "best_moves",
    "best_move_percentage",
    "accuracy",
    "missed_forced_mates",
    "allowed_forced_mates",
    "mate_score_changed",
    "mate_outcome_preserved",
]


def validate_input(df):
    missing_columns = REQUIRED_COLUMNS - set(df.columns)
    if missing_columns:
        raise ValueError(
            f"Corrected Stockfish data is missing columns: "
            f"{sorted(missing_columns)}"
        )
    if df.empty:
        raise ValueError("Corrected Stockfish data is empty")
    if df[["player_id", "game_id"]].isna().any().any():
        raise ValueError("Player or game identifiers contain missing values")
    if df.duplicated(["player_id", "game_id"]).any():
        raise ValueError("Duplicate player-game records found")
    if df["player_id"].nunique() != EXPECTED_PLAYERS:
        raise ValueError(
            f"Expected {EXPECTED_PLAYERS} players; found "
            f"{df['player_id'].nunique()}"
        )

    game_counts = df.groupby("player_id")["game_id"].nunique()
    if not (game_counts == GAMES_PER_PLAYER).all():
        raise ValueError(
            "Expected exactly 40 unique games per player; counts: "
            f"{game_counts.to_dict()}"
        )

    if not df["player_color"].isin(["white", "black"]).all():
        raise ValueError("Unexpected player_color value")
    if not df["winner"].isin(["white", "black", "draw"]).all():
        raise ValueError("Unexpected winner value")

    numeric = df[NUMERIC_INPUTS].apply(pd.to_numeric, errors="coerce")
    if numeric.isna().any().any():
        bad_columns = numeric.columns[numeric.isna().any()].tolist()
        raise ValueError(f"Missing or nonnumeric required values: {bad_columns}")
    if not np.isfinite(numeric.to_numpy(dtype=float)).all():
        raise ValueError("Non-finite numeric values found in input")
    if (df["total_player_moves"] <= 0).any():
        raise ValueError("Found a game with no player moves")
    if (df["cp_evaluable_moves"] <= 0).any():
        raise ValueError("Found a game with no centipawn-evaluable moves")
    if not (
        df["total_player_moves"]
        == df["cp_evaluable_moves"] + df["mate_evaluation_moves"]
    ).all():
        raise ValueError("Player move counts do not reconcile with CP and mate moves")
    if not df["accuracy"].between(0, 100).all():
        raise ValueError("Accuracy values must be between 0 and 100")
    if not df["best_move_percentage"].between(0, 100).all():
        raise ValueError("Best-move percentages must be between 0 and 100")
    if (df[["average_cpl", "blunders", "mistakes", "inaccuracies",
            "best_moves", "mate_evaluation_moves",
            "missed_forced_mates", "allowed_forced_mates",
            "mate_score_changed", "mate_outcome_preserved"]] < 0).any().any():
        raise ValueError("Negative performance metric found")
    if not (
        df["cp_evaluable_moves"]
        == df["blunders"] + df["mistakes"] + df["inaccuracies"] + df["best_moves"]
    ).all():
        raise ValueError("Move-class counts do not reconcile with CP-evaluable moves")


def outcome_for_player(row):
    if row["winner"] == "draw":
        return "draw", 0.5
    if row["winner"] == row["player_color"]:
        return "win", 1.0
    return "loss", 0.0


def mean_or_none(series):
    """Return None when a player has no observations for a color subset."""
    return float(series.mean()) if len(series) else None


def summarize_player(player_id, games):
    games = games.copy()
    outcomes = games.apply(outcome_for_player, axis=1)
    games["player_result"] = [value[0] for value in outcomes]
    games["result_points"] = [value[1] for value in outcomes]

    count = len(games)
    wins = int((games["player_result"] == "win").sum())
    losses = int((games["player_result"] == "loss").sum())
    draws = int((games["player_result"] == "draw").sum())
    white = games[games["player_color"] == "white"]
    black = games[games["player_color"] == "black"]

    cp_total = int(games["cp_evaluable_moves"].sum())
    player_moves_total = int(games["total_player_moves"].sum())
    cpl_weighted = float(
        (games["average_cpl"] * games["cp_evaluable_moves"]).sum() / cp_total
    )
    accuracy_std = float(games["accuracy"].std(ddof=1))
    cpl_std = float(games["average_cpl"].std(ddof=1))
    best_accuracy_row = games.loc[games["accuracy"].idxmax()]
    worst_accuracy_row = games.loc[games["accuracy"].idxmin()]
    best_cpl_row = games.loc[games["average_cpl"].idxmin()]
    worst_cpl_row = games.loc[games["average_cpl"].idxmax()]

    row = {
        "player_id": player_id,
        "games_analyzed": count,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "win_rate_pct": 100 * wins / count,
        "draw_rate_pct": 100 * draws / count,
        "loss_rate_pct": 100 * losses / count,
        "mean_player_rating": games["player_rating"].mean(),
        "median_player_rating": games["player_rating"].median(),
        "mean_opponent_rating": games["opponent_rating"].mean(),
        "median_opponent_rating": games["opponent_rating"].median(),
        "mean_rating_difference": (
            games["player_rating"] - games["opponent_rating"]
        ).mean(),
        "games_as_white": len(white),
        "games_as_black": len(black),
        "white_wins": int((white["player_result"] == "win").sum()),
        "white_draws": int((white["player_result"] == "draw").sum()),
        "white_losses": int((white["player_result"] == "loss").sum()),
        "white_win_rate_pct": (
            100 * (white["player_result"] == "win").mean() if len(white) else None
        ),
        "white_draw_rate_pct": (
            100 * (white["player_result"] == "draw").mean() if len(white) else None
        ),
        "white_loss_rate_pct": (
            100 * (white["player_result"] == "loss").mean() if len(white) else None
        ),
        "white_score_rate_pct": (
            100 * white["result_points"].mean() if len(white) else None
        ),
        "black_wins": int((black["player_result"] == "win").sum()),
        "black_draws": int((black["player_result"] == "draw").sum()),
        "black_losses": int((black["player_result"] == "loss").sum()),
        "black_win_rate_pct": (
            100 * (black["player_result"] == "win").mean() if len(black) else None
        ),
        "black_draw_rate_pct": (
            100 * (black["player_result"] == "draw").mean() if len(black) else None
        ),
        "black_loss_rate_pct": (
            100 * (black["player_result"] == "loss").mean() if len(black) else None
        ),
        "black_score_rate_pct": (
            100 * black["result_points"].mean() if len(black) else None
        ),
        "white_mean_accuracy_pct": mean_or_none(white["accuracy"]),
        "black_mean_accuracy_pct": mean_or_none(black["accuracy"]),
        "white_mean_cpl": mean_or_none(white["average_cpl"]),
        "black_mean_cpl": mean_or_none(black["average_cpl"]),
        "mean_player_moves_per_game": games["total_player_moves"].mean(),
        "median_player_moves_per_game": games["total_player_moves"].median(),
        "mean_accuracy_pct": games["accuracy"].mean(),
        "median_accuracy_pct": games["accuracy"].median(),
        "accuracy_std_pct": accuracy_std,
        "best_game_accuracy_pct": games["accuracy"].max(),
        "best_accuracy_game_id": best_accuracy_row["game_id"],
        "worst_game_accuracy_pct": games["accuracy"].min(),
        "worst_accuracy_game_id": worst_accuracy_row["game_id"],
        "mean_cpl": games["average_cpl"].mean(),
        "median_cpl": games["average_cpl"].median(),
        "mean_cpl_weighted_by_cp_moves": cpl_weighted,
        "cpl_std": cpl_std,
        "best_game_cpl": games["average_cpl"].min(),
        "best_cpl_game_id": best_cpl_row["game_id"],
        "worst_game_cpl": games["average_cpl"].max(),
        "worst_cpl_game_id": worst_cpl_row["game_id"],
        "mean_best_move_percentage": games["best_move_percentage"].mean(),
        "median_best_move_percentage": games["best_move_percentage"].median(),
        "mean_blunders_per_game": games["blunders"].mean(),
        "mean_mistakes_per_game": games["mistakes"].mean(),
        "mean_inaccuracies_per_game": games["inaccuracies"].mean(),
        "blunders_per_100_cp_moves": 100 * games["blunders"].sum() / cp_total,
        "mistakes_per_100_cp_moves": 100 * games["mistakes"].sum() / cp_total,
        "inaccuracies_per_100_cp_moves": (
            100 * games["inaccuracies"].sum() / cp_total
        ),
        "cp_evaluable_moves_total": cp_total,
        "mate_evaluation_moves_total": int(games["mate_evaluation_moves"].sum()),
        "mate_evaluation_rate_pct": (
            100 * games["mate_evaluation_moves"].sum() / player_moves_total
        ),
        "missed_forced_mates_total": int(games["missed_forced_mates"].sum()),
        "allowed_forced_mates_total": int(games["allowed_forced_mates"].sum()),
        "mate_score_changed_total": int(games["mate_score_changed"].sum()),
        "mate_outcome_preserved_total": int(
            games["mate_outcome_preserved"].sum()
        ),
    }
    return row


def build_profiles(df):
    rows = [
        summarize_player(player_id, games)
        for player_id, games in df.groupby("player_id", sort=True)
    ]
    profiles = pd.DataFrame(rows)

    if len(profiles) != EXPECTED_PLAYERS:
        raise ValueError(f"Expected 30 profiles; produced {len(profiles)}")
    if profiles["player_id"].duplicated().any():
        raise ValueError("Duplicate player profiles produced")
    if not (profiles["games_analyzed"] == GAMES_PER_PLAYER).all():
        raise ValueError("A player profile does not contain exactly 40 games")

    numeric = profiles.select_dtypes(include=[np.number])
    color_specific = {
        "white_win_rate_pct", "white_draw_rate_pct", "white_loss_rate_pct",
        "white_score_rate_pct", "white_mean_accuracy_pct", "white_mean_cpl",
        "black_win_rate_pct", "black_draw_rate_pct", "black_loss_rate_pct",
        "black_score_rate_pct", "black_mean_accuracy_pct", "black_mean_cpl",
    }
    non_color_numeric = [column for column in numeric if column not in color_specific]
    if profiles[non_color_numeric].isna().any().any():
        raise ValueError("Profile output contains unexpected missing numeric values")
    for _, profile in profiles.iterrows():
        white_missing = profile["games_as_white"] == 0
        black_missing = profile["games_as_black"] == 0
        white_fields = [
            "white_win_rate_pct", "white_draw_rate_pct", "white_loss_rate_pct",
            "white_score_rate_pct", "white_mean_accuracy_pct", "white_mean_cpl"
        ]
        black_fields = [
            "black_win_rate_pct", "black_draw_rate_pct", "black_loss_rate_pct",
            "black_score_rate_pct", "black_mean_accuracy_pct", "black_mean_cpl"
        ]
        expected_white_missing = len(white_fields) if white_missing else 0
        actual_white_missing = int(profile[white_fields].isna().sum())
        if actual_white_missing != expected_white_missing:
            raise ValueError(
                f"Unexpected White-only metric missingness for {profile.player_id}"
            )
        expected_black_missing = len(black_fields) if black_missing else 0
        actual_black_missing = int(profile[black_fields].isna().sum())
        if actual_black_missing != expected_black_missing:
            raise ValueError(
                f"Unexpected Black-only metric missingness for {profile.player_id}"
            )
    if not np.isfinite(numeric.dropna().to_numpy(dtype=float)).all():
        raise ValueError("Profile output contains infinite or non-finite values")

    if not (
        profiles["wins"] + profiles["draws"] + profiles["losses"]
        == profiles["games_analyzed"]
    ).all():
        raise ValueError("Outcome totals do not equal games analyzed")
    if not (
        profiles["games_as_white"] + profiles["games_as_black"]
        == profiles["games_analyzed"]
    ).all():
        raise ValueError("Color game counts do not equal games analyzed")
    return profiles


def main():
    if not INPUT_FILE.is_file():
        raise FileNotFoundError(f"Corrected Stockfish output not found: {INPUT_FILE}")
    df = pd.read_csv(INPUT_FILE)
    validate_input(df)
    profiles = build_profiles(df)
    profiles.to_csv(OUTPUT_FILE, index=False)
    print(f"Input game records: {len(df)}")
    print(f"Players profiled: {profiles['player_id'].nunique()}")
    print(f"Games per player: {GAMES_PER_PLAYER}")
    print(f"Profile columns: {len(profiles.columns)}")
    print(f"Saved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
