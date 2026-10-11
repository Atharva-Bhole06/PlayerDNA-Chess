# Phase 5 matchmaking evaluation

Dataset: 30 players, 3 robust-scaled DNA features.
Primary score: Euclidean distance; smaller means closer in this feature space. Default top_n is 5.

## Similarity method agreement

Euclidean vs cosine mean top-five overlap: 3.43/5 across all players.
Euclidean vs brute-force KNN mean top-five overlap: 5.00/5. KNN is the same Euclidean ranking, not an independent metric.

## Feature sensitivity

Removing `dna_median_cpl`: mean top-five overlap 3.27/5; mean full-ranking Spearman 0.896; 3/30 unchanged top fives.
Removing `dna_cpl_std`: mean top-five overlap 2.93/5; mean full-ranking Spearman 0.767; 1/30 unchanged top fives.
Removing `dna_inaccuracies_per_100_cp_moves`: mean top-five overlap 3.27/5; mean full-ranking Spearman 0.791; 0/30 unchanged top fives.

Mean share of pairwise squared distance by feature:
- `dna_median_cpl`: 27.8%
- `dna_cpl_std`: 35.5%
- `dna_inaccuracies_per_100_cp_moves`: 36.7%

No feature was removed. These features describe different aspects but are not independent proof of style; they are performance aggregates.

## Rating and baselines

Available mean-player-rating range: 1281.75–2094.32; these are dataset means, not verified current ratings.
For a ±100 point filter, eligible candidate count averages 6.40, range 1–10.
For a ±150 point filter, eligible candidate count averages 8.33, range 3–12.
Challenge candidates in the +100 to +250 point band average 4.13, with minimum 0.
Mean overlap of DNA top five with rating-nearest top five: 1.67/5.
Mean overlap with 200-seed random top-five baseline: 0.88/5 (expected overlap is about 0.86/5 for 5 of 29 sampled candidates).
Rating should remain separate from style similarity. Balanced/challenge modes need agreed gap policies and current rating data; only Most Similar is implemented.

## Explanation and limitations

Checked 1350 feature-gap values against source data; all matched. Explanations include the observed raw values and robust-scaled DNA gaps, sorted by smallest gap.
Thirty profiles and no suitable-opponent ground truth support sanity checks only. Do not interpret overlap as matchmaking accuracy or match quality.

Artifacts: `matchmaking_phase5_recommendations.csv`, `matchmaking_phase5_method_agreement.csv`, `matchmaking_feature_ablation.csv`, and `matchmaking_rating_candidate_coverage.csv`.
