# PlayerDNA — Chess Behavioral Style Intelligence Platform

PlayerDNA is an end-to-end chess platform that combines competitive gameplay with behavioral style intelligence, Stockfish move evaluation, and data-driven post-game coaching.

Beyond standard chess features, PlayerDNA characterizes player behavior through a 3D **Player DNA** vector (median centipawn loss, CPL standard deviation, and inaccuracies per 100 evaluable plies) to analyze play patterns, perform cohort matching, and deliver learner-friendly performance analytics.

---

## 1. Project Overview & Features

- **Interactive Play Arena (`/play`)**:
  - Play against AI bots (Stockfish-powered with configurable search depth).
  - Local Pass & Play mode.
  - Real-time multiplayer matchmaking with registered accounts and Elo progression.
  - Guest mode for instant casual play.
- **Game History & Analysis Workspace (`/history`, `/games/:id/report`)**:
  - Full match history with results, Elo changes, and timestamps.
  - Dedicated analysis workspace featuring an interactive evaluation chessboard.
  - Move-by-move Stockfish centipawn loss (CPL) auditing and classification (best, inaccuracy, mistake, blunder, forced mate).
  - Performance summaries, star ratings, accuracy metrics, and AI Coach explanations.
- **Asynchronous Analysis Worker (`backend.analysis_worker`)**:
  - Background daemon that processes queued game analysis jobs asynchronously without blocking live gameplay.
- **Admin Research Portal (`/research`)**:
  - Analysis of the 30-player historical cohort (1,200 games, 39,097 move audits).
  - 3D Player DNA behavioral space and feature distribution metrics.
  - K-Nearest Neighbors (KNN) and cosine similarity style matching.
  - Machine learning model status and retraining workflows.
- **Authentication & Player Profiles**:
  - Secure, HTTP-only cookie-based authentication.
  - User profiles with win/loss records and Elo ratings.
  - Role-based access control for administrative and research features.

---

## 2. Prerequisites (Windows)

Ensure the following tools are installed on your Windows development environment:

| Requirement | Supported Version | Notes |
| :--- | :--- | :--- |
| **Git** | Latest (2.x+) | Needed for version control and cloning |
| **Python** | **3.12** (64-bit) | Required for backend, ML, and database migrations |
| **Node.js & npm** | **>= 20.19.0** (npm >= 10.x) | Required for frontend build and Vite dev server |
| **Docker Desktop** | Latest (with WSL 2) | Required to run PostgreSQL container |
| **Stockfish** *(Optional)* | Stockfish 16 or 17 | Required for live move evaluation and analysis worker |

> **Note on PowerShell Script Execution:**
> If you encounter a script execution policy error when activating Python virtual environments in PowerShell, run:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 3. Clone Instructions

Clone the repository to your local machine using Git in PowerShell:

```powershell
git clone <repository-url>
cd AIML_Project-chess-
```

---

## 4. Python Virtual Environment & Dependencies

From the repository root directory, create and activate a Python 3.12 virtual environment:

```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment in PowerShell
.\.venv\Scripts\Activate.ps1

# Upgrade pip
python -m pip install --upgrade pip
```

Install all backend, database, ML, and test dependencies:

```powershell
pip install -r requirements-database.txt -r requirements-ml.txt -r requirements-api-test.txt
```

### Dependency Files Breakdown
- `requirements-live-chess.txt`: Core live chess engine, FastAPI (`>=0.115`), Uvicorn (`>=0.30`), and python-chess (`>=1.999`).
- `requirements-backend.txt`: Adds pandas (`>=2.2`), numpy (`>=2.0`), pydantic (`>=2.8`), and SQLAlchemy (`>=2.0`).
- `requirements-database.txt`: Adds Alembic migration tool (`>=1.13`) and PostgreSQL binary driver psycopg (`>=3.2`).
- `requirements-ml.txt`: Adds scikit-learn (`>=1.5`) and joblib (`>=1.4`) for Player DNA models.
- `requirements-api-test.txt`: Adds httpx (`>=0.27`) for FastAPI API integration tests.

---

## 5. Configure Environment Variables (`.env`)

Create your local `.env` configuration file from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your code editor and configure your local PostgreSQL credentials:

```ini
# PostgreSQL connection parameters
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=playerdna
DB_USER=playerdna_app
DB_PASSWORD=your_local_secret_password_here

# Exact frontend origins (no wildcards allowed)
PLAYERDNA_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000

# Game timer defaults (seconds)
PLAYERDNA_GAME_TIME_SECONDS=300
PLAYERDNA_GAME_INCREMENT_SECONDS=0

# Set false for local HTTP development; set true only when running over HTTPS
PLAYERDNA_COOKIE_SECURE=false

# (Optional) Full path to Stockfish binary if not on Windows PATH
# STOCKFISH_PATH=C:\Tools\stockfish\stockfish-windows-x86-64-avx2.exe
```

> **Security Warning:**
> Never commit `.env` or any file containing real passwords or secrets to Git. The `.gitignore` is already configured to exclude `.env`, `.venv`, and `node_modules`.

---

## 6. Start PostgreSQL via Docker Compose

Start the PostgreSQL 16 container in the background using the provided `compose.yaml`:

```powershell
docker compose up -d postgres
```

Verify that the database container is running and healthy:

```powershell
docker compose ps
```

