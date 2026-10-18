# PlayerDNA — Complete AI/ML Algorithm Audit & Project Demonstration Guide

**Project Name:** PlayerDNA (Chess Intelligence & Player Style Analytics Platform)  
**Workspace:** `AIML_Project-chess-`  
**Audit Date:** October 2026  
**Auditor:** AI Technical Audit Agent  
**Target Audience:** Academic Faculty, Project Evaluators, Viva Examiners, and Student Presenters  

---

## Executive Summary

This audit is an empirical, code-level investigation of the `PlayerDNA` chess platform. Its goal is to provide a factually grounded account of the machine learning, search-based AI, statistical rating, and conventional software engineering techniques implemented in the codebase.

### Key Audit Findings

1. **Does this project genuinely use machine learning?**  
   **Yes, but strictly scoped.** The project implements **unsupervised machine learning** using **Scikit-Learn K-Means Clustering** (`sklearn.cluster.KMeans`) and **Nearest Neighbor / Distance-based vector matching** (Euclidean distance, Cosine similarity, and k-NN retrieval) over behavioral feature vectors. It does **not** train deep neural networks or supervised game-outcome classifiers.
2. **Which exact ML algorithms are confirmed in the code?**  
   - **K-Means Clustering (`sklearn.cluster.KMeans`):** Trained on live player move-quality vectors with median imputation, robust/standard scaling, silhouette scoring across $k \in [2, 5]$, and bootstrap uncertainty validation ([Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L38-L118)).
   - **Nearest Neighbor Retrieval / Metric Matching (Euclidean Distance & k-NN):** Implemented in [Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L57-L100) and deployed in live competitive queue tie-breaking in [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L46-L83).
   - **Principal Component Analysis (PCA via Singular Value Decomposition):** Implemented in [Scripts/eda_player_profiles.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L164-L199) using `numpy.linalg.svd` to project the 3D PlayerDNA feature space onto 2D PC axes for visualization.
3. **Which AI components rely on Stockfish?**  
   Stockfish 16 (executed as a persistent UCI child process via `python-chess`) powers:  
   - Position evaluations and legal move generation.  
   - The interactive **Play AI** mode.  
   - The **Coach Mode** live move hints and tactical explanations.  
   - Post-game Centipawn Loss (CPL) calculations, move classifications (Best, Inaccuracy, Mistake, Blunder), and forced-mate detection.  
   - The **AI Arena** engine-vs-engine research experiments.  
   *Note: Stockfish is an external third-party chess engine; our project does not train Stockfish or its internal NNUE neural network.*
4. **Which major features are conventional software logic?**  
   - **Elo Rating Updates:** Computed deterministically using Arpad Elo's mathematical expected-score equation with $K=32$ ([backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L183-L201)).  
   - **Matchmaking Queue Window Expansion:** A time-decay heuristic expanding by $\pm 50$ rating points every 10 seconds ([backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L31-L36)).  
   - **Game Move Validation & Clocks:** Handled deterministically by `python-chess` on the backend and `chess.js` on the frontend.  
   - **Performance Star Allocation (3–5 Stars):** Rule-based thresholds over accuracy and blunders ([backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L38-L50)).
