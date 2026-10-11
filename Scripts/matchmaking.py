"""Explainable player-similarity baseline over the Phase 3 DNA vectors.

Ratings and game outcomes are never used to compute DNA distance. KNN is
implemented as brute-force Euclidean neighbor retrieval; it is a retrieval
procedure, not a third independent distance metric.
"""

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DNA_FILE = ROOT / "data" / "player_dna.csv"
PROFILE_FILE = ROOT / "data" / "player_profiles.csv"
GAME_FILE = ROOT / "data" / "chess_performance_features_v2.csv"
PAIRWISE_FILE = ROOT / "data" / "player_similarity.csv"
SAMPLE_FILE = ROOT / "data" / "matchmaking_sample_recommendations.csv"
STABILITY_FILE = ROOT / "data" / "matchmaking_stability.csv"
REPORT_FILE = ROOT / "data" / "matchmaking_method_comparison.md"
DNA_COLUMNS = [
    "dna_median_cpl",
    "dna_cpl_std",
    "dna_inaccuracies_per_100_cp_moves",
]
RAW_BY_DNA = {
    "dna_median_cpl": "median_cpl",
    "dna_cpl_std": "cpl_std",
    "dna_inaccuracies_per_100_cp_moves": "inaccuracies_per_100_cp_moves",
}
METHODS = ("euclidean", "cosine", "knn_euclidean")
DEMO_PLAYERS = ["aaaaaaaddd", "bear789", "dipset", "erikweisz", "vladimir-kramnik-1"]


def validate_dna(frame):
    required = {"player_id", *DNA_COLUMNS, *RAW_BY_DNA.values()}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Player DNA is missing required columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("Player DNA dataset is empty")
    if frame["player_id"].isna().any() or frame["player_id"].duplicated().any():
        raise ValueError("Player identifiers are missing or duplicated")
    values = frame[DNA_COLUMNS].apply(pd.to_numeric, errors="coerce")
    if values.isna().any().any():
        raise ValueError("Normalized DNA features contain missing/nonnumeric values")
    if not np.isfinite(values.to_numpy(float)).all():
        raise ValueError("Normalized DNA features contain non-finite values")
    norms = np.linalg.norm(values.to_numpy(float), axis=1)
    if (norms == 0).any():
        raise ValueError(
            "Cosine similarity is undefined for a zero-length DNA vector"
        )


def _rank_one(frame, query_id, method):
    if method not in METHODS:
        raise ValueError(f"Unknown method {method!r}; choose one of {METHODS}")
    player_ids = frame["player_id"].tolist()
    if query_id not in set(player_ids):
        raise ValueError(f"Unknown player_id: {query_id!r}")
    query_index = player_ids.index(query_id)
    matrix = frame[DNA_COLUMNS].to_numpy(dtype=float)
    query = matrix[query_index]
    euclidean = np.linalg.norm(matrix - query, axis=1)
    cosine = matrix @ query / (
        np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    )
    candidates = []
    for i, candidate_id in enumerate(player_ids):
        if i == query_index:
            continue
        if method == "cosine":
            score = float(cosine[i])
            primary_sort = -score
            score_type = "cosine_similarity_higher_is_better"
        elif method == "knn_euclidean":
            score = float(euclidean[i])
            primary_sort = score
            score_type = "euclidean_neighbor_distance_lower_is_better"
        else:
            score = float(euclidean[i])
            primary_sort = score
            score_type = "euclidean_distance_lower_is_better"
        candidates.append({
            "player_id": query_id,
            "candidate_id": candidate_id,
            "method": method,
            "score": score,
            "score_type": score_type,
            "_sort": (primary_sort, candidate_id),
            "_index": i,
            "_euclidean": float(euclidean[i]),
            "_cosine": float(cosine[i]),
        })
    candidates.sort(key=lambda row: row["_sort"])
    for rank, candidate in enumerate(candidates, start=1):
        candidate["rank"] = rank
        del candidate["_sort"]
    return candidates


