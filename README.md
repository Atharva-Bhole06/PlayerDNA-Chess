# PlayerDNA — Chess Behavioral Style Intelligence Platform

PlayerDNA is an end-to-end chess platform that combines competitive gameplay with behavioral style intelligence, Stockfish move evaluation, and data-driven post-game coaching.

Beyond standard chess features, PlayerDNA characterizes player behavior through a 3D **Player DNA** vector (median centipawn loss, CPL standard deviation, and inaccuracies per 100 evaluable plies) to analyze play patterns, perform cohort matching, and deliver learner-friendly performance analytics.

---

## 1. Project Overview & Features

- **Interactive Play Arena (`/play`)**:
  - Play against AI bots powered by Stockfish with selectable engine search depths.
  - Local Pass & Play mode.
  - Real-time multiplayer matchmaking with registered accounts and Elo rating progression.
  - Guest mode for instant casual games.
- **Game History & Analysis Workspace (`/history`, `/games/:id/report`)**:
  - Match history displaying outcomes, ratings, and finished timestamps.
  - Dedicated analysis workspace featuring an interactive evaluation chessboard.
  - Move-by-move Stockfish centipawn loss (CPL) auditing and classification (best move, inaccuracy, mistake, blunder, forced mate).
  - Accuracy scores, star ratings, performance summaries, and plain-English AI Coach explanations.
- **Asynchronous Analysis Worker (`backend.analysis_worker`)**:
  - Background daemon that processes queued game analysis jobs asynchronously without blocking live gameplay.
- **Admin Research Portal (`/research`)**:
  - Analysis of the 30-player historical cohort (1,200 games, 39,097 audited moves).
  - 3D Player DNA behavioral space and feature distribution metrics.
  - K-Nearest Neighbors (KNN) and cosine similarity style matchmaking.
  - Machine learning model status and retraining workflows.
- **Authentication & User Management**:
  - Secure, HTTP-only cookie-based authentication.
  - Player profiles with win/draw/loss records and rating histories.
  - Operator CLI for promoting users to administrators for research access.

---

## 2. Prerequisites for Windows

Ensure the following tools are installed on your Windows PC before proceeding:

| Tool | Required Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Git** | Latest (2.x+) | `git --version` | Required for cloning the repository |
| **Python** | **3.12** (64-bit) | `python --version` | Ensure `Add python.exe to PATH` is checked during installation |
| **Node.js & npm** | **>= 20.19.0** (npm >= 10.x) | `node -v` / `npm -v` | Required to build and run the React/Vite frontend |
| **Docker Desktop** | Latest (with WSL 2) | `docker --version` | Required to run the PostgreSQL database container |
| **Stockfish** *(Optional)* | Stockfish 16 or 17 | `stockfish` *(if on PATH)* | Required for AI bot moves, live recommendations, and report analysis |

> **PowerShell Script Execution Policy:**
> Windows PowerShell restricts script execution by default. If activating Python virtual environments gives an execution policy error, run this command once in PowerShell:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 3. Clone Instructions

Open **PowerShell** and clone the repository using the official GitHub repository URL:

```powershell
git clone https://github.com/Atharva-Bhole06/PlayerDNA-Chess.git
cd PlayerDNA-Chess
```

---

## 4. Python Virtual Environment & Dependencies

From the repository root (`PlayerDNA-Chess`), create and activate a Python 3.12 virtual environment:

```powershell
# Create virtual environment named .venv
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip to the latest version
python -m pip install --upgrade pip
```

### Install All Required Backend Dependencies
Install all packages needed for the FastAPI backend, PostgreSQL database, Alembic migrations, scikit-learn ML models, and the test suite:

```powershell
pip install -r requirements-database.txt -r requirements-ml.txt -r requirements-api-test.txt
```

#### How the Requirements Files Work:
- `requirements-live-chess.txt`: Base live chess engine (`python-chess >= 1.999`), web API (`fastapi >= 0.115`), and ASGI server (`uvicorn[standard] >= 0.30`).
- `requirements-backend.txt`: References `requirements-live-chess.txt` and adds data libraries (`pandas >= 2.2`, `numpy >= 2.0`, `pydantic >= 2.8`, `SQLAlchemy >= 2.0`).
- `requirements-database.txt`: References `requirements-backend.txt` and adds PostgreSQL driver (`psycopg[binary] >= 3.2`) and migrations (`alembic >= 1.13`).
- `requirements-ml.txt`: References `requirements-live-chess.txt` and adds machine learning libraries (`scikit-learn >= 1.5`, `joblib >= 1.4`).
- `requirements-api-test.txt`: References `requirements-backend.txt` and adds HTTP test client (`httpx >= 0.27`).