5. **Which AI/ML claims are verified, unverified, or not implemented?**  
   - **Verified & Implemented:** K-Means training pipeline, runtime cluster inference fallback, offline k-NN / Euclidean matching, live queue DNA distance tie-breaking, Stockfish UCI wrapper, asynchronous analysis worker, Elo calculations, and full web application.  
   - **Implemented but Awaiting Live Cohort:** The live K-Means model requires $\ge 10$ registered users with $\ge 3$ analyzed games before saving an active `.joblib` model file. In an empty database, runtime inference safely returns `None` (graceful fallback).  
   - **Absent / Not Implemented:** No supervised match-outcome classifier (Random Forest, XGBoost, Logistic Regression, SVM, Deep Learning) is implemented. This is an intentional architectural decision documented in [docs/player_dna_ml.md](file:///d:/Atharva/Project/AIML_Project-chess-/docs/player_dna_ml.md#L55-L64) to prevent target leakage from post-game metrics.

---

# Part 1 — Repository Investigation

### Repository Architecture Map

```
AIML_Project-chess-/
├── backend/                              # FastAPI Backend Application
│   ├── config.py                         # Environment paths & database settings
│   ├── main.py                           # App entry point, CORS, router mounting
│   ├── analysis_worker.py                # Standalone background worker for Stockfish jobs
│   ├── db/
│   │   ├── base.py                       # SQLAlchemy declarative base
│   │   ├── session.py                    # Engine & session management
│   │   └── models.py                     # Schema: Users, LiveGames, Reports, DNA, Models
│   ├── repositories/
│   │   └── matchmaking_repository.py     # SQL loader for Kaggle cohort DNA vectors
│   ├── routes/
│   │   ├── auth.py                       # User registration, login, logout, /me
│   │   ├── chess.py                      # Stockfish move evaluation endpoint
│   │   ├── demo.py                       # Self-contained viva/demo endpoint
│   │   ├── live_games.py                 # REST & WebSocket live chess transitions
│   │   ├── match_queue.py                # Matchmaking queue join, status, cancel
│   │   ├── matchmaking.py                # Admin cohort recommendation endpoint
│   │   ├── players.py                    # Historical player cohort REST endpoints
│   │   ├── registered_players.py         # Live user leaderboard, profile, DNA history
│   │   └── research.py                   # Engine presets, AI experiments, ML status
│   └── services/
│       ├── ai_experiment_service.py      # Stockfish-vs-Stockfish background matches
│       ├── auth_service.py               # PBKDF2 hashing, secure cookie sessions
│       ├── chess_service.py              # Singleton adapter to StockfishService
│       ├── game_analysis_service.py      # Move replay, CPL calculation, DNA snapshotting
│       ├── live_game_service.py          # Authoritative chess rules, clocks, Elo updates
│       ├── match_queue_service.py        # Rating window expansion & DNA tie-breaking
│       ├── matchmaking_service.py        # Adapter for offline cohort similarity
│       └── player_style_model.py         # Runtime K-Means artifact loader & inference
├── data/                                 # Datasets & Historical Research Artifacts
│   ├── games.csv                         # Raw Kaggle chess games dataset
│   ├── chess_performance_features_v2.csv # Engine-analyzed move-level features
│   ├── player_profiles.csv               # Aggregated 30-player benchmark profiles
│   ├── player_dna.csv                    # 30-player 3D robust-scaled DNA vectors
│   ├── player_dna_scaler_parameters.csv  # Median and IQR parameters for RobustScaler
│   ├── player_similarity.csv             # Pairwise distance matrix (30x30)
│   ├── matchmaking_sample_recommendations.csv # Top-5 recommendations for demo players
│   ├── matchmaking_feature_ablation.csv  # Sensitivity analysis removing 1 feature at a time
│   └── visualizations/                   # Standalone SVG visualizations (PCA, heatmaps)
├── docs/                                 # Architecture & ML Documentation
│   ├── player_dna_ml.md                  # Model provenance, K-Means spec, outcome policy
│   ├── platform_architecture_audit.md    # Platform boundary analysis
│   └── platform_implementation_status.md # Validation results & deployment checks
├── frontend/                             # React 18 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── api/client.ts                 # Typed fetch client for all backend endpoints
│   │   ├── context/AuthContext.tsx       # User session state management
│   │   ├── pages/
│   │   │   ├── AIArenaPage.tsx           # AI-vs-AI experiment launcher & PGN viewer
│   │   │   ├── DashboardPage.tsx         # User stats, leaderboard, quick play
│   │   │   ├── DemoPage.tsx              # Viva demonstration suite (6 interactive tabs)
│   │   │   ├── LiveChessPage.tsx         # Play AI, Coach Mode, Normal Play lobby
│   │   │   ├── MLModelsPage.tsx          # Real-time ML training readiness & model telemetry
│   │   │   ├── MatchmakingPage.tsx       # Cohort vector distance explorer
│   │   │   ├── MultiplayerGame.tsx       # Real-time human vs human with WebSockets
│   │   │   ├── PlayerDNAPage.tsx         # Player DNA feature inspection
│   │   │   └── ResearchPortalPage.tsx    # Research overview & dataset stats
│   │   └── styles.css                    # Responsive CSS design system
└── Scripts/                              # Research, Training, and Analysis Scripts
    ├── analyze_with_stockfish.py         # Batch engine analysis for raw PGNs
    ├── create_player_dna.py              # RobustScaler extraction of 3D DNA vector
    ├── eda_player_profiles.py            # EDA, correlation matrices, and SVD/PCA
    ├── evaluate_matchmaking.py           # Ranking agreement, ablation, bootstrap stability
    ├── matchmaking.py                    # Euclidean, Cosine, and k-NN implementations
    ├── player_profile.py                 # Aggregation of move metrics into player profiles
    ├── stockfish_service.py              # Robust UCI engine wrapper (threading, locks)
    └── train_player_style_model.py       # Scikit-Learn K-Means training & evaluation pipeline
```

### Search for ML Libraries and Algorithms

A systematic scan across the workspace for machine learning libraries yielded:

| Library / Algorithm Search Candidate | Codebase Search Result | Evidence File & Context |
|---|---|---|
| **Scikit-Learn (`sklearn`)** | **CONFIRMED** | [requirements-ml.txt](file:///d:/Atharva/Project/AIML_Project-chess-/requirements-ml.txt#L2), [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L42-L46) (`KMeans`, `StandardScaler`, `SimpleImputer`, `silhouette_score`, `make_pipeline`). |
| **Joblib (`joblib`)** | **CONFIRMED** | [requirements-ml.txt](file:///d:/Atharva/Project/AIML_Project-chess-/requirements-ml.txt#L3), [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L41), [backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py#L21) (artifact serialization/loading). |
| **NumPy (`numpy`)** | **CONFIRMED** | Core linear algebra, percentiles, IQR, SVD, Euclidean norms in [Scripts/create_player_dna.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/create_player_dna.py#L11), [Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L10), [Scripts/eda_player_profiles.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L9). |
| **Pandas (`pandas`)** | **CONFIRMED** | DataFrame manipulation, grouping, summary statistics in `Scripts/`. |
| **K-Means (`KMeans`)** | **CONFIRMED** | [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L42) (unsupervised player style clustering). |
| **K-Nearest Neighbors (k-NN)** | **CONFIRMED** | [Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L78-L82) (brute-force Euclidean neighbor ranking). |
| **PCA (Principal Component Analysis)** | **CONFIRMED** | [Scripts/eda_player_profiles.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L164-L199) (NumPy SVD implementation for 2D visualization). |
| **PyTorch / TensorFlow / Keras** | **NOT FOUND** | No neural network frameworks exist in dependencies or code. |
| **XGBoost / LightGBM / CatBoost** | **NOT FOUND** | No gradient boosting libraries are installed or referenced. |
| **Random Forest / Decision Trees** | **NOT FOUND** | No tree-based algorithms are present. |
| **Support Vector Machines (SVM)** | **NOT FOUND** | No SVM classifier or regressor is present. |
| **Logistic / Linear Regression** | **NOT FOUND** | No parametric regression or classification models are present. |

---

# Part 2 — Complete Feature Inventory

| # | Feature Name | Core Purpose | User Workflow | Backend Processing | Method / Category | Key File & Class/Function | Status |
|---|---|---|---|---|---|---|---|
| **1** | **Normal Play** | Casual, unrated human vs human chess. | Click "Normal Play" $\to$ enter lobby $\to$ auto-pairs with any waiting casual player. | Joins `MatchQueueEntry` with `rating_at_join = -1`. Pairs first available FIFO opponent. Creates `LiveGame`. | Ordinary Application Logic (FIFO Queue) | [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L105-L140) (`join`) | **Confirmed & Functional** |
| **2** | **Competitive Mode** | Rated matchmaking with rating window expansion and Elo updates. | Click "Competitive" $\to$ queue shows wait time and Elo window $\to$ match starts $\to$ win/loss alters rating. | Time-expanded rating window ($\pm 50$ pts / 10s). DNA distance secondary tie-break. Server computes Elo ($K=32$) upon finish. | Mathematical Rating (Elo) + Vector Distance Tie-Break | [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L141-L176), [backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L183-L201) | **Confirmed & Functional** |
| **3** | **Play AI** | Practice chess directly against Stockfish engine. | Select difficulty $\to$ play moves on board $\to$ engine responds in 200ms. | Sends FEN to `/api/chess/recommend`. Engine searches up to time/depth limit and returns best move. | Search-based AI (Stockfish UCI: Alpha-Beta / NNUE) | [backend/routes/chess.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/chess.py#L29-L43), [Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L122-L200) | **Confirmed & Functional** |
| **4** | **Coach Mode** | Interactive practice with real-time hints and explanations. | Board shows current evaluation, recommended move, and strategic advice. | Fetches Stockfish analysis for current FEN. Maps score to human-readable evaluation and tactical explanation. | Search-based AI + Rule-based Coaching Text | [frontend/src/pages/LiveChessPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/LiveChessPage.tsx#L550-L750), [Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L122-L200) | **Confirmed & Functional** |
| **5** | **Game & Rating History** | Review past competitive performances and Elo trajectory. | Visit Account/History page $\to$ view list of games, rating deltas, and opponent details. | Queries `LiveGame` and `CompetitiveRatingHistory` tables joined by `user_id`. | Database Persistence & Query Logic | [backend/routes/registered_players.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/registered_players.py#L53-L84) (`recent_games`) | **Confirmed & Functional** |
| **6** | **Game Analysis & Reports** | In-depth post-game tactical report with CPL and accuracy. | Open finished game $\to$ view accuracy %, move classifications, and performance stars. | `analysis_worker` replays moves, calls Stockfish `analyze_move`, computes average CPL, calculates accuracy $100e^{-\text{avg\_cpl}/100}$. | Statistical Move Analysis + Exponential Accuracy Model | [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L25-L76), [backend/analysis_worker.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/analysis_worker.py#L25-L50) | **Confirmed & Functional** |
| **7** | **PlayerDNA Style Analysis** | Behavioral fingerprint based on move quality, consistency, and error rate. | View profile or DNA tab $\to$ see median CPL, CPL variation, and inaccuracy frequency. | Computes median CPL, population standard deviation of CPL, and inaccuracies per 100 moves across analyzed games. | Statistical Profiling + Robust Scaling | [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L157-L175) (`_snapshot_live_dna`) | **Confirmed & Functional** |
| **8** | **Model Training & Evaluation** | Cluster players into distinct style archetypes. | Admin/Dev runs training script $\to$ outputs optimal $k$, silhouette score, and artifact. | Selects eligible users ($\ge 3$ games), standardizes 3D vector, fits K-Means for $k \in [2,5]$, evaluates silhouette with bootstrap. | Unsupervised Machine Learning (K-Means Clustering) | [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L38-L119) | **Confirmed in Code (Requires $\ge 10$ Live Users)** |
| **9** | **Research Portal & AI Arena** | Admin suite to run engine experiments and inspect ML status. | Admin logs in $\to$ navigates to `/research` $\to$ configures engine presets $\to$ runs match. | Background thread executes two Stockfish instances playing move-by-move. Records PGN and final result. | Heuristic Search Experimentation | [backend/services/ai_experiment_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/ai_experiment_service.py#L98-L200), [backend/routes/research.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/research.py#L62-L149) | **Confirmed & Functional** |
| **10** | **Authentication & Profiles** | Secure registration, login, and public player profiles. | Register/login via modal $\to$ profile displays rating, record, provisional status, and style cluster. | PBKDF2 password hashing with salt, opaque session tokens in HttpOnly cookies, joins UserAccount with DNA. | Security Engineering + Database Persistence | [backend/services/auth_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/auth_service.py#L30-L75), [backend/routes/auth.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/auth.py#L20-L50) | **Confirmed & Functional** |
| **11** | **Analysis Worker** | Durable background processing for post-game engine jobs. | Headless worker runs in terminal or container $\to$ picks up queued jobs $\to$ writes reports. | Queries `game_analysis_jobs` with `SKIP LOCKED`, iterates moves, evaluates via Stockfish, commits results idempotently. | Asynchronous Queue Processing Pattern | [backend/analysis_worker.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/analysis_worker.py#L25-L50) | **Confirmed & Functional** |
| **12** | **Demonstration Mode** | Dedicated viva demonstration suite for academic evaluators. | Open `/demo` $\to$ browse 6 tabs covering Profile, Sample Game, Move Analysis, Elo, Model, and Workflow. | Reads curated Opera Game analysis and live PostgreSQL rating history; simulates Elo live. | Interactive Academic Presentation System | [backend/routes/demo.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/demo.py#L200-L350), [frontend/src/pages/DemoPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/DemoPage.tsx#L200-L260) | **Confirmed & Functional** |

---

# Part 3 — Identify the Exact ML Algorithms

## 1. Unsupervised K-Means Clustering (`sklearn.cluster.KMeans`)

### Technical Profile
- **Algorithm Name:** K-Means Clustering (`sklearn.cluster.KMeans`).
- **Learning Type:** Unsupervised Learning.
- **Problem Type:** Cluster Analysis / Partitioning.
- **Project Purpose:** Discover natural player style archetypes based on genuine chess-playing behavior (move quality, tactical consistency, and error rate), rather than arbitrarily assigning labels.
- **Input Features (3D Continuous Vector):**
  1. `median_cpl`: Median centipawn loss across all centipawn-evaluable moves (typical move accuracy).
  2. `cpl_std`: Standard deviation of centipawn loss (performance volatility/consistency).
  3. `inaccuracies_per_100_cp_moves`: Frequency of moves classified as inaccuracies ($10 < \text{CPL} < 50$) per 100 evaluable moves.
- **Feature Engineering:**
  Raw PGN game records are replayed move-by-move using `python-chess`. For every move, Stockfish evaluates the position from the side-to-move perspective. Centipawn loss is computed as $\text{CPL} = \max(0, \text{Score}_{\text{best}} - \text{Score}_{\text{played}})$. Inaccuracies are counted. These move-level figures are aggregated across the player's games to form the 3D vector.
- **Target / Labels:** Unsupervised — no ground-truth target label exists. The algorithm assigns a cluster index ($k \in \{0, 1, \dots, K-1\}$).
- **Training Workflow:**
  1. **Data Selection:** Queries `LivePlayerDNAHistory` in PostgreSQL for users with `games_analyzed >= 3` and `feature_version == 'live_dna_raw_v1'`. Enforces a strict minimum of $N \ge 10$ distinct users ([Scripts/train_player_style_model.py: line 52](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L52)).
  2. **Preprocessing Pipeline:** Wrapped in `sklearn.pipeline.make_pipeline`:
     - `SimpleImputer(strategy="median")` handles any missing values.
     - `StandardScaler()` standardizes features to zero mean and unit variance: $z = \frac{x - \mu}{\sigma}$.
  3. **Candidate Search:** Evaluates $k \in [2, \min(5, N-1)]$ clusters using `KMeans(n_clusters=k, random_state=42, n_init=20)`.
  4. **Model Selection:** Computes Euclidean `silhouette_score(transformed, labels)`. Selects optimal $k$ maximizing silhouette score.
  5. **Bootstrap Validation:** Runs 100 bootstrap replicates with replacement to estimate the 95% confidence interval of the silhouette score.
  6. **Artifact Persistence:** Dumps the pipeline and metadata via `joblib.dump` to `artifacts/models/player_style_kmeans_<timestamp>.joblib` and records the version, metrics, and data fingerprint in the database table `player_dna_style_models`.
- **Mathematical Formulation:**
  The objective function minimizes the within-cluster sum of squared Euclidean distances (inertia):
  $$\mathcal{J} = \sum_{j=1}^{k} \sum_{x_i \in S_j} \| x_i - \mu_j \|^2$$
  where $\mu_j$ is the centroid of cluster $S_j$. Centroids update iteratively:
  $$\mu_j = \frac{1}{|S_j|} \sum_{x_i \in S_j} x_i$$
  The silhouette coefficient for sample $i$ is:
  $$s(i) = \frac{b(i) - a(i)}{\max(a(i), b(i))}$$
  where $a(i)$ is the mean intra-cluster distance and $b(i)$ is the mean nearest-cluster distance.
- **Runtime Inference Workflow:**
  [backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py#L28-L43) queries the latest `PlayerDNAStyleModel` and the player's latest `LivePlayerDNAHistory`. If an artifact exists on disk, it executes:
  ```python
  cluster = int(payload["pipeline"].predict([[getattr(dna, name) for name in FEATURES]])[0])
  ```
  If no model is trained or the player has $<3$ games, it safely returns `None`.
- **Limitations:** Unsupervised clusters describe mathematical groupings in move-quality feature space, not psychological playstyles. The model requires at least 10 active players to avoid spurious cluster partitions.

---

## 2. Nearest-Neighbor Retrieval & Vector Distance Matching (k-NN / Euclidean)

### Technical Profile
- **Algorithm Name:** k-Nearest Neighbors Retrieval (`knn_euclidean`) & Normalized Euclidean Distance.
- **Learning Type:** Instance-based / Non-parametric metric retrieval.
- **Problem Type:** Similarity Ranking and Retrieval.
- **Project Purpose:**
  1. **Research Cohort Matchmaking:** Identify players with the most similar move-quality fingerprints in the 30-player benchmark dataset ([Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L57-L100)).
  2. **Live Matchmaking Tie-Breaker:** When multiple opponents in the competitive queue fall within the same allowed Elo window, select the opponent whose playing style (PlayerDNA distance) is closest to the user ([backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L156-L160)).
- **Input Features (Robust-Scaled 3D Vector):**
  $$\mathbf{x} = \left[ \frac{\text{median\_cpl} - \tilde{x}_1}{\text{IQR}_1}, \frac{\text{cpl\_std} - \tilde{x}_2}{\text{IQR}_2}, \frac{\text{inacc\_rate} - \tilde{x}_3}{\text{IQR}_3} \right]$$
  Using cohort median $\tilde{x}$ and interquartile range $\text{IQR} = Q_3 - Q_1$.
- **Mathematical Formulas:**
  - **Euclidean Distance:**
    $$d(\mathbf{u}, \mathbf{v}) = \sqrt{\sum_{i=1}^{3} (u_i - v_i)^2}$$
  - **Cosine Similarity:**
    $$\cos(\theta) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|} = \frac{\sum u_i v_i}{\sqrt{\sum u_i^2} \sqrt{\sum v_i^2}}$$
- **Empirical Evaluation Results (from Project Data):**
  Evaluated in [data/matchmaking_method_comparison.md](file:///d:/Atharva/Project/AIML_Project-chess-/data/matchmaking_method_comparison.md) and [Scripts/evaluate_matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/evaluate_matchmaking.py):
  - **KNN vs. Euclidean Ranking Agreement:** Top-5 overlap = **5.00 / 5.00**; Spearman rank correlation = **1.000** (identical by definition, confirming k-NN is an exact metric retrieval over Euclidean space).
  - **Cosine vs. Euclidean Agreement:** Top-5 overlap = **3.43 / 5.00**; Spearman rank correlation = **0.684**.
  - **Feature Ablation Study ([data/matchmaking_feature_ablation.csv](file:///d:/Atharva/Project/AIML_Project-chess-/data/matchmaking_feature_ablation.csv)):**
    - Removing `dna_median_cpl`: Mean top-5 overlap drops to 2.87 / 5; Spearman correlation = 0.536.
    - Removing `dna_cpl_std`: Mean top-5 overlap drops to 3.23 / 5; Spearman correlation = 0.638.
    - Removing `dna_inaccuracies_per_100_cp_moves`: Mean top-5 overlap drops to 3.53 / 5; Spearman correlation = 0.702.  
    *Conclusion:* `median_cpl` contributes the most variance to player discrimination.

---

## 3. Dimensionality Reduction via SVD (Principal Component Analysis)

### Technical Profile
- **Algorithm Name:** Principal Component Analysis (PCA) computed via Singular Value Decomposition (SVD).
- **Learning Type:** Unsupervised Dimensionality Reduction.
- **Problem Type:** Feature Projection & 2D Visualization.
- **Project Purpose:** Visualize the 30-player 3D DNA vector space on a 2D Cartesian plane without third-party visualization dependencies.
- **Implementation:** Written in pure NumPy in [Scripts/eda_player_profiles.py: lines 164–199](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L164-L199):
  ```python
  values = scaled.to_numpy(float)
  centered = values - values.mean(axis=0)
  u, singular, _ = np.linalg.svd(centered, full_matrices=False)
  coordinates = u[:, :2] * singular[:2]
  variance = singular**2
  explained = variance / variance.sum()
  ```
- **Mathematical Principle:**
  Given mean-centered data matrix $\mathbf{X} \in \mathbb{R}^{N \times D}$, SVD factors the matrix into:
  $$\mathbf{X} = \mathbf{U} \mathbf{\Sigma} \mathbf{V}^T$$
  The projection onto the first two principal components is $\mathbf{Z} = \mathbf{U}_{:, 1:2} \mathbf{\Sigma}_{1:2, 1:2}$. The explained variance ratio is $\lambda_k / \sum \lambda_j$ where $\lambda_j = \sigma_j^2$.
- **Observed Results:** Outputs standalone vector graphics to [data/visualizations/player_dna_pca.svg](file:///d:/Atharva/Project/AIML_Project-chess-/data/visualizations/player_dna_pca.svg). PC1 captures the primary accuracy spectrum while PC2 captures game-to-game volatility.

---

## 4. Honest Audit of Absent ML Algorithms

The following table explicitly clarifies candidate algorithms that are **not** part of the codebase:

| Algorithm Candidate | Presence in Codebase | Rationale / Architectural Decision |
|---|---|---|
| **Random Forest / Decision Trees** | **ABSENT** | No tabular classification or tree ensemble was trained. |
| **Support Vector Machines (SVM)** | **ABSENT** | No hyperplane classification is present. |
| **Deep Neural Networks (PyTorch/TensorFlow)** | **ABSENT** | No custom neural network training is implemented. (Stockfish uses NNUE internally, but Stockfish is an external engine). |
| **Supervised Match Outcome Classifier** | **ABSENT** | Intentionally excluded. [docs/player_dna_ml.md: lines 55–64](file:///d:/Atharva/Project/AIML_Project-chess-/docs/player_dna_ml.md#L55-L64) documents that using post-game move quality metrics to predict match outcomes is severe data leakage. Elo provides the standard pre-game win probability baseline. |

---

# Part 4 — The Player-Style Model End-to-End Pipeline

```
Raw Live Game Plays
       │
       ▼
[1] Move Replay & Legal Validation (python-chess)
       │
       ▼
[2] Stockfish Move Evaluation (Scripts/stockfish_service.py)
       │ Computes CPL = max(0, Score_best - Score_played)
       ▼
[3] Move Classification & Database Storage (live_move_analyses table)
       │
       ▼
[4] Player DNA Snapshotting (backend/services/game_analysis_service.py)
       │ Computes: median_cpl, cpl_std, inaccuracies_per_100_cp_moves
       │ Stored in: live_player_dna_history table
       ▼
[5] Cohort Filtering (Scripts/train_player_style_model.py)
       │ Requires: >= 10 registered users with >= 3 analyzed games
       ▼
[6] Feature Imputation & Standardization (SimpleImputer + StandardScaler)
       │
       ▼
[7] K-Means Clustering & Model Selection (k in [2..5] via silhouette_score)
       │
       ▼
[8] Bootstrap Uncertainty Validation (100 replicates, 95% CI)
       │
       ▼
[9] Artifact Serialization & DB Cataloging (joblib.dump -> artifacts/models/)
       │
       ▼
[10] Runtime Inference Service (backend/services/player_style_model.py)
       │ predict_player_style() returns {"cluster": int, "model_version": str}
       ▼
[11] REST API Delivery (GET /api/profiles/{username})
       │
       ▼
[12] Frontend Display (frontend/src/pages/RegisteredProfilePage.tsx & MLModelsPage.tsx)
```

### Detailed Pipeline Stage Breakdown

1. **Raw Player/Game Execution:** Two players complete a game via WebSockets ([backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py)). Moves are recorded as UCI strings (`e2e4`, `c7c5`) in `live_game_moves`.
2. **Move Replay & Validation:** [backend/analysis_worker.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/analysis_worker.py#L44-L50) claims the job and calls `process_game_analysis` in [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L78-L138). Moves are pushed through a `chess.Board()` instance to verify move-order integrity.
3. **Engine Move Comparison:** For each move, Stockfish evaluates the position before the move at depth 10, computing both the engine's best move and the user's played move.
4. **Centipawn Loss & Classification:** Centipawn loss is computed as $\text{CPL} = \max(0, \text{Score}_{\text{best}} - \text{Score}_{\text{played}})$. Moves are classified as best ($\le 10$), inaccuracy ($11–49$), mistake ($50–99$), or blunder ($\ge 100$). Rows are saved to `live_move_analyses`.
5. **Player DNA Snapshot Creation:** In `_snapshot_live_dna` ([backend/services/game_analysis_service.py: lines 157–175](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L157-L175)), all historical moves for the user across completed games are aggregated:
   - `median_cpl`: `statistics.median(cp_losses)`
   - `cpl_std`: `statistics.pstdev(cp_losses)`
   - `inaccuracies_per_100_cp_moves`: $100 \times \frac{\text{count(inaccuracies)}}{\text{count(cp\_moves)}}$
   - Saved to `live_player_dna_history` with `feature_version = "live_dna_raw_v1"`.
6. **Training Trigger & Preconditions:** [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L51-L54) filters the latest row per user. If fewer than 10 users have $\ge 3$ analyzed games, execution halts with an informative error.
7. **Pipeline Fitting:** Builds `make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), KMeans(n_clusters=k, random_state=42, n_init=20))`.
8. **Silhouette Scoring:** Evaluates candidate clusters $k \in [2, 5]$. Selects $k$ with the maximum silhouette score. Runs 100 bootstrap resamples to establish stability intervals.
9. **Artifact Storage:** Serializes `{"version": version, "features": FEATURES, "pipeline": pipeline}` to `artifacts/models/<version>.joblib` and inserts metadata into `player_dna_style_models`.
10. **Runtime Inference:** [backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py#L28-L43) provides `predict_player_style(session, user_id)`: loads the cached artifact and runs `pipeline.predict()`.
11. **REST Delivery:** [backend/routes/registered_players.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/registered_players.py#L25-L36) exposes `style_cluster` and `style_model_version` via `GET /api/profiles/{username}`.
12. **Frontend Presentation:** [frontend/src/pages/RegisteredProfilePage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/RegisteredProfilePage.tsx) renders the cluster badge. [frontend/src/pages/MLModelsPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/MLModelsPage.tsx) displays the real-time training readiness progress bar.

---

# Part 5 — Stockfish & Chess Engine Algorithms

The project distinguishes third-party search algorithms inside Stockfish from our custom Python wrapper logic:

```
┌────────────────────────────────────────────────────────┐
│            Stockfish 16 Engine (C++ Binary)             │
│  - Alpha-Beta Search with Principal Variation Search   │
│  - Iterative Deepening & Transposition Tables          │
│  - NNUE (Efficiently Updatable Neural Network) Eval    │
└───────────────────────────▲────────────────────────────┘
                            │ UCI Protocol (stdin/stdout)
┌───────────────────────────┴────────────────────────────┐
│      Our Python Service (Scripts/stockfish_service.py) │
│  - Thread-safe Process Synchronization (_lock)         │
│  - UCI Options (Threads=1, Hash=64MB, Skill Levels)    │
│  - Legal FEN Validation via python-chess               │
│  - Centipawn Loss (CPL) Computation                    │
│  - Move Classification & Forced Mate Disambiguation    │
└────────────────────────────────────────────────────────┘
```

### Search-Based AI Principles inside Stockfish
- **Minimax with Alpha-Beta Pruning:** Evaluates game trees by assuming optimal play from both players while pruning branches that cannot affect the final decision:
  $$\alpha \le \text{Node Value} \le \beta$$
- **Iterative Deepening:** Searches depth $d=1, 2, 3, \dots$ sequentially. Allows meeting time limits gracefully and populates the transposition table with accurate move orderings for deeper plies.
- **Transposition Table:** An in-memory hash table (configured to 64 MiB in our service) storing previously visited board positions and their search depths to avoid redundant tree searches.
- **NNUE (Efficiently Updatable Neural Network):** An evaluation function that evaluates leaf positions using a shallow neural network trained on millions of master positions.

### Custom Implementation Wrapper Details
- **Process Management ([Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L36-L105)):** Starts Stockfish lazily upon the first request via `SimpleEngine.popen_uci()`. A `threading.Lock()` ensures serialized access across async requests.
- **Evaluation Separation ([Scripts/stockfish_service.py: lines 168–179](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L168-L179)):** Centipawn values and mate evaluations are strictly separated. Mate scores are never converted into artificial centipawn numbers (avoiding misleading spikes in average CPL).
- **Move Classification Thresholds:**
  $$\text{Classification} = \begin{cases}
  \text{best\_or\_near\_best} & \text{if } \text{CPL} \le 10 \\
  \text{inaccuracy} & \text{if } 10 < \text{CPL} < 50 \\
  \text{mistake} & \text{if } 50 \le \text{CPL} < 100 \\
  \text{blunder} & \text{if } \text{CPL} \ge 100 \\
  \text{mate\_evaluation} & \text{if position involves mate sequences}
  \end{cases}$$

---

# Part 6 — Mathematics & Logic of Non-ML Features

### 1. Elo Rating System
- **Implementation File:** [backend/services/live_game_service.py: lines 183–201](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L183-L201)
- **Mathematical Equations:**
  1. **Expected Score:**
     $$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}, \quad E_B = 1 - E_A = \frac{1}{1 + 10^{(R_A - R_B)/400}}$$
  2. **Rating Update:**
     $$R'_A = R_A + \text{round}\Big(K \cdot (S_A - E_A)\Big), \quad R'_B = R_B - \text{round}\Big(K \cdot (S_A - E_A)\Big)$$
     where $K = 32$, and actual score $S_A \in \{1.0 \text{ (Win)}, 0.5 \text{ (Draw)}, 0.0 \text{ (Loss)}\}$.
- **Numerical Example:**
  - White Rating $R_A = 1200$, Black Rating $R_B = 1280$.
  - Rating difference: $R_B - R_A = +80$.
  - Expected score for White:
    $$E_A = \frac{1}{1 + 10^{80/400}} = \frac{1}{1 + 10^{0.20}} \approx \frac{1}{1 + 1.5849} \approx 0.3869 \ (38.7\%)$$
  - Expected score for Black: $E_B = 1 - 0.3869 = 0.6131 \ (61.3\%)$.
  - **Outcome: White Wins ($S_A = 1.0$):**
    $$\Delta R_A = \text{round}(32 \cdot (1.0 - 0.3869)) = \text{round}(32 \cdot 0.6131) = \text{round}(19.62) = +20$$
  - New ratings: White becomes $1200 + 20 = 1220$; Black becomes $1280 - 20 = 1260$.
  - Zero-sum property: $\Delta R_A + \Delta R_B = +20 - 20 = 0$.

### 2. Competitive Matchmaking Rating-Window Expansion
- **Implementation File:** [backend/services/match_queue_service.py: lines 31–36](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L31-L36)
- **Mathematical Formula:**
  $$W(t) = \min\left(500, \ W_{\text{base}} + \left\lfloor \frac{t}{10} \right\rfloor \times 50\right)$$
  where:
  $$W_{\text{base}} = \begin{cases} 250 & \text{if } \text{games\_played} < 5 \text{ (Provisional)} \\ 100 & \text{if } \text{games\_played} \ge 5 \text{ (Established)} \end{cases}$$
  and $t$ is waiting time in seconds.
- **Priority Pairing Hierarchy:**
  Candidates within the allowed rating window are ranked deterministically by:
  1. Smallest rating gap: $|R_{\text{user}} - R_{\text{candidate}}|$
  2. Smallest PlayerDNA Euclidean distance (secondary tie-break)
  3. Earliest queue join timestamp (FIFO fairness)
  4. User ID string comparison (deterministic tie-breaker)

### 3. Move Quality & Accuracy Model
- **Implementation File:** [backend/services/game_analysis_service.py: line 30](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L30)
- **Exponential Accuracy Formula:**
  $$\text{Accuracy (\%)} = 100 \times \exp\left(-\frac{\overline{\text{CPL}}}{100}\right)$$
  where $\overline{\text{CPL}}$ is the player's mean centipawn loss across evaluable moves.
  - If $\overline{\text{CPL}} = 0 \implies \text{Accuracy} = 100 \times e^0 = 100\%$.
  - If $\overline{\text{CPL}} = 30 \implies \text{Accuracy} = 100 \times e^{-0.30} \approx 74.1\%$.
  - If $\overline{\text{CPL}} = 100 \implies \text{Accuracy} = 100 \times e^{-1.0} \approx 36.8\%$.

### 4. Performance Stars Allocation
- **Implementation File:** [backend/services/game_analysis_service.py: lines 38–50](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L38-L50)
- **Deterministic Rules:**
  - Requires $\ge 8$ centipawn-evaluable moves; otherwise `stars = None`.
  - **5 Stars:** $\text{Accuracy} \ge 90\%$ and $\text{Blunders} = 0$.
  - **4 Stars:** $\text{Accuracy} \ge 75\%$ and $\text{Blunders} \le 1$.
  - **3 Stars:** All other completed games with $\ge 8$ evaluable moves.

---

# Part 7 — Algorithm-to-File Evidence Table

| Feature / Subsystem | Algorithm or Method | ML / AI Category | Training Required? | Actual Implementation File | Function or Class | Runtime Usage | Verification Status |
|---|---|---|---|---|---|---|---|
| **Player Style Modeling** | K-Means Clustering (`KMeans`) | Unsupervised ML | Yes | [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L38) | `train()` | Inference ready with safe fallback | **Confirmed in Code (Requires $\ge 10$ Live Users)** |
| **Model Inference** | Scikit-Learn Pipeline (`predict`) | Unsupervised ML | No (loads `.joblib`) | [backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py#L28) | `predict_player_style` | Called on `/api/profiles/{username}` | **Confirmed & Functional (Safe Fallback)** |
| **Research Matchmaking** | Brute-force k-NN / Euclidean | Metric Retrieval | No | [Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L57) | `_rank_one` / `get_recommendations` | Called on `/api/matchmaking/{id}` | **Confirmed & Functional** |
| **Directional Similarity** | Cosine Similarity | Metric Retrieval | No | [Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py#L67) | `_rank_one` | Research baseline comparison | **Confirmed & Functional** |
| **Feature Projection** | PCA via SVD (`np.linalg.svd`) | Unsupervised Reduction | No | [Scripts/eda_player_profiles.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L164) | `draw_pca` | SVG generation tool | **Confirmed in Scripts** |
| **Feature Scaling** | RobustScaler (Median / IQR) | Preprocessing | No | [Scripts/create_player_dna.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/create_player_dna.py#L56) | `robust_scale` | Produces `player_dna.csv` | **Confirmed in Scripts** |
| **Live Matchmaking** | Dynamic Rating Window + DNA Distance | Heuristic + Metric | No | [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L31) | `rating_window`, `join` | Live competitive queue | **Confirmed & Functional** |
| **Rating Updates** | Elo Rating Formula ($K=32$) | Statistical Model | No | [backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L183) | `_finish` | Triggered upon game finish | **Confirmed & Functional** |
| **Engine Evaluation** | Alpha-Beta + NNUE (Stockfish 16) | Search-Based AI | External | [Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L28) | `StockfishService` | Play AI, Coach, Reports | **Confirmed & Functional** |
| **Tactical Classification** | Centipawn Loss Thresholding | Rule-based AI | No | [Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L252) | `analyze_move` | Background analysis worker | **Confirmed & Functional** |
| **Game Accuracy** | Exponential CPL Model ($100e^{-\overline{\text{CPL}}/100}$) | Statistical Modeling | No | [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L30) | `_make_report` | Performance report view | **Confirmed & Functional** |
| **Rule Validation** | FSM Legal Move Tree (`python-chess`) | Deterministic Logic | No | [backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L94) | `move`, `_board_from_moves` | Live move submission | **Confirmed & Functional** |

---

# Part 8 — Real Execution Traces

### Trace 1: Competitive Matchmaking & Live Elo Progression
1. **User Action:** User clicks "Join Competitive Queue" on [frontend/src/pages/PlayArenaPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/PlayArenaPage.tsx).
2. **Frontend Handler:** Invokes `joinQueue('competitive')` in [frontend/src/api/client.ts](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/api/client.ts#L203).
3. **Backend Route:** `POST /api/matchmaking/queue?mode=competitive` in [backend/routes/match_queue.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/match_queue.py).
4. **Service Logic:** [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L93-L176) (`join`):
   - Acquires PostgreSQL advisory transaction lock `pg_advisory_xact_lock(731044211)`.
   - Inserts/updates `MatchQueueEntry`.
   - Checks eligible opponents within rating window $W(t) = \min(500, W_{\text{base}} + \lfloor t/10 \rfloor \times 50)$.
   - Sorts candidates by rating delta, then live PlayerDNA distance, then wait time.
5. **Game Creation:** Instantiates `LiveGame` row with initial FEN and clocks. Deletes queue entries.
6. **Move Play:** Both players submit moves via WebSocket `/api/games/{id}/ws` to [backend/routes/live_games.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/live_games.py).
7. **Finalization:** Game concludes (checkmate/resignation). [backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py#L174-L209) (`_finish`):
   - Computes expected score $E = 1 / (1 + 10^{\Delta R / 400})$.
   - Updates player ratings by $\Delta R = \text{round}(32 \cdot (S - E))$.
   - Writes `CompetitiveRatingHistory`.
   - Queues `GameAnalysisJob(status='queued')`.

### Trace 2: Background Move Quality Analysis & DNA Snapshotting
1. **Worker Pickup:** [backend/analysis_worker.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/analysis_worker.py#L25-L42) (`claim_next_job`) queries `game_analysis_jobs` with `SKIP LOCKED`.
2. **Execution:** Calls `process_game_analysis` in [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L78-L155).
3. **Engine Evaluation:** Iterates through `live_game_moves`. For each ply, invokes Stockfish `analyze_move(fen_before, played_uci, depth=10)` ([Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L201-L256)).
4. **Metric Derivation:**
   - Evaluates CPL $= \max(0, \text{Score}_{\text{best}} - \text{Score}_{\text{played}})$.
   - Identifies blunders, mistakes, inaccuracies, and missed forced mates.
   - Inserts records into `live_move_analyses`.
5. **Report & DNA Aggregation:**
   - Computes $\text{Accuracy} = 100 \times \exp(-\overline{\text{CPL}} / 100)$ and performance stars (3–5).
   - Writes `PlayerGameReport`.
   - Invokes `_snapshot_live_dna`: calculates `median_cpl`, `cpl_std`, and inaccuracy frequency across all user games. Saves to `live_player_dna_history`.
   - Marks job as `completed`.
6. **Frontend Display:** User opens game report $\to$ [frontend/src/pages/MultiplayerGame.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/MultiplayerGame.tsx) displays tactical badges, accuracy, and star ratings.

### Trace 3: AI-vs-AI Arena Experiment
1. **User Action:** Admin clicks "Run Experiment" on [frontend/src/pages/AIArenaPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/AIArenaPage.tsx).
2. **Backend Route:** `POST /api/research/experiments` in [backend/routes/research.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/routes/research.py#L99-L130).
3. **Service Execution:** Spawns background thread running `execute_experiment` in [backend/services/ai_experiment_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/ai_experiment_service.py#L98-L200).
4. **Simulation:** Two separate Stockfish instances configured with distinct presets (e.g., Novice: Skill Level 3, depth 5 vs. Master: Skill Level 20, depth 12) play move-by-move.
5. **Persistence:** Saves PGN, ply count, and termination status to `ai_experiments` table.
6. **Frontend Rendering:** Interactive PGN board replayer displays the completed engine battle.

---

# Part 9 — Demonstration & Viva Preparation

### A. Two-Minute Elevator Pitch
> *"Good morning, respected evaluators. Our project, **PlayerDNA**, is an intelligent chess analytics and competitive matchmaking platform. Unlike standard chess applications that evaluate players using only a single scalar Elo rating, PlayerDNA creates a multi-dimensional behavioral fingerprint of each player's actual decision-making on the board.*  
>  
> *The system combines three distinct layers of AI and mathematics:*  
> *First, **Search-Based AI**: we integrate Stockfish 16 over UCI to evaluate board positions, compute centipawn loss per move, and classify tactical inaccuracies.*  
> *Second, **Unsupervised Machine Learning**: we extract a 3D PlayerDNA feature vector measuring typical move quality, game-to-game consistency, and error distribution. Using Scikit-Learn K-Means clustering and Euclidean k-NN retrieval, we group players into behavioral style archetypes and pair style-compatible opponents in competitive play.*  
> *Third, **Authoritative Mathematics**: we implement Arpad Elo's zero-sum rating equations, dynamic time-expanding queue windows, and asynchronous background worker pipelines.*  
>  
> *Every component in our system is authentic: ratings are updated idempotently in PostgreSQL, engine evaluations run without mocking, and ML clustering operates with rigorous validation metrics."*

---

### B. Feature-by-Feature Speaking Notes

- **Competitive Matchmaking:**
  - *Speaking Point:* "Our queue uses a dynamic time-decay window. It begins tight ($\pm 100$ Elo) to guarantee fair matches, expanding by 50 points every 10 seconds. When multiple opponents are available, PlayerDNA vector distance serves as the tie-breaker."
  - *File to Reference:* [backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py#L31-L83).
- **Post-Game Analysis & Performance Stars:**
  - *Speaking Point:* "Move accuracy is modeled exponentially as $100 \times \exp(-\text{avg\_CPL}/100)$ over centipawn-evaluable moves. Performance stars are deterministic: 5 stars require $\ge 90\%$ accuracy and zero blunders."
  - *File to Reference:* [backend/services/game_analysis_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/game_analysis_service.py#L25-L75).
- **PlayerDNA K-Means Style Model:**
  - *Speaking Point:* "We do not artificially fabricate playstyles. We train Scikit-Learn K-Means on median CPL, CPL standard deviation, and inaccuracy rate. Model selection optimizes the silhouette score across candidate $k$, validated with 100 bootstrap replicates."
  - *File to Reference:* [Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L38-L118).
- **Stockfish Integration:**
  - *Speaking Point:* "Our custom `StockfishService` manages a persistent UCI engine with serialized threading locks. It cleanly isolates centipawn scores from forced-mate evaluations, preventing distorted loss calculations."
  - *File to Reference:* [Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py#L122-L256).

---

### C. Algorithm Explanations for Viva

#### 1. K-Means Clustering
- **One Sentence:** An unsupervised machine learning algorithm that partitions $N$ data points into $K$ non-overlapping clusters by minimizing the distance between points and their cluster centroids.
- **Beginner Analogy:** Imagine placing 3 magnets on a table covered with iron filings; as you move the magnets to the dense centers of filings, every filing naturally belongs to the magnet it is closest to.
- **Technical Explanation:** It iteratively alternates between two steps: the *Assignment step*, where each observation is assigned to the nearest centroid using Euclidean distance, and the *Update step*, where centroids are recalculated as the mean of all points assigned to that cluster.
- **Chess Example:** Points with low median CPL (30 cp) and low variance cluster into "Accurate & Consistent" archetypes, whereas points with moderate CPL (80 cp) and high variance cluster into "Volatile & Aggressive" archetypes.

#### 2. k-Nearest Neighbors (k-NN)
- **One Sentence:** An instance-based metric algorithm that finds the $k$ closest data points to a given query point in a feature space.
- **Beginner Analogy:** If you want to know what neighborhood a house belongs to, you look at the 5 houses closest to it on the street.
- **Technical Explanation:** Non-parametric lazy learning that computes pairwise vector distances (Euclidean: $\sqrt{\sum (x_i - y_i)^2}$) without an explicit training phase.
- **Chess Example:** When a player with DNA vector $[0.2, -0.4, 0.1]$ seeks an opponent, the system retrieves the 5 players in the database whose vectors have the minimum Euclidean distance.

---

### D. 22 Likely Viva Questions & Accurate Answers

1. **Q: What makes PlayerDNA an AI/ML project rather than just a web development project?**  
   *A:* PlayerDNA incorporates three distinct AI pillars: (1) search-based AI via Stockfish UCI engine integration for position analysis and heuristic move search; (2) unsupervised machine learning via Scikit-Learn K-Means clustering and Euclidean k-NN retrieval over behavioral feature vectors; and (3) mathematical statistical modeling via the Elo expected-score system and exponential accuracy estimation.

2. **Q: Is Stockfish our own trained machine learning model?**  
   *A:* No. Stockfish is a world-class, open-source chess engine written in C++ that uses minimax search, alpha-beta pruning, and an NNUE evaluation network. Our contribution is the Python integration architecture (`StockfishService`), process management, CPL extraction, move classification heuristics, and post-game reporting pipelines.

3. **Q: What is the difference between Supervised and Unsupervised Learning in your project?**  
   *A:* Supervised learning requires labeled targets (e.g., predicting win/loss given pre-game features). Unsupervised learning discovers latent structure without ground-truth labels. PlayerDNA uses **unsupervised learning** (K-Means) because player style has no predefined true label; our model clusters players purely based on geometric proximity in move-quality feature space.

4. **Q: What exact features make up the PlayerDNA vector?**  
   *A:* Exactly three continuous features: (1) `median_cpl` (typical move accuracy), (2) `cpl_std` (consistency of move quality across games), and (3) `inaccuracies_per_100_cp_moves` (frequency of moderate tactical errors).

5. **Q: Why did you limit PlayerDNA to 3 features instead of 20?**  
   *A:* During exploratory data analysis ([data/player_profiles_eda_report.md](file:///d:/Atharva/Project/AIML_Project-chess-/data/player_profiles_eda_report.md)), we discovered severe multicollinearity: mean CPL correlated at 0.96 with median CPL, and accuracy correlated at -0.92 with median CPL. Including highly correlated features artificially inflates feature weight in Euclidean distance calculations. Selecting one accuracy metric, one volatility metric, and one error-rate metric ensures low inter-feature redundancy.

6. **Q: Why don't you include openings, tactics, or aggression in the DNA vector?**  
   *A:* The available move-level dataset does not contain opening book classifications or tactical motif annotations. As documented in [data/player_dna_feature_dictionary.md](file:///d:/Atharva/Project/AIML_Project-chess-/data/player_dna_feature_dictionary.md#L43-L44), we deliberately avoided fabricating pseudo-features that were not empirically grounded in the extracted data.

7. **Q: Why did you use RobustScaler rather than MinMaxScaler or StandardScaler for offline DNA vectors?**  
   *A:* Chess centipawn loss data contains heavy right-skewed outliers due to severe blunders. RobustScaler centers by the median and scales by the interquartile range ($\text{IQR} = Q_3 - Q_1$), making the transformed coordinates robust against outlier distortion compared to mean/std scaling.

8. **Q: How does the K-Means training script select the optimal number of clusters ($k$)?**  
   *A:* It evaluates candidate values of $k$ from 2 to 5, calculates the Euclidean **silhouette score** for each partition, and selects the $k$ that maximizes the silhouette score ([Scripts/train_player_style_model.py: lines 58–76](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L58-L76)).

9. **Q: What is the Silhouette Score and what do its values mean?**  
   *A:* The silhouette score measures how similar an object is to its own cluster compared to other clusters. It ranges from -1 to +1. A value close to +1 indicates well-separated, dense clusters; 0 indicates overlapping clusters; negative values indicate misassigned points.

10. **Q: Why is there a minimum threshold of 10 users with 3 analyzed games before training the model?**  
    *A:* In small sample sizes ($N < 10$), clustering algorithms produce unstable, trivial partitions (e.g., clusters with 1 point) that reflect random noise rather than generalizable player styles. Enforcing $N \ge 10$ maintains statistical integrity ([Scripts/train_player_style_model.py: line 52](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py#L52)).

11. **Q: What happens if a user accesses their profile when no K-Means model is trained yet?**  
    *A:* The application implements a graceful fallback ([backend/services/player_style_model.py: lines 32–43](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py#L32-L43)). If the model artifact is absent or the player has $<3$ analyzed games, `predict_player_style()` returns `None`, and the UI displays "Pending More Games" without breaking.

12. **Q: How does competitive matchmaking work in your project?**  
    *A:* Matchmaking uses a dynamic rating window. When a user joins the queue, their allowed rating window begins at $\pm 100$ points (or $\pm 250$ for provisional players with $<5$ games) and widens by 50 points every 10 seconds up to a cap of 500 points. Pairing prioritizes the closest rating, using PlayerDNA vector distance as a secondary tie-breaker.

13. **Q: What is the exact formula for updating Elo ratings?**  
    *A:* $E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$, and $\Delta R = \text{round}(K \cdot (S_A - E_A))$ where $K = 32$. If White with 1200 beats Black with 1200, $E_A = 0.5$, $\Delta R = \text{round}(32 \cdot (1 - 0.5)) = +16$.

14. **Q: Why did you set $K=32$ in your Elo implementation?**  
    *A:* $K=32$ is standard in online blitz and club chess. It allows ratings to adapt reasonably quickly to player skill development while preventing extreme swings from individual flukes.

15. **Q: What is Centipawn Loss (CPL)?**  
    *A:* One pawn is equivalent to 100 centipawns. Centipawn loss is the difference in evaluation between the best possible move identified by the engine and the move actually played by the user: $\text{CPL} = \max(0, \text{Score}_{\text{best}} - \text{Score}_{\text{played}})$. A lower CPL reflects higher accuracy.

16. **Q: How do you handle forced mate scores during CPL calculation?**  
    *A:* Mate evaluations are kept separate from numerical centipawn scores. We never convert a mate in 3 into "+10,000 centipawns" because doing so would completely distort average CPL calculations. Instead, positions involving mate sequences are classified distinctly as `missed_forced_mate` or `allowed_forced_mate`.

17. **Q: How is game accuracy calculated?**  
    *A:* Using the exponential model: $\text{Accuracy} = 100 \times \exp(-\overline{\text{CPL}} / 100)$ over evaluable centipawn moves. This smoothly maps an average CPL of 0 to 100%, 30 CPL to ~74%, and 100 CPL to ~37%.

18. **Q: Why don't you train a model to predict who will win a game?**  
    *A:* Using post-game performance metrics (like CPL or accuracy) to predict game outcomes causes severe target leakage. Predicting outcomes beforehand using pre-game ratings is already handled by the Elo formula. A supervised outcome model would require thousands of platform games to outperform the baseline Elo probability.

19. **Q: What is the role of `analysis_worker.py`?**  
    *A:* Move analysis requires intensive engine computation (several seconds per game). Running this synchronously inside live game WebSocket handlers would freeze gameplay. `analysis_worker.py` runs as an asynchronous, decoupled background worker that claims queued jobs using PostgreSQL `SKIP LOCKED`.

20. **Q: What is Principal Component Analysis (PCA) and where is it used?**  
    *A:* PCA is an unsupervised linear dimensionality reduction technique. In [Scripts/eda_player_profiles.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/eda_player_profiles.py#L164-L199), we implement PCA using Singular Value Decomposition (`np.linalg.svd`) to project the 3D PlayerDNA feature space onto 2 principal components for SVG visualization.

21. **Q: What are the main limitations of your project's ML model?**  
    *A:* (1) Unsupervised clustering describes move accuracy and consistency groupings, not rich psychological concepts like "romantic" or "positional" style; (2) Engine evaluations depend on the chosen search depth (depth 10); (3) The live model requires an initial population of 10 active players to train.

22. **Q: How do you protect against SQL injection and race conditions during matchmaking?**  
    *A:* We use SQLAlchemy ORM parameterized queries for all database operations, preventing SQL injection. In matchmaking, we execute PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`) to serialize queue pairing and prevent two concurrent requests from matching the same player.

---

### E. Live Demonstration Script

Follow this step-by-step procedure during the practical project demonstration:

```
Step 1: Open Demonstration Portal
  - Navigate to: http://localhost:5173/demo
  - Observable: 6 presentation tabs.
  - File: frontend/src/pages/DemoPage.tsx

Step 2: Demonstrate Interactive Elo Simulator (Tab 1: Profile & Elo)
  - Adjust Player Rating to 1200 and Opponent Rating to 1280.
  - Select Outcome: "Win".
  - Observable: Expected score updates dynamically to 38.7%; delta updates to +20.
  - File: backend/services/live_game_service.py (Formula verification)

Step 3: Demonstrate Board Replay & Stockfish Analysis (Tab 2 & 3: Sample Game)
  - Click "Play" or scrub through the moves of the Opera Game.
  - Observable: Move 19 (10. Nxb5!) displays tactical category "Brilliant Piece Sacrifice",
    highlighting centipawn evaluations and Stockfish principal variations.
  - File: backend/services/game_analysis_service.py & backend/data/demo_game_analysis.json

Step 4: Demonstrate Model Telemetry & Readiness (Tab 5: ML Models)
  - Navigate to Tab 5 or /research/ml-models.
  - Observable: Displays real-time progress bar showing eligible players out of 10 required.
    Shows clustering parameters (K-Means, k=3, median imputation, StandardScaler).
  - File: frontend/src/pages/MLModelsPage.tsx & backend/routes/research.py (/api/research/ml/status)

Step 5: Demonstrate 30-Player DNA Analysis
  - Navigate to /research/player-dna.
  - Observable: Select player 'vladimir-kramnik-1' -> displays median CPL, CPL variation,
    and inaccuracy rate with RobustScaler parameters.
  - File: frontend/src/pages/PlayerDNAPage.tsx & data/player_dna.csv

Step 6: Demonstrate Play AI or Coach Mode
  - Navigate to /live-chess?mode=coach.
  - Play move 1. e4 -> Observable: Coach panel immediately displays best move, evaluation bar,
    and tactical explanation powered by Stockfish UCI.
  - File: frontend/src/pages/LiveChessPage.tsx & Scripts/stockfish_service.py
```

---

# Part 10 — Honest Gaps & Recommendations

### 1. Already Implemented & Demonstrable
- **K-Means Clustering Pipeline:** Complete Scikit-Learn training, silhouette evaluation, bootstrap uncertainty, and database persistence ([Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py)).
- **Runtime Inference Engine:** Safe artifact loading with cached models and graceful fallback ([backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py)).
- **Vector Distance Matching:** Exact Euclidean, Cosine, and k-NN implementations with ablation studies ([Scripts/matchmaking.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/matchmaking.py)).
- **Live Queue Integration:** Dynamic time-expanding rating windows with live DNA distance tie-breaking ([backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py)).
- **Stockfish UCI Engine Integration:** Thread-safe execution, move evaluation, and CPL extraction ([Scripts/stockfish_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/stockfish_service.py)).
- **Asynchronous Analysis Worker:** Resilient background processing using database lock-skipping ([backend/analysis_worker.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/analysis_worker.py)).
- **Authoritative Elo & Chess Rules:** Full FSM game transitions and idempotent rating updates ([backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py)).
- **Full-Featured User Interface:** Responsive web application covering normal play, competitive queues, AI arena, ML telemetry, and academic demonstration mode.

### 2. Implemented but Incomplete or Awaiting Live Data
- **Live Model Artifact in Fresh Environments:** Because the training script strictly requires 10 registered accounts with $\ge 3$ analyzed games from live platform play, a freshly deployed database will have 0 eligible accounts. The runtime inference code correctly returns `None` and displays "Pending" until the database accumulates the required live games.
- **Stockfish Binary Requirement:** The Stockfish wrapper requires the Stockfish executable binary on the host path or configured via `STOCKFISH_PATH`. If Stockfish is absent, game analysis jobs remain queued until the engine is available.

### 3. Recommended Future Improvements
- **Tactical Motif Feature Extraction:** Integrate an opening classification engine (ECO code mapping) and piece-mobility metrics to expand the 3D PlayerDNA vector into strategic dimensions (e.g., King safety, pawn structure dynamism).
- **Time-Split Pre-Game Outcome Modeling:** Once the live database accumulates over 1,000 completed rated games, train a supervised Logistic Regression or Gradient Boosted classifier using pre-game rating gaps and historical PlayerDNA differences to evaluate whether DNA distance improves outcome prediction over pure Elo.
- **Hierarchical Clustering (Dendrograms):** Add Ward's hierarchical agglomerative clustering to visualize player clusters as a hierarchical tree.

---

# One-Page Viva Revision Sheet

| Concept | Key Details | Important Formula / Code |
|---|---|---|
| **K-Means Clustering** | Unsupervised clustering of live players by move quality. Optimizes $k \in [2, 5]$ via silhouette score. | $\mathcal{J} = \sum_{j=1}^{k} \sum_{x \in S_j} \|x - \mu_j\|^2$<br>`make_pipeline(SimpleImputer, StandardScaler, KMeans)` |
| **PlayerDNA 3D Vector** | 1. `median_cpl` (Move quality)<br>2. `cpl_std` (Consistency)<br>3. `inaccuracies_per_100_cp_moves` (Error rate) | Scaled via RobustScaler:<br>$z = (x - \text{median}) / \text{IQR}$ |
| **k-NN Retrieval** | Exact Euclidean metric neighbor retrieval; confirmed identical rank agreement (Spearman = 1.000). | $d(\mathbf{u}, \mathbf{v}) = \sqrt{\sum (u_i - v_i)^2}$ |
| **Principal Component Analysis** | 2D visualization of 3D vector space via NumPy SVD. | `u, s, _ = np.linalg.svd(X - X.mean(axis=0))` |
| **Elo Rating System** | Standard statistical rating update ($K=32$). | $E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$<br>$R'_A = R_A + \text{round}(32 \cdot (S_A - E_A))$ |
| **Dynamic Queue Window** | Expands by 50 Elo every 10s up to 500 max. | $W(t) = \min(500, W_{\text{base}} + \lfloor t/10 \rfloor \times 50)$ |
| **Accuracy Model** | Exponential conversion of centipawn loss. | $\text{Accuracy} = 100 \times \exp(-\overline{\text{CPL}} / 100)$ |
| **Stockfish UCI Engine** | Minimax, Alpha-Beta pruning, Iterative Deepening, NNUE evaluation. | External binary accessed via UCI protocol over `python-chess` subprocess. |

### Top 5 Code Files to Open During Viva
1. **[Scripts/train_player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/Scripts/train_player_style_model.py)** — K-Means pipeline, silhouette score, and bootstrap uncertainty.
2. **[backend/services/player_style_model.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/player_style_model.py)** — Runtime ML artifact loader and safe prediction fallback.
3. **[backend/services/match_queue_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/match_queue_service.py)** — Rating window expansion and live DNA distance tie-breaking.
4. **[backend/services/live_game_service.py](file:///d:/Atharva/Project/AIML_Project-chess-/backend/services/live_game_service.py)** — Authoritative chess logic and mathematical Elo updates.
5. **[frontend/src/pages/DemoPage.tsx](file:///d:/Atharva/Project/AIML_Project-chess-/frontend/src/pages/DemoPage.tsx)** — Dedicated academic evaluator demonstration interface.