def get_recommendations(
    player_id, mode="most_similar", top_n=5, method="euclidean", frame=None
):
    """Return ranked recommendations for a supported matchmaking mode.

    Only ``most_similar`` is currently supported. Balanced/challenge modes
    need an explicit rating policy and trustworthy current ratings; they must
    not silently change the DNA ranking.
    """
    if mode != "most_similar":
        raise ValueError(
            f"Unsupported mode {mode!r}; currently supported mode is "
            "'most_similar'"
        )
    if isinstance(top_n, bool) or not isinstance(top_n, int) or top_n < 1:
        raise ValueError("top_n must be a positive integer")
    if frame is None:
        frame = pd.read_csv(DNA_FILE)
    validate_dna(frame)
    ranked = _rank_one(frame, player_id, method)
    query = frame.set_index("player_id").loc[player_id]
    recommendations = []
    for candidate in ranked[:min(top_n, len(ranked))]:
        other = frame.set_index("player_id").loc[candidate["candidate_id"]]
        gaps = []
        for dna_column, raw_column in RAW_BY_DNA.items():
            normalized_gap = abs(
                float(query[dna_column]) - float(other[dna_column])
            )
            raw_gap = abs(float(query[raw_column]) - float(other[raw_column]))
            gaps.append({
                "feature": raw_column,
                "query_value": float(query[raw_column]),
                "candidate_value": float(other[raw_column]),
                "raw_gap": raw_gap,
                "normalized_gap": normalized_gap,
            })
        gaps.sort(key=lambda item: (item["normalized_gap"], item["feature"]))
        explanation = "; ".join(
            f"{item['feature']} {item['query_value']:.2f} vs "
            f"{item['candidate_value']:.2f} "
            f"(DNA gap {item['normalized_gap']:.3f})"
            for item in gaps
        )
        recommendations.append({
            "player_id": player_id,
            "recommended_player_id": candidate["candidate_id"],
            "method": method,
            "rank": candidate["rank"],
            "score": candidate["score"],
            "score_type": candidate["score_type"],
            "euclidean_distance": candidate["_euclidean"],
            "cosine_similarity": candidate["_cosine"],
            "explanation": explanation,
            "feature_gaps": gaps,
        })
    return recommendations


def all_pairwise_rankings(frame):
    rows = []
    for player_id in frame["player_id"]:
        for method in METHODS:
            for candidate in _rank_one(frame, player_id, method):
                rows.append({
                    "player_id": player_id,
                    "candidate_id": candidate["candidate_id"],
                    "method": method,
                    "rank": candidate["rank"],
                    "score": candidate["score"],
                    "score_type": candidate["score_type"],
                })
    return pd.DataFrame(rows)


def ranking_agreement(pairwise):
    by_method = {
        method: pairwise[pairwise.method == method]
        for method in METHODS
    }
    comparisons = []
    top5_overlaps = {method: [] for method in ("cosine", "knn_euclidean")}
    spearman_values = {method: [] for method in ("cosine", "knn_euclidean")}
    for player_id in pairwise["player_id"].unique():
        euclidean_rows = by_method["euclidean"].query("player_id == @player_id")
        euclidean_order = euclidean_rows.sort_values("rank")["candidate_id"].tolist()
        euclidean_rank = euclidean_rows.set_index("candidate_id")["rank"]
        for method in ("cosine", "knn_euclidean"):
            other_rows = by_method[method].query("player_id == @player_id")
            other_order = other_rows.sort_values("rank")["candidate_id"].tolist()
            overlap = len(set(euclidean_order[:5]) & set(other_order[:5]))
            top5_overlaps[method].append(overlap)
            other_rank = other_rows.set_index("candidate_id")["rank"]
            aligned = pd.DataFrame({
                "euclidean": euclidean_rank,
                "other": other_rank,
            })
            rho = aligned.corr().iloc[0, 1]
            spearman_values[method].append(float(rho))
            comparisons.append({
                "player_id": player_id,
                "comparison": f"euclidean_vs_{method}",
                "top5_overlap": overlap,
                "spearman_rank_correlation": float(rho),
            })
    summary = {
        method: {
            "mean_top5_overlap": float(np.mean(top5_overlaps[method])),
            "mean_spearman": float(np.mean(spearman_values[method])),
        }
        for method in top5_overlaps
    }
    return pd.DataFrame(comparisons), summary


