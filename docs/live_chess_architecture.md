# Live chess recommendation service

## Boundary

Live Chess Intelligence consumes one current board position and returns a move
recommendation. It is separate from the offline Player Intelligence pipeline,
which processes completed game histories into performance features, Player DNA,
and matchmaking. The systems may use the same Stockfish executable, but neither
pipeline depends on the other's runtime data.

## Engine service

`Scripts/stockfish_service.py` validates FEN with python-chess, rejects illegal
boards, returns terminal positions without searching, and reuses one UCI process
for active positions. Configure the executable with `STOCKFISH_PATH`, or put
`stockfish` on `PATH`. The default interactive budget is a 200 ms search, a
3 second UCI timeout, one engine thread, and 64 MiB of hash. A lock serializes requests to the single
engine process. The service closes that process during API shutdown.

Evaluations use White's point of view. Centipawn values are returned in pawn
units (`0.42` means +42 cp); mate distances are returned as a separate signed
integer. The service never converts mate to an artificial centipawn score.
Terminal positions return no move and `evaluation_type: "terminal"` with a
termination reason.

## Minimal API

Run from the project root after installing `requirements-live-chess.txt` and
installing Stockfish:

```powershell
$env:STOCKFISH_PATH = 'C:\path\to\stockfish.exe'
python -m uvicorn Scripts.chess_api:app --host 127.0.0.1 --port 8000
```

`POST /api/chess/recommend` accepts `{"fen":"<current position>"}`. A valid,
active position returns the best move in UCI and SAN, evaluation and type,
principal variation in SAN, depth, analysis time, and normalized FEN. Invalid
or illegal positions return HTTP 422; engine startup/search failures return
HTTP 503. The synchronous engine work runs in a worker thread so it does not
block FastAPI's async event loop. The persistent engine lock means requests are
processed one at a time; scale-out needs an explicit engine pool policy.

## Future React behavior

The React chessboard should own the current legal game state and generate FEN
after a completed player move. A user-controlled **Show Recommendation** toggle
should decide whether to call the endpoint. When enabled, send the latest FEN,
ignore stale responses if the board has since changed, and display the returned
move, evaluation, and optional PV. The client can highlight the from/to squares
and offer start-new-game/reset controls. Recommendations remain optional and
must not be forced into every game mode.

## Validation boundary

The unit tests use a deterministic fake UCI engine to validate FEN handling,
response shape, legal-move checks, mate separation, process reuse, and terminal
positions. They do not establish real Stockfish strength or real-process
latency. End-to-end API and timing checks require the FastAPI dependencies and a
Stockfish executable to be installed on the target machine.
