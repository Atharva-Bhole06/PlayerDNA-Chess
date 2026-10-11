# Deployment preparation

## Architecture and deployment assets

The repository contains a Vite-built static frontend, a FastAPI application,
and a Compose service for PostgreSQL. It does not contain frontend or backend
Dockerfiles, a complete application Compose stack, or a hosting-provider
configuration. This guide keeps those components separate; it does not assume
a cloud provider or deploy the application.

For production, serve `frontend/dist` from a static web server or static host.
Run FastAPI as a separate service and PostgreSQL as a persistent database.
Install Stockfish on the backend host or image. Use a reverse proxy to route
`/api/*` to FastAPI when using the frontend's same-origin API default.

## Frontend build and API URL

Vite substitutes `VITE_*` values into the frontend at build time. The API
client uses `http://localhost:8000` only in development so the browser session
cookie stays same-site with a Vite app served on localhost. A production build
without `VITE_API_BASE_URL` uses same-origin relative `/api` requests; the
static host must proxy those requests to FastAPI. For a separately hosted API,
set the API origin before building, for example:

```powershell
$env:VITE_API_BASE_URL = 'https://api.example.com'
npm run build
```

Build separately for each API origin. The browser origin hosting the frontend
must be listed exactly in backend `PLAYERDNA_CORS_ORIGINS`. Do not use `*`.
Only public configuration belongs in `VITE_*` variables: these values are
embedded in the browser bundle and are visible to every user. Never put database
passwords, tokens, or other secrets in frontend variables.

The app uses client-side routes. Vite's development and preview servers provide
history fallback, but a production static host must rewrite unknown page paths
such as `/`, `/player-dna`, `/matchmaking`, and `/live-chess` to `/index.html`.
Keep `/api/*` rewrites ahead of the SPA fallback so API requests reach FastAPI.

## Backend configuration

Install the runtime dependencies from `requirements-backend.txt`,
`requirements-database.txt`, and `requirements-live-chess.txt` as appropriate
for the deployment. Start the existing ASGI app with Uvicorn, without reload
in production:

```text
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Run `python -m backend.analysis_worker` as a separate supervised process with
the same database configuration and Stockfish executable. This worker handles
durable queued game-analysis jobs outside the live move request path. Use
`python -m backend.analysis_worker --once` for a bounded manual run, or add
`--retry-failed` after resolving an engine failure. Install
`requirements-ml.txt` only on instances that train or serve the optional Player
DNA style cluster model.

Use a process manager or container supervisor to restart failed processes and
bind the port expected by the hosting environment. `0.0.0.0` is needed inside
a container; it is not a public firewall policy. Restrict network access to
the API through the host firewall or reverse proxy.

Backend settings are read from environment variables or the repository-root
`.env` file. Configure either:

- `DATABASE_URL`, a PostgreSQL SQLAlchemy URL using the `postgresql+psycopg`
  driver; or
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` together.

Keep production credentials in the deployment platform's secret store or a
protected runtime environment file. `.env` is ignored by Git; do not commit it.
The committed `.env.example` contains development placeholders only.

Set `PLAYERDNA_CORS_ORIGINS` to a comma-separated list of exact browser
origins, including scheme and port where applicable, for example
`https://chess.example.com`. No wildcard is allowed. The backend defaults are
development origins and should be overridden in production.

Set `PLAYERDNA_COOKIE_SECURE=true` whenever the app is served over HTTPS. Local
HTTP development defaults to a non-Secure, HttpOnly, SameSite=Lax cookie;
production must use HTTPS. Registration and sign-in use salted PBKDF2 password
hashes and opaque random server sessions, with only a SHA-256 session-token hash
stored in PostgreSQL. Apply additive schema changes using `alembic upgrade head`
after the database is available; the current migration chain adds user accounts,
sessions, the Elo queue, and persistent live games without replacing cohort data.

Competitive ratings use Elo (K=32), initialized at 1200. The queue begins with
a 100 point window for established players and 250 points for provisional
players, then expands by 50 points every 10 seconds up to 500 points. Configure
the clock with `PLAYERDNA_GAME_TIME_SECONDS` and
`PLAYERDNA_GAME_INCREMENT_SECONDS`. Queue coordination uses a PostgreSQL
transaction advisory lock. WebSocket fan-out currently uses in-process memory,
so production must run one backend worker per game-serving instance until a
shared pub/sub transport is added. Reconnect restores persisted state; closing
the browser leaves the game active and its clocks continue.

## PostgreSQL and service order

The current `compose.yaml` starts only PostgreSQL 16, persists its data in the
`playerdna_postgres_data` volume, binds the published database port to
loopback, and waits for `pg_isready`. It is a local database service, not a
complete production application stack. Protect database credentials and
storage, use durable backups, and restrict database network access in the
chosen host environment.

Start PostgreSQL and wait for its health check before starting FastAPI. Apply
Alembic migrations and import the curated cohort as a separately planned data
operation before enabling player and matchmaking endpoints. The repository
docs describe those commands; this preparation did not run them or change any
database contents. Verify the API's health and player endpoints after the
database is reachable.

Database hostnames depend on where FastAPI runs. For a backend process on the
same host as the current Compose database, `127.0.0.1` and the published port
can be used. If FastAPI is later placed in a container on the same Compose
network, use the Compose service name `postgres` and container port `5432`.
Loopback inside a container points back to that container, not to PostgreSQL
or the host. The current Compose file does not define the FastAPI service.

`GET /api/health` checks the database with `SELECT 1` and checks whether a
Stockfish executable can be discovered; it does not launch an engine. Treat it
as a dependency/readiness check, not a process-only liveness probe. With an
unreachable PostgreSQL server, driver connection establishment can take time;
the current configuration does not set an explicit connection timeout.
Production orchestration should use bounded health-check timeouts and a
separate process liveness check if the platform requires one.

## Stockfish

Install a compatible Stockfish executable on every backend instance that
serves chess recommendations. Set `STOCKFISH_PATH` to its absolute executable
path, or make an executable named `stockfish` available on the backend
process's `PATH`. If using a container, include the engine in that image or
mount it read-only at a known path. Do not assume a developer workstation's
path exists in a deployed environment.

The API can serve player and matchmaking requests without Stockfish, but
`POST /api/chess/recommend` returns HTTP 503 until the engine is available.
`stockfish_available` on the health response checks discovery only, not that a
real analysis has succeeded. Verify a real legal-position analysis on the
target deployment before claiming chess analysis is operational.

## Readiness checks and current blockers

The FastAPI/OpenAPI endpoint is reachable in the current environment, but
PostgreSQL on configured loopback port 5432 is not. `/api/health` and
`/api/players` have timed out, and chess recommendation returned HTTP 503
because Stockfish is unavailable. These are unresolved runtime dependencies,
not passing integration checks. Before production release, provision and
secure PostgreSQL, apply and verify the schema/data, install/configure
Stockfish, set the deployment API URL and CORS origin, and then verify health,
player listing/profile, matchmaking, and a real chess analysis request.
