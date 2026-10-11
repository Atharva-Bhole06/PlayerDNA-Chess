# PlayerDNA AI platform architecture audit

**Audited:** 2026-10-11

## Current implementation

- **Frontend:** React 19, TypeScript, Vite, React Router, Vitest. Routes cover Overview, Player DNA, DNA recommendations, and a live chess/analysis page. The API client currently has read-only calls for cohort players, DNA matchmaking, health, and FEN-based Stockfish recommendations.
- **Backend:** FastAPI with separate routers, Pydantic request/response schemas, service/repository layers, SQLAlchemy 2, and Alembic. `/api/chess/recommend` analyzes one supplied FEN; there is no account, queue, game, or WebSocket lifecycle.
- **Database:** PostgreSQL via `DATABASE_URL` or `DB_*`; the only migration creates cohort analytics tables. `players` are historical cohort IDs, `games` are imported historical game summaries, and move/performance rows are offline Stockfish artifacts. They are not authenticated users or playable platform games.
- **Matchmaking:** `Scripts/matchmaking.py` ranks the imported Player DNA cohort by a standardized feature distance. It is a recommendation endpoint only, has no competitive rating, queue, or atomic pairing, and must not be used to assign registered users.
- **Chess/engine:** `Scripts/stockfish_service.py` validates FEN and calls a reusable UCI engine for recommendations. There is no server-authoritative game board, persistent move history, or analysis job. `python-chess` and Stockfish support are already in the live-chess requirements/service.
- **Player DNA and ML:** The checked-in 30-player/1,200-game cohort has reproducible profile/DNA outputs and a measured similarity evaluation. There is no live DNA history, training job, trained outcome model, model registry, or inference path. The 3,000-row source vs. 1,200-row analysis cohort and duplicate source IDs remain provenance concerns in the testing report.
- **Operations:** Docker Compose provides PostgreSQL 16 with a named volume. `.env.example` documents database/CORS settings. The active testing report records that PostgreSQL and a real Stockfish binary were unavailable in its validation environment. The checkout’s Git root resolves outside this project, so Git history/security status is inconclusive.

## Reusable components and missing capabilities

Reuse the existing FastAPI, SQLAlchemy, Alembic, Pydantic, React/Vite, `python-chess`, Stockfish service, and historical analytics tables. Keep historical cohort identities and files unchanged. Add a separate registered-user identity linked to a non-cohort `Player` row; add independent competitive rating/history and online-game tables. Extend, rather than reinterpret, the existing DNA recommendation feature.

Missing: secure registration/login/logout and authorization; user-owned profile; competitive rating updates; persistent matchmaking queue and transactional pairing; authoritative WebSocket chess lifecycle; persistent legal moves/results; asynchronous/idempotent analysis; per-player reports and deterministic performance stars; live leaderboard; live DNA snapshots; model training metadata and a supported inference path; corresponding UI, migrations, tests, and production instructions.

## Planned implementation order

1. Add accounts, hashed passwords, opaque revocable sessions, registered-user profiles, migration, and auth UI/API foundation. Keep cohort endpoints explicitly historical.
2. Add Elo rating history and a database-backed queue with transactional pairing/cancellation and fairness window expansion.
3. Add games/participants/moves, authenticated WebSocket state sync, authoritative `python-chess` validation, clocks/outcomes/reconnect, and persistence.
4. Add idempotent analysis jobs that replay saved moves, use configured Stockfish asynchronously, and store honest status/results/reports.
5. Add versioned explainable performance stars, rating finalization once, and registered-user leaderboard queries.
6. Add live DNA snapshots from analyzed games and a reproducible training/evaluation pipeline; serve only measured models and retain safe fallbacks.
7. Integrate dashboard/navigation, write operational/release documentation, then run requested tests/builds and report unavailable infrastructure checks accurately.

Each schema addition should be additive and migrated with Alembic. Never import the cohort as users, reset the database, or claim live integration without PostgreSQL and a real engine.
