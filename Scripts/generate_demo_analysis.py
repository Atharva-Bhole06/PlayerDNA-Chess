"""Run genuine Stockfish analysis on the demonstration game and save results."""

import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import chess
from backend.services.chess_service import chess_service

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FILE = PROJECT_ROOT / "backend" / "data" / "demo_game_analysis.json"

PGN_MOVES = [
    "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3",
    "Qxf3", "dxe5", "Bc4", "Nf6", "Qb3", "Qe7", "Nc3", "c6",
    "Bg5", "b5", "Nxb5", "cxb5", "Bxb5+", "Nbd7", "O-O-O", "Rd8",
    "Rxd7", "Rxd7", "Rd1", "Qe6", "Bxd7+", "Nxd7", "Qb8+", "Nxb8",
    "Rd8#"
]

MOVE_EXPLANATIONS = {
    1: "Controls the center squares d5 and f5, freeing lines for the light-squared bishop and queen.",
    2: "Symmetrical open-game response matching central pawn presence.",
    3: "Develops the king's knight toward the center, attacking Black's e5 pawn.",
    4: "Philidor's Defense: protects e5 but restricts Black's dark-squared bishop.",
    5: "Central strike contesting the e5 square immediately.",
    6: "Pins the knight to the queen, but surrenders bishop tempo after White's central capture.",
    7: "Opens the d-file; forces Black to either surrender the bishop pair or lose a pawn.",
    8: "Exchanges bishop for knight, surrendering the bishop pair and activating White's queen.",
    9: "Queen recaptures with central dominance, eyeing both b7 and f7.",
    10: "Recaptures pawn maintaining equality of material, but White leads in development.",
    11: "Attacks the vulnerable f7 square in Black's camp, threatening Scholar's Mate motifs.",
    12: "Develops knight to block checkmate threat on f7.",
    13: "Dual-purpose move: creates a double attack against b7 and f7.",
    14: "Protects f7 and defends against the double threat, but pins the queen.",
    15: "Develops queen's knight naturally, preparing kingside queenside pressure.",
    16: "Solidifies Black's queenside pawns and attempts to blunt the white attack.",
    17: "Pins the defending knight on f6, restricting Black's defensive coordination.",
    18: "Overambitious flank thrust attempting to repel the bishop while neglecting king safety.",
    19: "Brilliant tactical sacrifice: White gives up a knight to rip open lines to the black king.",
    20: "Black accepts the sacrifice, opening the b-file and exposing the king.",
    21: "Bishop recaptures with check, pinning the black knight on d7.",
    22: "Knight develops under crossfire to shield the king.",
    23: "Queenside castling activates the rook directly onto the open d-file with lethal pressure.",
    24: "Rook reinforces the pinned knight on d7 against the mounting pressure.",
    25: "Rook sacrifice on d7 removing the first defender of the pinned piece.",
    26: "Rook recaptures, maintaining defensive blockade on d7.",
    27: "Second rook swings over to d1; total domination of the open d-file.",
    28: "Queen attempts to escape the pin and offer a queen trade.",
    29: "Bishop takes rook with check, stripping away Black's remaining defenders.",
    30: "Knight recaptures on d7; Black's pieces are completely paralyzed.",
    31: "Queen sacrifice decoy: forces Black's knight away from defending d8.",
    32: "Knight must capture the queen on b8.",
    33: "Back-rank checkmate: the rook on d8 delivers checkmate, shielded by the bishop on g5."
}

def generate():
    board = chess.Board()
    results = []
    print("Running genuine Stockfish analysis on all 33 plies...")
    for i, san in enumerate(PGN_MOVES):
        move = board.parse_san(san)
        uci = move.uci()
        fen_before = board.fen()
        # Analyze using StockfishService
        analysis = chess_service.analyze_move(fen_before, uci, depth=8)
        board.push(move)

        ply = i + 1
        results.append({
            "ply": ply,
            "move_number": (i // 2) + 1,
            "color": "white" if i % 2 == 0 else "black",
            "played_san": san,
            "played_uci": uci,
            "best_san": analysis["best_move_san"],
            "best_uci": analysis["best_move_uci"],
            "cpl": analysis.get("cpl"),
            "classification": analysis["classification"],
            "fen_before": fen_before,
            "fen_after": board.fen(),
            "best_score_cp": analysis.get("best_score_cp"),
            "played_score_cp": analysis.get("played_score_cp"),
            "best_score_mate": analysis.get("best_score_mate"),
            "played_score_mate": analysis.get("played_score_mate"),
            "depth": analysis.get("depth"),
            "analysis_time_ms": analysis.get("analysis_time_ms"),
            "explanation": MOVE_EXPLANATIONS.get(ply, "Engine tactical evaluation.")
        })
        print(f"[{ply}/{len(PGN_MOVES)}] {san} (Stockfish prefers {analysis['best_move_san']}) -> {analysis['classification']}, cpl: {analysis.get('cpl')}")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Successfully generated and saved {len(results)} analyzed moves to {OUTPUT_FILE}")
    chess_service.close()

if __name__ == "__main__":
    generate()
