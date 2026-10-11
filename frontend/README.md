# PlayerDNA AI frontend

React and TypeScript application built with Vite. During development the API
base URL defaults to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` in the
frontend build environment to override it. In production, an unset value uses
the frontend's own origin, so the web server must proxy `/api` to FastAPI.
Alternatively, set the variable to the deployed API origin and configure
backend CORS for the exact frontend origin. See `.env.example` and
`../docs/deployment.md`.

From this directory, run `npm install`, then `npm run dev`. Run `npm test` for
the frontend tests and `npm run build` for the production build.

Run the existing FastAPI application from the repository root alongside Vite:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The backend's default CORS configuration permits `http://localhost:5173` and
`http://localhost:3000`. If Vite uses another origin, add that exact origin to
`PLAYERDNA_CORS_ORIGINS` in the backend environment.
