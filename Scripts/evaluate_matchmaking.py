"""Reproducible Phase 5 sensitivity and baseline checks for PlayerDNA."""

from pathlib import Path

import numpy as np
import pandas as pd

try:  # Supports both ``python Scripts/evaluate_matchmaking.py`` and ``-m``.
    from Scripts.matchmaking import (
        DNA_COLUMNS, DNA_FILE, PROFILE_FILE, get_recommendations, validate_dna,
    )
except ModuleNotFoundError:
    from matchmaking import (
        DNA_COLUMNS, DNA_FILE, PROFILE_FILE, get_recommendations, validate_dna,
    )


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"


def _orders(frame, columns):
    matrix = frame[columns].to_numpy(float)
    ids = frame.player_id.tolist()
    ranked = {}
    for i, player_id in enumerate(ids):
        distances = np.linalg.norm(matrix - matrix[i], axis=1)
        ranked[player_id] = [
            ids[j]
            for j in sorted(
                (j for j in range(len(ids)) if j != i),
                key=lambda j: (distances[j], ids[j]),
            )
        ]
    return ranked


def run():
    frame = pd.read_csv(DNA_FILE)
    validate_dna(frame)
    ids = frame.player_id.tolist()
    baseline = _orders(frame, DNA_COLUMNS)
    method_rows = []
    recommendation_rows = []
    for player_id in ids:
        method_top5 = {}
        for method in ("euclidean", "cosine", "knn_euclidean"):
            recs = get_recommendations(player_id, top_n=5, method=method, frame=frame)
            method_top5[method] = [r["recommended_player_id"] for r in recs]
            for rec in recs:
                recommendation_rows.append({
                    "player_id": player_id,
                    "method": method,
                    "rank": rec["rank"],
                    "recommended_player_id": rec["recommended_player_id"],
                    "score": rec["score"],
                    "score_type": rec["score_type"],
                    "explanation": rec["explanation"],
                    "feature_gaps": repr(rec["feature_gaps"]),
                })
        for method in ("cosine", "knn_euclidean"):
            overlap = len(set(method_top5["euclidean"]) & set(method_top5[method]))
            method_rows.append({
                "player_id": player_id,
                "comparison": f"euclidean_vs_{method}",
                "top5_overlap": overlap,
            })

    method_df = pd.DataFrame(method_rows)
    method_df.to_csv(OUT / "matchmaking_phase5_method_agreement.csv", index=False)
    pd.DataFrame(recommendation_rows).to_csv(
        OUT / "matchmaking_phase5_recommendations.csv", index=False
    )

    ablation_rows = []
    for removed in DNA_COLUMNS:
        remaining = [column for column in DNA_COLUMNS if column != removed]
        ablated = _orders(frame, remaining)
        overlaps, correlations = [], []
        for player_id in ids:
            original = baseline[player_id]
            changed = ablated[player_id]
            overlaps.append(len(set(original[:5]) & set(changed[:5])))
            rank_original = {player: i for i, player in enumerate(original)}
            rank_changed = {player: i for i, player in enumerate(changed)}
            correlations.append(
                pd.Series(rank_original).corr(pd.Series(rank_changed))
            )
        ablation_rows.append({
            "removed_feature": removed,
            "mean_top5_overlap_with_full": float(np.mean(overlaps)),
            "mean_full_ranking_spearman": float(np.mean(correlations)),
            "players_with_identical_top5": int(sum(value == 5 for value in overlaps)),
        })
    ablation = pd.DataFrame(ablation_rows)
    ablation.to_csv(OUT / "matchmaking_feature_ablation.csv", index=False)

    # Average share of pairwise squared Euclidean distance attributable to each
    # robust-scaled feature. Each unordered player pair has equal weight.
    matrix = frame[DNA_COLUMNS].to_numpy(float)
    shares = {column: [] for column in DNA_COLUMNS}
    for i in range(len(matrix)):
        for j in range(i + 1, len(matrix)):
            squared = (matrix[i] - matrix[j]) ** 2
            total = squared.sum()
            if total:
                for column, share in zip(DNA_COLUMNS, squared / total):
                    shares[column].append(float(share))
    contribution = {key: float(np.mean(value)) for key, value in shares.items()}

    profiles = pd.read_csv(PROFILE_FILE).set_index("player_id").loc[ids]
    ratings = profiles.mean_player_rating.to_numpy(float)
    rating_orders = {}
    coverage_rows = []
    for i, player_id in enumerate(ids):
        rating_orders[player_id] = [
            ids[j]
            for j in sorted(
                (j for j in range(len(ids)) if j != i),
                key=lambda j: (abs(ratings[j] - ratings[i]), ids[j]),
            )
        ]
        row = {"player_id": player_id}
        for gap in (50, 100, 150, 200, 250, 300):
            row[f"within_{gap}_rating_points"] = int(
                np.sum(np.abs(ratings - ratings[i]) <= gap) - 1
            )
        for low, high in ((50, 150), (100, 250), (150, 300)):
            row[f"challenge_{low}_{high}_points_higher"] = int(
                np.sum((ratings - ratings[i] >= low) & (ratings - ratings[i] <= high))
            )
        coverage_rows.append(row)
    pd.DataFrame(coverage_rows).to_csv(
        OUT / "matchmaking_rating_candidate_coverage.csv", index=False
    )

    dna_rating_overlap = [
        len(set(baseline[player_id][:5]) & set(rating_orders[player_id][:5]))
        for player_id in ids
    ]
    rng = np.random.default_rng(20261008)
    random_overlap = []
    id_array = np.asarray(ids)
    for _ in range(200):
        for player_id in ids:
            pool = id_array[id_array != player_id]
            random_top5 = rng.choice(pool, size=5, replace=False).tolist()
            random_overlap.append(
                len(set(baseline[player_id][:5]) & set(random_top5))
            )

    # Verify explanations are numeric renderings of the returned source data.
    explanation_checks = 0
    indexed = frame.set_index("player_id")
    for row in recommendation_rows:
        recs = get_recommendations(
            row["player_id"], top_n=5, method=row["method"], frame=frame
        )
        rec = next(r for r in recs if r["recommended_player_id"] == row["recommended_player_id"])
        for gap in rec["feature_gaps"]:
            expected = abs(
                float(indexed.loc[row["player_id"], gap["feature"]])
                - float(indexed.loc[row["recommended_player_id"], gap["feature"]])
            )
            if not np.isclose(gap["raw_gap"], expected):
                raise AssertionError("Explanation raw gap differs from source values")
            explanation_checks += 1

    cosine_overlap = method_df.loc[
        method_df.comparison == "euclidean_vs_cosine", "top5_overlap"
    ].mean()
    knn_overlap = method_df.loc[
        method_df.comparison == "euclidean_vs_knn_euclidean", "top5_overlap"
    ].mean()
    report = [
        "# Phase 5 matchmaking evaluation",
        "",
        f"Dataset: {len(frame)} players, {len(DNA_COLUMNS)} robust-scaled DNA features.",
        "Primary score: Euclidean distance; smaller means closer in this feature space. Default top_n is 5.",
        "",
        "## Similarity method agreement",
        "",
        f"Euclidean vs cosine mean top-five overlap: {cosine_overlap:.2f}/5 across all players.",
        f"Euclidean vs brute-force KNN mean top-five overlap: {knn_overlap:.2f}/5. KNN is the same Euclidean ranking, not an independent metric.",
        "",
        "## Feature sensitivity",
        "",
    ]
    for _, row in ablation.iterrows():
        report.append(
            f"Removing `{row.removed_feature}`: mean top-five overlap "
            f"{row.mean_top5_overlap_with_full:.2f}/5; mean full-ranking "
            f"Spearman {row.mean_full_ranking_spearman:.3f}; "
            f"{int(row.players_with_identical_top5)}/30 unchanged top fives."
        )
    report.extend(["", "Mean share of pairwise squared distance by feature:"])
    report.extend([f"- `{feature}`: {share:.1%}" for feature, share in contribution.items()])
    report.extend([
        "",
        "No feature was removed. These features describe different aspects but are not independent proof of style; they are performance aggregates.",
        "",
        "## Rating and baselines",
        "",
        f"Available mean-player-rating range: {ratings.min():.2f}–{ratings.max():.2f}; these are dataset means, not verified current ratings.",
        f"For a ±100 point filter, eligible candidate count averages {pd.DataFrame(coverage_rows)['within_100_rating_points'].mean():.2f}, range {pd.DataFrame(coverage_rows)['within_100_rating_points'].min()}–{pd.DataFrame(coverage_rows)['within_100_rating_points'].max()}.",
        f"For a ±150 point filter, eligible candidate count averages {pd.DataFrame(coverage_rows)['within_150_rating_points'].mean():.2f}, range {pd.DataFrame(coverage_rows)['within_150_rating_points'].min()}–{pd.DataFrame(coverage_rows)['within_150_rating_points'].max()}.",
        f"Challenge candidates in the +100 to +250 point band average {pd.DataFrame(coverage_rows)['challenge_100_250_points_higher'].mean():.2f}, with minimum {pd.DataFrame(coverage_rows)['challenge_100_250_points_higher'].min()}.",
        f"Mean overlap of DNA top five with rating-nearest top five: {np.mean(dna_rating_overlap):.2f}/5.",
        f"Mean overlap with 200-seed random top-five baseline: {np.mean(random_overlap):.2f}/5 (expected overlap is about 0.86/5 for 5 of 29 sampled candidates).",
        "Rating should remain separate from style similarity. Balanced/challenge modes need agreed gap policies and current rating data; only Most Similar is implemented.",
        "",
        "## Explanation and limitations",
        "",
        f"Checked {explanation_checks} feature-gap values against source data; all matched. Explanations include the observed raw values and robust-scaled DNA gaps, sorted by smallest gap.",
        "Thirty profiles and no suitable-opponent ground truth support sanity checks only. Do not interpret overlap as matchmaking accuracy or match quality.",
        "",
        "Artifacts: `matchmaking_phase5_recommendations.csv`, `matchmaking_phase5_method_agreement.csv`, `matchmaking_feature_ablation.csv`, and `matchmaking_rating_candidate_coverage.csv`.",
    ])
    (OUT / "matchmaking_phase5_evaluation.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    run()