---

## 5. Configure Environment Variables (`.env`)

Copy the sample environment file `.env.example` to create your local `.env`:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your text editor (such as VS Code or Notepad) and configure your local settings:

```ini
# Database Connection
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=playerdna
DB_USER=playerdna_app
DB_PASSWORD=choose_a_local_password_here

# Exact Allowed Frontend Origins (comma-separated; wildcards are disabled)
PLAYERDNA_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000

# Game Timer Defaults (seconds)
PLAYERDNA_GAME_TIME_SECONDS=300
PLAYERDNA_GAME_INCREMENT_SECONDS=0

# Set false for local HTTP development; set true only if serving over HTTPS
PLAYERDNA_COOKIE_SECURE=false

# Optional: Path to Stockfish executable if not added to system PATH
# STOCKFISH_PATH=C:\Tools\stockfish\stockfish-windows-x86-64-avx2.exe
```

> **Security Reminder:**
> Never commit `.env` or real passwords to version control. The repository's `.gitignore` automatically excludes `.env`, `.venv/`, and `node_modules/`.

---

## 6. Start PostgreSQL Using Docker Compose

Make sure **Docker Desktop** is running, then launch the PostgreSQL 16 service in the background:

```powershell
docker compose up -d postgres
```

Verify that the container is running and healthy:

```powershell
docker compose ps
```

The container healthcheck automatically verifies connectivity using `pg_isready`.

To stop PostgreSQL when finished working:
```powershell
docker compose down
```

---

## 7. Apply Database Migrations & Seed Data

### Step 7.1 — Apply Database Migrations
Run Alembic from the repository root to create all required database tables and relationships:

```powershell
alembic upgrade head
```

### Step 7.2 — Import Historical Cohort Data *(For Research Portal)*
The repository includes a validated 30-player historical research dataset located in `data/` (`processed_player_games.csv`, `chess_performance_features_v2.csv`, `stockfish_move_audit_v2.csv`, `player_profiles.csv`, `player_dna.csv`, and `player_dna_scaler_parameters.csv`).

To populate the Research Portal (`/research`, `/research/player-dna`, `/matchmaking`) with this benchmark data, run:

```powershell
# Import the 30-player historical cohort into PostgreSQL
python -m backend.db.import_csv

# Verify table counts, foreign keys, and fields against the source CSV files
python -m backend.db.import_csv --verify
```

*(Note: Live games, matchmaking, and player registration function without this step, but the Research Portal cohort metrics require this data).*

### Step 7.3 — Grant Admin Privileges *(Optional)*
The Research Portal is restricted to administrator accounts. After registering an account on the website (e.g. `admin_user`), promote it via the operator CLI:

```powershell
# Promote a registered username to admin
python -m backend.manage_admin promote admin_user

# View all registered users and their admin statuses
python -m backend.manage_admin list
```

---

## 8. Run the Application

Run the backend and frontend in **two separate PowerShell terminals**.

### Terminal 1 — FastAPI Backend
From the repository root (`PlayerDNA-Chess`):

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Start the FastAPI server with auto-reload
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

- **Backend API**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/api/health`

### Terminal 2 — React / Vite Frontend
From a new PowerShell terminal, navigate to the `frontend` folder:

```powershell
cd path\to\PlayerDNA-Chess\frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
```

- **Web Application**: `http://localhost:5173`

---

## 9. When are Stockfish & the Analysis Worker Needed?

### 9.1 Stockfish Engine
- **When is Stockfish needed?**
  1. Playing against the AI bot at specific engine search depths.
  2. Live engine move suggestions / recommendations during play.
  3. Generating post-game move-by-move evaluation audits and centipawn loss (CPL).
- **Is Stockfish required to run the project?**
  - No. You can start the app, register accounts, play Pass & Play, and play multiplayer games without Stockfish installed.
