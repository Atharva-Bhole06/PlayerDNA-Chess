# Player similarity baseline evaluation

Input: data/player_dna.csv (30 players; 3 normalized DNA dimensions).
The raw accompanying values, ratings, and results are not used in distance calculations. The output contains all ordered non-self pairs.

## Methods compared

- Euclidean distance: lower is closer in the robust-scaled feature space.
- Cosine similarity: higher is more aligned in vector direction.
- KNN: brute-force nearest-neighbor retrieval using Euclidean distance. It is a retrieval procedure, so its ranks and distances are identical to Euclidean by definition; it is not an independent metric.

## Ranking agreement

Cosine vs Euclidean mean top-5 overlap: 3.43/5; mean per-player Spearman rank correlation: 0.684.
KNN vs Euclidean mean top-5 overlap: 5.00/5; mean per-player Spearman rank correlation: 1.000.
Bootstrap stability (200 resamples of each player's 40 games, re-fitting robust scaling): mean overlap with the original top five is 2.49/5 per player. 3 of the 150 original top-five slots reappear in at least 80% of bootstrap top-five lists.

## Primary method

Use Euclidean distance over the three already robust-scaled DNA features for the primary Most Similar mode. It uses feature magnitude differences, is easy to explain through per-feature normalized gaps, and fits this small low-dimensional dataset. Cosine is retained as a comparison because it ranks vector direction and can behave differently after median-centering. KNN is a convenient retrieval implementation of the Euclidean ranking, not a distinct model.

The recommendation output is similarity, not match quality. Rating is reported only as context in the five-player sample and does not affect DNA ranks.

## Sample recommendations

Five sample players and their top five Euclidean recommendations are in data/matchmaking_sample_recommendations.csv. Explanations list the actual raw feature values and normalized feature gaps.

## Matchmaking modes

- Most Similar: implemented using DNA Euclidean distance.
- Balanced Opponent: rating may be a separate configurable eligibility constraint, then DNA distance ranks eligible players. Threshold requires a product decision; it is not silently hard-coded here.
- Challenge: separately specify a desired positive rating gap, then rank style-similar candidates in that band. The current 30-player sample may leave too few eligible candidates.

## Limits and future evaluation

Thirty players support a proof-of-concept only. No ground-truth suitable-opponent labels exist, so no accuracy score is claimed. Use stability across resampling or future held-out cohorts, expert/player review, and candidate coverage before production claims.

All rankings by query and method are in data/player_similarity.csv; per-player top-five agreement is in data/matchmaking_ranking_agreement.csv; candidate bootstrap frequencies are in data/matchmaking_stability.csv.
