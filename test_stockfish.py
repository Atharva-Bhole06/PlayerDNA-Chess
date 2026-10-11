"""Manual smoke test: STOCKFISH_PATH=... python test_stockfish.py"""

import chess

from Scripts.stockfish_service import EngineUnavailableError, StockfishService


if __name__ == "__main__":
    service = StockfishService()
    try:
        recommendation = service.analyze(chess.STARTING_FEN)
        print("Stockfish recommendation:")
        for field, value in recommendation.items():
            print(f"{field}: {value}")
    except EngineUnavailableError as exc:
        raise SystemExit(str(exc)) from exc
    finally:
        service.close()
