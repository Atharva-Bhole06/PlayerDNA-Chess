# Player profile EDA

Input: data/player_profiles.csv (30 players, 65 columns).

Every profile represents 40 games. There are no duplicate players or infinite numerical values. Twelve color-specific fields are undefined for bleda and ssf7 because each has 40 White games and no Black games.

## Recommended DNA features

- median_cpl: robust typical game-level centipawn loss.
- cpl_std: game-to-game variability in game-level CPL.
- inaccuracies_per_100_cp_moves: moderate-error frequency among centipawn-evaluable moves.

All three vary across the 30 players. Robust scaling is recommended. The vector describes measured performance tendencies, not a full chess style model.

PCA visualization explained variance: PC1 69.10%, PC2 20.88%, PC3 10.02%; first two retain 89.98%.

## Highly correlated feature pairs (absolute Pearson r >= 0.85)

| Feature 1 | Feature 2 | r |
|---|---|---:|
| mean_accuracy_pct | median_accuracy_pct | 0.979 |
| mean_cpl_weighted_by_cp_moves | blunders_per_100_cp_moves | 0.978 |
| median_cpl | mean_cpl_weighted_by_cp_moves | 0.958 |
| median_cpl | blunders_per_100_cp_moves | 0.933 |
| mean_accuracy_pct | median_cpl | -0.921 |
| mean_accuracy_pct | blunders_per_100_cp_moves | -0.913 |
| mean_accuracy_pct | mean_cpl_weighted_by_cp_moves | -0.881 |
| median_accuracy_pct | median_cpl | -0.873 |
| median_accuracy_pct | blunders_per_100_cp_moves | -0.869 |

Notable redundancies: mean and median accuracy correlate at about 0.98; mean accuracy and median CPL at about -0.92; median CPL and blunders per 100 CP moves at about 0.93; weighted CPL and blunders per 100 CP moves at about 0.98. Accuracy, all error-class rates, and multiple CPL summaries should not all receive independent weight.

## Other EDA findings

IQR outliers (1.5×IQR rule) among selected and related metrics:

| Feature | Players flagged |
|---|---|
| median_cpl | None |
| cpl_std | erikweisz, tetley |
| inaccuracies_per_100_cp_moves | None |
| mean_accuracy_pct | aaaaaaaddd |
| mean_best_move_percentage | None |
| blunders_per_100_cp_moves | None |
| mate_evaluation_rate_pct | None |

Win-rate relationships (Pearson r across 30 players; descriptive):

| Feature | r with win_rate_pct |
|---|---:|
| mean_accuracy_pct | 0.601 |
| median_cpl | -0.658 |
| blunders_per_100_cp_moves | -0.588 |
| mean_player_rating | 0.640 |

White/Black comparison uses 28 players with at least one game in both colors. Mean White-minus-Black accuracy difference is 1.42 percentage points (median 0.12); mean White-minus-Black CPL difference is -2.11 centipawns (median -4.59). These are descriptive only; sample sizes are unequal and include very small color subsets.

The profile sample has only 30 players. Correlations are exploratory, not causal or population-level claims. Accuracy is a project-defined threshold-rate metric. Phase-specific, positional, tactical-motif, and opening performance features are unavailable.

Full numeric summaries are in player_profiles_numeric_summary.csv; the complete candidate correlation matrix is in player_profiles_correlations.csv.

## Visualizations

- visualizations/player_dna_distributions.svg
- visualizations/player_profile_correlation.svg
- visualizations/player_dna_player_comparison.svg
- visualizations/player_dna_pca.svg
