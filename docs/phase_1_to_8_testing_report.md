# PlayerDNA AI Phase 1–8 Testing Report

**Audit date:** 2026-10-09  
> Historical audit snapshot. Multiplayer platform work added afterward is tracked in [platform implementation status](platform_implementation_status.md); this earlier report has not been retroactively rewritten.
**Scope:** Existing repository and artifacts only. No application code or project CSVs were modified. Regeneration checks ran in disposable temporary directories. Database tests used in-memory SQLite.

## Status summary

| Phase / component | Status | Test performed and actual result | Errors / recommended fix and priority |
|---|---|---|---|
| 1. Dataset and processing pipeline | **FAIL** | `player_game_records.csv` has 3,000 player-game rows for 75 players (40 each). In a temporary copy, `process_chess_games.py` completed all 3,000 with zero errors. The checked-in `processed_player_games.csv` is instead a 1,200-row subset for 30 players; its keys are contained in the 3,000 records. Search found no script that selects/reproduces that exact 30-player cohort, while `analyze_with_stockfish.py` requires exactly 1,200 rows and 30 players. | **P1:** Add/recover an explicit deterministic cohort-selection step and document its ordering/criteria. Re-run downstream steps only after agreeing how existing artifacts should be preserved. |
| 1. Source data quality | **FAIL** | `games.csv`: 20,058 rows, 19,113 distinct game IDs, 945 repeated-ID rows, of which 429 are exact duplicate rows. Optional opening fields are missing (6,325 rows each for `opening_eco`/`opening_name`; 7,671 for `opening_ply`). The record creator drops duplicate IDs using the first row encountered. `player_game_records.csv` itself has unique `(player_id, game_id)` keys and exactly 40 records/player. | **P1:** Inspect conflicting duplicate IDs and make the chosen deduplication rule explicit; currently “first row wins” can discard differing records. Optional opening nulls are expected and should remain nullable. |
| 1. Intermediate selection helper | **FAIL** | `selected_games.csv` has 1,144 rows and 1,144 unique IDs when read after its three leading comment lines. `Scripts/check_selected_dataset.py` calls plain `pd.read_csv` without skipping those lines; the equivalent read fails with a parser error because the metadata lines do not match the 16-column data header. | **P2:** Make the helper locate/skip the actual header, as the main record-creation script does. |
| 1. Game feature processing | **PASS** | `processed_player_games.csv`: 1,200 rows, 30 players, 40 games/player; no duplicate `(player_id, game_id)` keys. All processed player/opponent move counts sum to total plies (zero mismatches). No `chess_processing_errors.csv` artifact is present. | No urgent issue found in the current output. Pipeline reproducibility remains blocked by cohort selection above. |
| 2. Player profiles | **PASS** | Regenerated `player_profiles.csv` in a temporary copy and matched the existing file exactly (30 rows, 65 columns). Each player has 40 games. Twelve null cells occur in six Black-only statistics for two players with zero Black games; this is consistent with “no observations,” not a failed calculation. Rates and accuracy percentages are within 0–100. | Keep zero-observation statistics nullable and document this in API/schema consumers. |
| 3. Player DNA | **PASS** | Regenerated `player_dna.csv` and `player_dna_scaler_parameters.csv` in a temporary copy; both exactly match current outputs. Thirty IDs match profiles; three normalized features have no missing/non-finite values. Recalculated robust median/IQR scaling differs by at most 2.3e-16. Observed feature ranges: `dna_median_cpl` −1.242…1.441; `dna_cpl_std` −1.036…2.387; `dna_inaccuracies_per_100_cp_moves` −1.492…1.417. | The scaler is cohort-fitted; treat it as versioned cohort data if the cohort changes. No ratings or outcomes enter matchmaking distance. |
| 4. Matchmaking | **PASS** | Existing tests passed: 10 matchmaking tests within the 16-test database-free run. Tested self-exclusion, score ordering, deterministic ties, top-N cap, unsupported modes, unknown IDs, duplicate IDs, missing features, and all pairwise rows. For 30 players, top-N 29 returns 29 unique non-self players. | Only `most_similar` is implemented. Balanced/challenge modes are not implemented and need explicit policy/rating data before being offered. |
| 5. Matchmaking evaluation | **PASS** | Ran `evaluate_matchmaking.py` in a temporary copy; the report matched the existing report exactly. Existing measured results: Euclidean/cosine mean top-five overlap 3.43/5; Euclidean/KNN 5.00/5 (same Euclidean ranking); feature ablations change mean overlap to 2.93–3.27/5; bootstrap stability mean overlap 2.49/5, with 3/150 original top-five slots recurring in at least 80% of resamples. Rating-nearest overlap is 1.67/5; random baseline overlap is 0.88/5. The evaluation checked 1,350 explanation feature gaps. | **P2:** The low bootstrap stability deserves product review. These are ranking agreement/stability measurements, not match-quality or accuracy; there is no ground-truth suitable-opponent dataset. |
| 6. Stockfish offline analysis | **PASS (artifacts)** | `chess_performance_features_v2.csv`: 1,200 games, 30 players, no null cells or duplicate game keys. `stockfish_move_audit_v2.csv`: 39,097 move rows; all keys match the 1,200 games; no duplicate `(game_id, player_move_number)`. There are 37,928 CP-evaluable moves and 1,169 mate-evaluation moves. CP/mate fields are mutually exclusive; CPL is null only for mate rows, never negative, and exactly matches `max(0, best_cp - played_cp)` on CP rows. CPL range 0–1,730; median 19; p95 315.65. All move-level classification/mate-event counts reconcile with all 1,200 game summaries. | Artifacts are internally consistent. Values are depth-10 engine estimates; they are not ground truth. |
| 6. Live chess and Stockfish | **PASS (fake-engine behavior); BLOCKED (real engine)** | Seven Stockfish service tests passed, including legal moves, invalid/illegal FENs, mate-vs-CP response separation, terminal positions, reuse, and missing engine path. Additional controlled checks passed for engine startup errors, analysis errors, and timeouts. No `STOCKFISH_PATH` or Stockfish on PATH was available, so no real-engine search or timing was run. | **P2:** Install/configure Stockfish and run the live recommendation smoke test before release. |
| 7. FastAPI backend | **PASS (TestClient); BLOCKED (live server/PostgreSQL)** | OpenAPI exposes `GET /api/health`, `GET /api/players`, `GET /api/players/{player_id}`, `GET /api/matchmaking/{player_id}`, and `POST /api/chess/recommend`. Six backend API tests passed using SQLite-backed dependencies, covering response schemas, valid/invalid inputs, unknown records, error mapping, and chess terminal/engine cases. Health returned 200 with database/engine availability `false` when DB availability was stubbed. The health test using configured services stalled on PostgreSQL and was stopped. Uvicorn was not started against a working database. | **P1:** Repeat health and API checks against a real PostgreSQL service; use a bounded connection timeout so unavailable DB checks return promptly. A Starlette/httpx deprecation warning and one SQLite ResourceWarning appeared during tests (P3). |
| 8. PostgreSQL integration | **PASS (SQLite surrogate); BLOCKED (PostgreSQL)** | Five database/migration tests passed. In-memory import and field-by-field CSV verification matched: players 30, profiles 30, DNA 30, scalers 3, games 1,200, performance 1,200, move evaluations 39,097. Relationships and duplicate-import protection passed. Alembic migration created the schema against a temporary SQLite file. A read-only PostgreSQL `SELECT 1` probe failed with `OperationalError`; no tables/counts could be inspected. | **P1:** Start/identify the intended PostgreSQL instance, apply migration, then run `python -m backend.db.import_csv --verify`. Do not run `--replace`; it is unnecessary and could replace persistent rows. |
| 8. Credentials / Git | **PARTIAL** | `.env` is listed in `.gitignore`; `.env.example` contains placeholders. No credential values were printed. Git resolves the project path to `C:/` instead of a project-local repository root, so tracked-file/history verification for `.env` is inconclusive. | **P1:** Confirm the actual repository root and inspect Git history for secrets using the correct checkout. Rotate any credential found in history. |
| 9. End-to-end integration (requested through Phase 8 only) | **PARTIAL** | Database importer, repositories, player/matchmaking services, and API routes work together in SQLite-backed tests. Live PostgreSQL and real Stockfish are unavailable, and the 30-player cohort selection is not reproducible from the checked-in pipeline, so the full deployed path was not demonstrated. | **P1:** Resolve cohort provenance, then validate against PostgreSQL and a configured Stockfish process before calling the integration complete. |

