# Live Player DNA and model evaluation

## Provenance and features

`live_move_analyses` is written only by the post-game worker after replaying
saved legal moves. `live_player_dna_history` snapshots summarize successfully
analyzed registered-user games; imported Kaggle/cohort players are excluded.
Feature version `live_dna_raw_v1` contains median CPL, population standard
deviation of CPL, and inaccuracies per 100 centipawn-evaluable moves. Mate-only
positions do not produce CPL. A snapshot is stored once per user and analyzed
game and records how many analyzed games contributed to it.

Game reports classify centipawn loss as best/near-best (0–10 cp), inaccuracy
(over 10 and under 50), mistake (50–99), or blunder (100+). Accuracy is
`100 × exp(−average CPL / 100)` over centipawn-evaluable moves; it is a
consistent summary of these engine searches, not a universal accuracy scale.
Performance stars are unavailable below eight evaluable moves. Otherwise five
stars require estimated accuracy of at least 90% and no blunders, four require
at least 75% and at most one blunder, and the remaining analyzed games receive
three stars. The outcome is not part of the star calculation.

Queue matching first restricts candidates by competitive Elo. If at least five
registered users have three analyzed games each and both candidates have at
least three, it uses the IQR-normalized Euclidean distance across the three
measured DNA features only as a secondary tie-break. It cannot widen or override
the Elo window. Missing DNA falls back to rating difference and queue age.

## Style clustering

The supported unsupervised task is grouping registered players by the three
live DNA features. The training script takes one latest eligible snapshot per
user, imputes missing values with the median, standardizes features, and fits
K-Means for `k=2..min(5,n-1)` with seed 42 and 20 initializations. It chooses
the highest silhouette score, compares it with the `k=2` baseline, and reports
bootstrap silhouette uncertainty. These are in-sample unsupervised grouping
metrics; silhouette is not a prediction accuracy or evidence of improved
match quality. The minimum is ten eligible accounts, each with three analyzed
games. The resulting joblib artifact is versioned under `artifacts/models/`;
metadata, feature version, row count, fingerprint, and metrics are persisted in
PostgreSQL. Profile inference loads the latest valid artifact and returns an
experimental cluster label. If the artifact or ML runtime is unavailable, the
profile shows no cluster and matchmaking still works.

Train with:

```powershell
python -m pip install -r requirements-ml.txt
python -m Scripts.train_player_style_model
```

No style model is claimed as trained until this command runs against a
reachable PostgreSQL database containing enough live analyzed users. Do not
run with the historical Kaggle cohort as a substitute.

## Outcome prediction policy

There is no live match-outcome model. Elo supplies the competitive rating and is
not called machine learning. The checked-in historical dataset is kept separate
from live accounts. An experimental outcome model should wait for sufficient
genuine, provenance-labeled platform games, then use only pre-game features,
split by time and game (and by player when appropriate), compare with the Elo
probability baseline, and report held-out calibration and uncertainty. No
post-game move-quality feature is eligible as an outcome predictor.