def bootstrap_stability(frame, replicates=200, seed=42):
    """Bootstrap each player's 40 games and recount Euclidean top-five ranks."""
    games = pd.read_csv(GAME_FILE)
    required = {
        "player_id", "game_id", "average_cpl", "cp_evaluable_moves",
        "inaccuracies",
    }
    missing = required - set(games.columns)
    if missing:
        raise ValueError(
            f"Game features are missing bootstrap columns: {sorted(missing)}"
        )
    if set(games["player_id"]) != set(frame["player_id"]):
        raise ValueError("Bootstrap source player set differs from Player DNA")
    grouped = {
        player_id: group.reset_index(drop=True)
        for player_id, group in games.groupby("player_id", sort=False)
    }
    if any(len(group) != 40 for group in grouped.values()):
        raise ValueError("Bootstrap stability expects 40 games per player")

    player_ids = frame["player_id"].tolist()
    baseline_top5 = {
        player_id: [
            item["candidate_id"]
            for item in _rank_one(frame, player_id, "euclidean")[:5]
        ]
        for player_id in player_ids
    }
    appearances = {
        player_id: {candidate_id: 0 for candidate_id in player_ids
                    if candidate_id != player_id}
        for player_id in player_ids
    }
    rng = np.random.default_rng(seed)
    overlap_total = 0

    for _ in range(replicates):
        resampled_profiles = []
        for player_id in player_ids:
            source = grouped[player_id]
            sample = source.iloc[rng.integers(0, len(source), len(source))]
            cp_moves = int(sample["cp_evaluable_moves"].sum())
            resampled_profiles.append({
                "player_id": player_id,
                "median_cpl": float(sample["average_cpl"].median()),
                "cpl_std": float(sample["average_cpl"].std(ddof=1)),
                "inaccuracies_per_100_cp_moves": (
                    100 * float(sample["inaccuracies"].sum()) / cp_moves
                ),
            })
        raw = pd.DataFrame(resampled_profiles).set_index("player_id")
        median = raw.median()
        iqr = raw.quantile(.75) - raw.quantile(.25)
        if (iqr == 0).any():
            raise ValueError("A bootstrap replicate produced a zero-IQR feature")
        scaled = (raw - median) / iqr
        matrix = scaled.to_numpy(float)

        for i, player_id in enumerate(player_ids):
            distances = np.linalg.norm(matrix - matrix[i], axis=1)
            ranked = sorted(
                ((float(distances[j]), player_ids[j])
                 for j in range(len(player_ids)) if j != i),
                key=lambda item: (item[0], item[1]),
            )
            top5 = [candidate for _, candidate in ranked[:5]]
            overlap_total += len(set(top5) & set(baseline_top5[player_id]))
            for candidate_id in top5:
                appearances[player_id][candidate_id] += 1

    result = []
    for player_id in player_ids:
        baseline_ranks = {
            item["candidate_id"]: item["rank"]
            for item in _rank_one(frame, player_id, "euclidean")
        }
        for candidate_id, count in appearances[player_id].items():
            result.append({
                "player_id": player_id,
                "candidate_id": candidate_id,
                "baseline_euclidean_rank": baseline_ranks[candidate_id],
                "bootstrap_top5_frequency": count / replicates,
                "bootstrap_top5_count": count,
                "bootstrap_replicates": replicates,
            })
    mean_overlap = overlap_total / (replicates * len(player_ids))
    return pd.DataFrame(result), mean_overlap


