# Multiplayer platform implementation status

**Updated:** 2026-10-11

## Implemented

- **Architecture audit:** [platform architecture audit](platform_architecture_audit.md) records the existing cohort analytics boundary and the additive implementation sequence.
- **Accounts:** registration, login, logout, `/me`, case-insensitive unique usernames, PBKDF2 password hashes, opaque revocable HttpOnly sessions, and registered profiles linked to non-cohort `Player` rows. Historical cohort players remain separate.
- **Competitive matchmaking:** authenticated queue join/status/cancel, stale-entry cleanup, Elo initialized at 1200 with K=32 updates, 100-point established / 250-point provisional initial windows, 50-point expansion every 10 seconds to 500, and PostgreSQL advisory-lock pairing. DNA distance is an IQR-scaled secondary tie-break only when enough analyzed live profiles exist.
- **Live games:** persistent white/black assignment, server-authoritative `python-chess` move validation, expected-ply duplicate protection, saved FEN/PGN/moves, configurable clocks, checkmate/stalemate/draw/resign/timeout finalization, reconnection restore, and participant-only WebSockets. Competitive statistics and per-game rating history update once at finalization.
- **Reports:** finalization queues a durable analysis job. A separate worker replays actual stored moves and compares played moves with Stockfish searches. Move evaluations are persisted for idempotency; per-player reports include CPL classifications, best-move agreement, the documented accuracy formula, critical moves, mate opportunities, recommendations, and explainable 3–5 stars when at least eight centipawn-evaluable moves exist. Pending/failed reports contain no fabricated metrics.
- **Dashboard:** Play Now, registered-user leaderboard with deterministic ties and provisional-rating explanation, registered public profiles, recent completed games, report links, and live Player DNA history.
- **ML path:** versioned live DNA snapshots and K-Means training/evaluation/inference code using only analyzed registered-user games. Model metadata and evaluation metrics have database tables; artifacts are versioned under `artifacts/models`. Training refuses fewer than ten eligible users. No live outcome model is claimed; see [Player DNA ML](player_dna_ml.md).

## Validation performed

- Backend: `python -m unittest discover -s tests -v` — **54 tests passed** using SQLite fixtures and controlled fake-engine behavior. This includes account flows, queue pairing, WebSocket moves, finalization, Elo idempotency, report generation/failure, importer separation, and all Alembic migrations.
- Frontend: `npm test -- --run` — **27 tests passed**.
- Frontend production build: `npm run build` — **passed**.
- Dependency audit: `npm audit` — **0 vulnerabilities**.
- Python syntax: `python -m compileall -q backend Scripts tests` — **passed**.
- Real Stockfish probe: engine discovery returned **unavailable**, so no real engine analysis or worker run was claimed.
- Docker/PostgreSQL: `docker compose ps` could not connect because access to the Docker engine was denied. No database migration was applied and no persistent volume was started or changed.
- ML training: **not run**. The current environment lacks scikit-learn and no eligible live account/game corpus was available. No cluster metrics or trained model are claimed.

## Runtime requirements and remaining release checks

The API, PostgreSQL, Stockfish, and `python -m backend.analysis_worker` must all be available for completed reports. Apply the additive schema with `alembic upgrade head`; do not reset or replace the database. Set `PLAYERDNA_COOKIE_SECURE=true` under HTTPS. Configure exact frontend origins in `PLAYERDNA_CORS_ORIGINS`.

WebSocket fan-out is in process memory, so run one game-serving worker per instance until a shared pub/sub layer exists. Install Stockfish and run the real engine smoke test, start the intended PostgreSQL instance and apply migrations, then exercise two real browser sessions through pairing, play, completion, worker analysis, and refresh. A style model becomes available only after its ten-user minimum is met and `python -m Scripts.train_player_style_model` completes successfully. The older dataset quality/provenance issues in the Phase 1–8 report remain separate from live accounts.