To stop the PostgreSQL container when done:
```powershell
docker compose down
```

---

## 7. Run Database Migrations & Data Import

### Step 7.1 — Apply Alembic Migrations
Run Alembic from the repository root to create all database tables:

```powershell
alembic upgrade head
```

### Step 7.2 — Import Historical Cohort Data
Populate the database with the verified 30-player historical research cohort (1,200 games, audited Stockfish move evaluations, and Player DNA scalers):

```powershell
python -m backend.db.import_csv
```

Verify the database data integrity against the source CSV files:

```powershell
python -m backend.db.import_csv --verify
```

### Step 7.3 — (Optional) Promote an Admin Account
To access the Research Portal (`/research`), an account must have administrative privileges:

```powershell
# Promote a registered username to admin
python -m backend.manage_admin promote <username>

# List all registered accounts and admin statuses
python -m backend.manage_admin list
```

---

## 8. Start Backend & Frontend

Run the FastAPI backend and Vite frontend in **two separate PowerShell terminals**.

### Terminal 1 — Backend (FastAPI & Uvicorn)
From the repository root:

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Start FastAPI development server
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

- API Base URL: `http://127.0.0.1:8000`
- Interactive OpenAPI / Swagger Documentation: `http://127.0.0.1:8000/docs`
- Health Check Endpoint: `http://127.0.0.1:8000/api/health`

### Terminal 2 — Frontend (React & Vite)
From the `frontend` directory:

```powershell
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

- Web Application: `http://localhost:5173`

### Terminal 3 — (Optional) Background Analysis Worker
To process completed games and generate Stockfish post-game reports asynchronously:

```powershell
.\.venv\Scripts\Activate.ps1
python -m backend.analysis_worker
```
*(Use `python -m backend.analysis_worker --once` to process a single queued job, or `--retry-failed` to retry previously failed analyses).*

---

## 9. Running Tests

### 9.1 Backend Test Suite
Run the backend unit and integration test suite using Python's built-in `unittest` runner:

```powershell
# From repository root with virtual environment activated:
python -m unittest discover -s tests -p "test_*.py"
```

To run a single backend test module:
```powershell
python -m unittest tests/test_backend_api.py -v
python -m unittest tests/test_game_report_api.py -v
python -m unittest tests/test_stockfish_service.py -v
```

### 9.2 Frontend Test Suite & Build Validation
Run Vitest and TypeScript production build checks:

```powershell
cd frontend

# Run frontend unit and component tests
npm test

# Run production build and TypeScript compilation
npm run build
```

---

## 10. Troubleshooting Common Setup Errors

### 1. `DatabaseUnavailableError` or `connection to server at "127.0.0.1", port 5432 failed`
- **Cause**: The PostgreSQL Docker container is not running or hasn't finished initializing.
- **Solution**:
  - Run `docker compose ps` to check container status.
  - If exited or unhealthy, check logs: `docker compose logs postgres`.
  - Ensure `.env` exists in the repository root and contains valid `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, and `DB_HOST`.

### 2. Port 5432 Conflict (`bind: address already in use`)
- **Cause**: A local PostgreSQL service is already running on port 5432 in Windows.
- **Solution**:
  - In PowerShell, run `Get-Service postgresql*` and stop it via `Stop-Service postgresql*`, **OR**
  - Change `DB_PORT=5433` in `.env` and restart: `docker compose up -d postgres`.

### 3. PowerShell Script Execution Blocked (`cannot be loaded because running scripts is disabled`)
- **Cause**: Windows PowerShell security policy restricts script execution by default.
- **Solution**: Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` and re-activate `.\.venv\Scripts\Activate.ps1`.

### 4. CORS Errors in Browser (`No 'Access-Control-Allow-Origin' header is present`)
- **Cause**: The frontend is running on an origin not listed in `PLAYERDNA_CORS_ORIGINS`.
- **Solution**:
  - Check the browser console to identify the exact origin (e.g., `http://localhost:5173` vs `http://127.0.0.1:5173`).
  - Add the exact origin to `PLAYERDNA_CORS_ORIGINS` in `.env`.
  - Do not use wildcards (`*`); wildcards are explicitly rejected for security.

### 5. `Stockfish was not found. Set STOCKFISH_PATH or add stockfish to PATH.`
- **Cause**: Stockfish is not installed or cannot be resolved by Python.
- **Solution**:
  - Download the official Stockfish Windows binary from [stockfishchess.org](https://stockfishchess.org/).
  - Set `STOCKFISH_PATH=C:\path\to\stockfish.exe` in `.env` (or add its folder to your system `PATH`).
  - Verify with the health endpoint: `GET http://127.0.0.1:8000/api/health` should return `"stockfish_available": true`.
  - You can also run the quick smoke test: `python test_stockfish.py`.

### 6. Node Version Incompatibility
- **Cause**: Node.js version is below `20.19.0`.
- **Solution**: Run `node -v`. If below 20.19.0, install an updated LTS release of Node.js from [nodejs.org](https://nodejs.org/).

### 7. Files That Must Never Be Committed
Always verify with `git status` that private and generated directories remain untracked:
- `.env` (contains sensitive passwords and local paths)
- `.venv/` (Python virtual environment)
- `frontend/node_modules/` (Node packages)
- `frontend/dist/` (build artifacts)