def write_outputs(frame):
    pairwise = all_pairwise_rankings(frame)
    PAIRWISE_FILE.parent.mkdir(parents=True, exist_ok=True)
    pairwise.to_csv(PAIRWISE_FILE, index=False)

    sample_rows = []
    profiles = pd.read_csv(PROFILE_FILE).set_index("player_id")
    for player_id in DEMO_PLAYERS:
        recs = get_recommendations(player_id, top_n=5, frame=frame)
        for rec in recs:
            rating_gap = abs(
                float(profiles.loc[player_id, "mean_player_rating"])
                - float(profiles.loc[rec["recommended_player_id"], "mean_player_rating"])
            )
            sample_rows.append({
                key: rec[key] for key in [
                    "player_id", "recommended_player_id", "method", "rank",
                    "score", "score_type", "euclidean_distance",
                    "cosine_similarity", "explanation",
                ]
            } | {"absolute_rating_difference_context_only": rating_gap})
    sample = pd.DataFrame(sample_rows)
    sample.to_csv(SAMPLE_FILE, index=False)

    per_player, agreement = ranking_agreement(pairwise)
    stability, bootstrap_overlap = bootstrap_stability(frame)
    stability.to_csv(STABILITY_FILE, index=False)
    stable_top5_slots = int(
        (
            stability.loc[
                stability["baseline_euclidean_rank"] <= 5,
                "bootstrap_top5_frequency",
            ] >= .8
        ).sum()
    )
    report_lines = [
        "# Player similarity baseline evaluation",
        "",
        f"Input: data/player_dna.csv ({len(frame)} players; "
        f"{len(DNA_COLUMNS)} normalized DNA dimensions).",
        "The raw accompanying values, ratings, and results are not used in "
        "distance calculations. The output contains all ordered non-self pairs.",
        "",
        "## Methods compared",
        "",
        "- Euclidean distance: lower is closer in the robust-scaled feature space.",
        "- Cosine similarity: higher is more aligned in vector direction.",
        "- KNN: brute-force nearest-neighbor retrieval using Euclidean distance. "
        "It is a retrieval procedure, so its ranks and distances are identical "
        "to Euclidean by definition; it is not an independent metric.",
        "",
        "## Ranking agreement",
        "",
        f"Cosine vs Euclidean mean top-5 overlap: "
        f"{agreement['cosine']['mean_top5_overlap']:.2f}/5; mean per-player "
        f"Spearman rank correlation: {agreement['cosine']['mean_spearman']:.3f}.",
        f"KNN vs Euclidean mean top-5 overlap: "
        f"{agreement['knn_euclidean']['mean_top5_overlap']:.2f}/5; mean "
        f"per-player Spearman rank correlation: "
        f"{agreement['knn_euclidean']['mean_spearman']:.3f}.",
        f"Bootstrap stability (200 resamples of each player's 40 games, "
        f"re-fitting robust scaling): mean overlap with the original top five "
        f"is {bootstrap_overlap:.2f}/5 per player. {stable_top5_slots} of the "
        f"150 original top-five slots reappear in at least 80% of bootstrap "
        f"top-five lists.",
        "",
        "## Primary method",
        "",
        "Use Euclidean distance over the three already robust-scaled DNA "
        "features for the primary Most Similar mode. It uses feature magnitude "
        "differences, is easy to explain through per-feature normalized gaps, "
        "and fits this small low-dimensional dataset. Cosine is retained as a "
        "comparison because it ranks vector direction and can behave "
        "differently after median-centering. KNN is a convenient retrieval "
        "implementation of the Euclidean ranking, not a distinct model.",
        "",
        "The recommendation output is similarity, not match quality. Rating "
        "is reported only as context in the five-player sample and does not "
        "affect DNA ranks.",
        "",
        "## Sample recommendations",
        "",
        "Five sample players and their top five Euclidean recommendations are "
        "in data/matchmaking_sample_recommendations.csv. Explanations list the "
        "actual raw feature values and normalized feature gaps.",
        "",
        "## Matchmaking modes",
        "",
        "- Most Similar: implemented using DNA Euclidean distance.",
        "- Balanced Opponent: rating may be a separate configurable eligibility "
        "constraint, then DNA distance ranks eligible players. Threshold "
        "requires a product decision; it is not silently hard-coded here.",
        "- Challenge: separately specify a desired positive rating gap, then "
        "rank style-similar candidates in that band. The current 30-player "
        "sample may leave too few eligible candidates.",
        "",
        "## Limits and future evaluation",
        "",
        "Thirty players support a proof-of-concept only. No ground-truth "
        "suitable-opponent labels exist, so no accuracy score is claimed. "
        "Use stability across resampling or future held-out cohorts, expert/"
        "player review, and candidate coverage before production claims.",
        "",
        "All rankings by query and method are in data/player_similarity.csv; "
        "per-player top-five agreement is in "
        "data/matchmaking_ranking_agreement.csv; candidate bootstrap "
        "frequencies are in data/matchmaking_stability.csv.",
    ]
    (ROOT / "data" / "matchmaking_ranking_agreement.csv").write_text(
        per_player.to_csv(index=False), encoding="utf-8"
    )
    REPORT_FILE.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    return pairwise, sample, agreement, bootstrap_overlap


def main():
    if not DNA_FILE.is_file():
        raise FileNotFoundError(f"Player DNA input not found: {DNA_FILE}")
    frame = pd.read_csv(DNA_FILE)
    validate_dna(frame)
    pairwise, sample, agreement, bootstrap_overlap = write_outputs(frame)
    print(f"Players: {frame.player_id.nunique()}")
    print(f"DNA features used: {DNA_COLUMNS}")
    print(f"Pairwise method rows: {len(pairwise)}")
    print(f"Five-player top-five samples: {len(sample)}")
    print(f"Euclidean/cosine mean top-five overlap: "
          f"{agreement['cosine']['mean_top5_overlap']:.2f}/5")
    print(f"Bootstrap mean top-five overlap: {bootstrap_overlap:.2f}/5")
    print(f"Outputs: {PAIRWISE_FILE}, {SAMPLE_FILE}, {REPORT_FILE}")


if __name__ == "__main__":
    main()
