"""Create the approved, scaled Player DNA feature foundation.

The selected vector contains performance/behavior metrics only. It excludes
ratings and game outcomes. Robust scaling is calculated as (x - median) / IQR
using NumPy percentiles, equivalent to the default 25th-to-75th percentile
RobustScaler transform.
"""

from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_FILE = PROJECT_ROOT / "data" / "player_profiles.csv"
OUTPUT_FILE = PROJECT_ROOT / "data" / "player_dna.csv"
SCALER_FILE = PROJECT_ROOT / "data" / "player_dna_scaler_parameters.csv"
EXPECTED_PLAYERS = 30

# Keep one robust overall quality measure, one consistency measure, and one
# error-distribution measure. Correlation/derivation review is documented in
# data/player_dna_feature_dictionary.md.
DNA_FEATURES = [
    "median_cpl",
    "cpl_std",
    "inaccuracies_per_100_cp_moves",
]


def validate_profiles(profiles):
    required = {"player_id", *DNA_FEATURES}
    missing = required - set(profiles.columns)
    if missing:
        raise ValueError(f"Profile data is missing required columns: {sorted(missing)}")
    if len(profiles) != EXPECTED_PLAYERS:
        raise ValueError(
            f"Expected {EXPECTED_PLAYERS} player rows; found {len(profiles)}"
        )
    if profiles["player_id"].isna().any() or profiles["player_id"].duplicated().any():
        raise ValueError("Player identifiers are missing or duplicated")

    numeric = profiles[DNA_FEATURES].apply(pd.to_numeric, errors="coerce")
    if numeric.isna().any().any():
        raise ValueError("Selected Player DNA features contain missing/nonnumeric values")
    values = numeric.to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("Selected Player DNA features contain non-finite values")
    if (numeric["median_cpl"] < 0).any() or (numeric["cpl_std"] < 0).any():
        raise ValueError("CPL features must be nonnegative")
    if not numeric["inaccuracies_per_100_cp_moves"].between(0, 100).all():
        raise ValueError("Inaccuracy rate must be between 0 and 100")
    return numeric


def robust_scale(numeric):
    medians = numeric.median(axis=0)
    q1 = numeric.quantile(0.25, axis=0, interpolation="linear")
    q3 = numeric.quantile(0.75, axis=0, interpolation="linear")
    iqrs = q3 - q1
    if (iqrs == 0).any():
        zero_iqr = iqrs[iqrs == 0].index.tolist()
        raise ValueError(f"Cannot robust-scale zero-IQR features: {zero_iqr}")
    scaled = (numeric - medians) / iqrs
    return scaled, medians, q1, q3, iqrs


def main():
    if not INPUT_FILE.is_file():
        raise FileNotFoundError(f"Player profile file not found: {INPUT_FILE}")
    profiles = pd.read_csv(INPUT_FILE)
    numeric = validate_profiles(profiles)
    scaled, medians, q1, q3, iqrs = robust_scale(numeric)

    output = pd.DataFrame({"player_id": profiles["player_id"]})
    for feature in DNA_FEATURES:
        output[feature] = numeric[feature]
        output[f"dna_{feature}"] = scaled[feature]

    if len(output) != EXPECTED_PLAYERS:
        raise ValueError(f"Expected 30 DNA rows; produced {len(output)}")
    if output["player_id"].duplicated().any():
        raise ValueError("Duplicate identifiers in Player DNA output")
    if output.isna().any().any():
        raise ValueError("Player DNA output contains missing values")
    if not np.isfinite(
        output.select_dtypes(include=[np.number]).to_numpy(dtype=float)
    ).all():
        raise ValueError("Player DNA output contains non-finite values")
    if not output["player_id"].equals(profiles["player_id"]):
        raise ValueError("Player identifiers/order changed during transformation")

    # Record transformation parameters so future profiles can use the same
    # fitted transformation rather than refitting on new or held-out data.
    scaler_parameters = pd.DataFrame({
        "feature": DNA_FEATURES,
        "median": [medians[f] for f in DNA_FEATURES],
        "q1": [q1[f] for f in DNA_FEATURES],
        "q3": [q3[f] for f in DNA_FEATURES],
        "iqr_scale": [iqrs[f] for f in DNA_FEATURES],
        "transformation": ["(value - median) / IQR"] * len(DNA_FEATURES),
    })

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(OUTPUT_FILE, index=False)
    scaler_parameters.to_csv(SCALER_FILE, index=False)
    print(f"Player DNA rows: {len(output)}")
    print(f"Selected features: {DNA_FEATURES}")
    print(f"Normalization: RobustScaler-equivalent (median/IQR)")
    print(f"Saved: {OUTPUT_FILE}")
    print(f"Saved scaling parameters: {SCALER_FILE}")


if __name__ == "__main__":
    main()
