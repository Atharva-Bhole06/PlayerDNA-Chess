# PlayerDNA AI FastAPI backend

## Structure

```text
backend/
  main.py                  FastAPI app, CORS, health check, router assembly
  config.py                source artifact locations and exact CORS allowlist
  routes/                  HTTP validation, status mapping, response models
  schemas/                 Pydantic API request/response types
  services/                application services and Stockfish adapter
  repositories/            SQLAlchemy player and DNA access
  db/                      models, sessions, CSV importer and verifier
alembic/                   versioned PostgreSQL schema migration
Scripts/
  matchmaking.py           existing Player DNA ranking implementation
  stockfish_service.py     reusable UCI/Stockfish analysis service
```

Player and matchmaking services read PostgreSQL through repositories.
Matchmaking delegates ranking to `Scripts.matchmaking`; the chess route
delegates to `Scripts.stockfish_service`. Routes do not duplicate these
algorithms. The importer/verifier reads the unchanged CSV research artifacts.

## Initialize and run

Copy `.env.example` to `.env`, set a local password, then run from the project
root:

```powershell
Copy-Item .env.example .env
# Edit .env and replace DB_PASSWORD.
docker compose up -d postgres
python -m pip install -r requirements-database.txt
alembic upgrade head
python -m backend.db.import_csv
python -m backend.db.import_csv --verify
$env:STOCKFISH_PATH = 'C:\path\to\stockfish.exe'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal, run `python -m backend.analysis_worker` to process queued
post-game reports. `--once` processes one job; `--retry-failed` requeues failed
jobs after Stockfish has been repaired. A finished game remains stored when the
engine is unavailable, and its report status stays `failed` without fabricated
metrics.

The importer refuses to reload a populated cohort unless `--replace` is
explicitly supplied. It validates identities, game keys, the 40-games-per-
player cohort, move-audit relationships, and scaling rows before writing.
`--verify` compares table counts, keys, and imported fields to source CSVs.
Set `DATABASE_URL` instead of `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD` if preferred.

Swagger is at `/docs`; OpenAPI is at `/openapi.json`.

## Endpoints

- `GET /api/health`: liveness plus database and Stockfish availability. The
  database check is `SELECT 1`; Stockfish discovery does not launch an engine.
- `GET /api/players`: IDs, analyzed game counts, mean ratings, and win rates.
- `GET /api/players/{player_id}`: profile record, performance statistics, and
  raw Player DNA measurements.
- `GET /api/matchmaking/{player_id}?mode=most_similar&top_n=5`: existing
  Euclidean DNA recommendations, scores, ranks, and feature explanations.
- `POST /api/chess/recommend`: validated FEN to the independent Stockfish
  service; returns best move, score type, principal variation, and timing.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`: registered accounts and HttpOnly browser sessions.
- `POST`, `GET`, and `DELETE /api/matchmaking/queue`: authenticated queue join,
  status polling, and cancellation. Pairing uses Elo and creates a persistent
  game; the historical DNA route remains a cohort recommendation.
- `GET /api/games/{game_id}` and `WS /api/games/{game_id}/ws`: participant-only
  game restore and authoritative live move/action stream. The WebSocket validates
  browser origin against `PLAYERDNA_CORS_ORIGINS`.
- `GET /api/games/{game_id}/report`: actual post-game Stockfish status and, once
  complete, per-player move-quality metrics and versioned stars.
- `GET /api/leaderboard`, `GET /api/profiles/{username}`, and authenticated
  `GET /api/account/games`: registered-user rankings, profiles, and recent games.
- `GET /api/profiles/{username}/dna`: versioned measurements from analyzed live
  games. Optional style-cluster inference is returned by the registered profile
  route only when a trained artifact and eligible data are available.

Player IDs are restricted to letters, numbers, dots, underscores, and hyphens.
`top_n` is 1–29 for the current cohort. Only `most_similar` is supported.
Chess evaluations are White-oriented; mate distances remain distinct from
centipawn values.

## Errors and CORS

Malformed fields, modes, and FEN positions return 422; unknown players return
404; unavailable database, data, or Stockfish returns 503; Stockfish timeout
returns 504. Unexpected errors return generic messages. Database credentials,
filesystem paths, and stack traces are not returned to API clients.

Exact development origins `http://localhost:5173` and `http://localhost:3000`
are allowed by default. `PLAYERDNA_CORS_ORIGINS` overrides the allowlist with
comma-separated exact origins; wildcards are rejected. Configure the deployed
frontend origin before production use.

CSV files remain in `data/` as research, backup, and reproducibility artifacts.
They are not read by application player or matchmaking services after migration.