- **How to configure Stockfish:**
  1. Download the Windows binary from [stockfishchess.org](https://stockfishchess.org/download/).
  2. Either add the executable directory to your Windows `PATH` environment variable, or set `STOCKFISH_PATH` in `.env`:
     ```ini
     STOCKFISH_PATH=C:\path\to\stockfish.exe
     ```
  3. Smoke test the engine integration:
     ```powershell
     python test_stockfish.py
     ```

### 9.2 Background Analysis Worker
- **What does it do?**
  When a rated game finishes, the system creates a background job in `game_analysis_jobs` to audit every move with Stockfish, determine blunder/mistake classifications, calculate accuracy, and produce coaching advice.
- **How to run the worker:**
  Open a separate PowerShell terminal with `.venv` activated:
  ```powershell
  # Run worker continuously to process finished games as they arrive
  python -m backend.analysis_worker

  # Or process a single queued game and exit
  python -m backend.analysis_worker --once

  # Or retry any previously failed analysis jobs
  python -m backend.analysis_worker --retry-failed
  ```

---

## 10. Running the Test Suite

### 10.1 Backend Tests
Run the comprehensive backend test suite (database models, auth, live games, Stockfish service, and game report API) from the repository root:

```powershell
# Run all backend unit and integration tests
python -m unittest discover -s tests -p "test_*.py"
```

To run a specific test module with verbose output:
```powershell
python -m unittest tests/test_backend_api.py -v
python -m unittest tests/test_game_report_api.py -v
python -m unittest tests/test_stockfish_service.py -v
```

### 10.2 Frontend Tests & Production Build
Run the frontend component tests and production build checks:

```powershell
cd path\to\PlayerDNA-Chess\frontend

# Run Vitest test suite
npm test

# Verify TypeScript compilation and Vite production build
npm run build
```

---

## 11. Troubleshooting Common Issues

### 1. Database Connection Refused (`DatabaseUnavailableError`)
- **Symptoms**: Backend displays `503 Database is unavailable` or `connection to server at "127.0.0.1", port 5432 failed`.
- **Fix**:
  - Verify that Docker Desktop is running.
  - Check container status: `docker compose ps`.
  - View database logs: `docker compose logs postgres`.
  - Ensure `.env` exists in the repository root and has matching `DB_PORT`, `DB_USER`, `DB_NAME`, and `DB_PASSWORD`.

### 2. Port 5432 Already in Use
- **Symptoms**: Docker error `bind: address already in use` when running `docker compose up -d postgres`.
- **Cause**: A local instance of PostgreSQL is already running as a Windows service.
- **Fix**:
  - Stop the local Windows service in PowerShell: `Stop-Service postgresql*`, **OR**
  - Change the port in `.env` (e.g., `DB_PORT=5433`), update `compose.yaml` port mapping accordingly, and restart Docker Compose.

### 3. Browser CORS Policy Block (`No 'Access-Control-Allow-Origin' header`)
- **Symptoms**: Frontend fails to fetch data from `http://127.0.0.1:8000`.
- **Cause**: The browser origin is not included in the backend allowlist.
- **Fix**: Check `PLAYERDNA_CORS_ORIGINS` in `.env`. Ensure it includes the exact browser origin (e.g. `http://localhost:5173` and `http://127.0.0.1:5173`) with no trailing slashes or wildcards.

### 4. Stockfish Engine Not Found
- **Symptoms**: Health check `http://127.0.0.1:8000/api/health` returns `"stockfish_available": false` or running `python test_stockfish.py` outputs `Stockfish was not found`.
- **Fix**: Download Stockfish from [stockfishchess.org](https://stockfishchess.org/). Extract the `.exe` file and either place it on your system `PATH` or set `STOCKFISH_PATH` in `.env`.

### 5. Node Engine Version Warning
- **Symptoms**: Warnings during `npm install` about unsupported Node engine version.
- **Fix**: Ensure your installed Node.js version is `>= 20.19.0` by running `node -v`. Download the latest LTS release from [nodejs.org](https://nodejs.org/) if needed.

### 6. Untracked Files and Git Hygiene
Always run `git status` to ensure private credentials and runtime directories remain untracked:
- `.env` (contains local database password)
- `.venv/` (Python virtual environment)
- `frontend/node_modules/` (Node dependencies)
- `frontend/dist/` (compiled frontend assets)