## Critical failures and blockers

1. **Cohort reproducibility:** the current source pipeline produces 3,000 rows/75 players, while downstream analysis expects 1,200 rows/30 players. The current 1,200-row artifacts are a valid subset, but the selection step is absent from the repository.
2. **Source duplicate IDs:** 945 repeated IDs in `games.csv` are reduced with “first row wins”; 516 repeated-ID rows are not exact duplicates. Their selection may affect the dataset.
3. **PostgreSQL and live server:** the configured database could not be reached, so PostgreSQL migrations/row counts and a live Uvicorn request path remain unverified.
4. **Real Stockfish:** no engine executable/configuration was available; only fake-engine behavior and existing output artifacts were validated.
5. **Git secret audit:** `.env` is ignored, but Git root resolution is wrong for this checkout, so commit history could not be checked.

## Test commands/results actually run

- `python -m unittest tests.test_stockfish_service tests.test_matchmaking -v` — **16 passed**.
- `python -m unittest tests.test_database tests.test_migrations -v` — **5 passed**.
- Selected `BackendApiTests` excluding the real-DB health test — **6 passed**.
- Health route through `TestClient`, with DB availability stubbed false — **200**, availability fields false.
- Temporary-copy runs of `process_chess_games.py`, `player_profile.py`, `create_player_dna.py`, and `evaluate_matchmaking.py` — preprocessing 3,000/3,000; profile/DNA/scaler outputs exactly reproduced; evaluation report exactly reproduced.
- Read-only PostgreSQL connectivity check — **OperationalError**; no DB write attempted.

## Exact next steps

1. Confirm the project’s intended Git checkout root before any secret-history scan.
2. Review duplicate game IDs and define the cohort-selection rule that yields the 30 × 40 analysis set; record it in a reproducible script.
3. Confirm the target PostgreSQL instance and its intended persistent volume. Then, from the project root, use the existing documented sequence:

   ```powershell
   docker compose ps
   docker compose up -d postgres
   alembic upgrade head
   python -m backend.db.import_csv --verify
   ```

   `docker compose up` may create/start the persistent `playerdna_postgres_data` volume, and `alembic upgrade head` writes schema changes. Do not run `python -m backend.db.import_csv --replace` for this verification.

4. Configure `STOCKFISH_PATH` locally (do not paste credentials or local secrets into chat), then start the backend and check the actual routes:

   ```powershell
   $env:STOCKFISH_PATH = 'C:\path\to\stockfish.exe'
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

   In another terminal, exercise `/api/health`, `/api/players`, `/api/players/{known-id}`, `/api/matchmaking/{known-id}?mode=most_similar&top_n=5`, and `POST /api/chess/recommend` with a valid FEN, an invalid FEN, and a terminal FEN. OpenAPI is available at `/openapi.json`.

No Phase 9 work was started. No application code or project data was changed during this audit.
