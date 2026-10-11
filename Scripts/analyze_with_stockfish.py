"""Stockfish analysis with separate centipawn and mate handling."""
import os
import shutil
from pathlib import Path

import chess
import chess.engine
import pandas as pd

INPUT_FILE = Path("data/processed_player_games.csv")
OUTPUT_FILE = Path("data/chess_performance_features_v2.csv")
MOVE_AUDIT_FILE = Path("data/stockfish_move_audit_v2.csv")
ERROR_FILE = Path("data/stockfish_analysis_errors_v2.csv")
ENGINE_DEPTH = 10
EXPECTED_PLAYERS = 30
GAMES_PER_PLAYER = 40
EXPECTED_GAMES = EXPECTED_PLAYERS * GAMES_PER_PLAYER


def resolve_stockfish_path():
    configured = os.environ.get("STOCKFISH_PATH")
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_file():
            return str(candidate.resolve())
        raise FileNotFoundError(f"STOCKFISH_PATH is not a file: {candidate}")
    discovered = shutil.which("stockfish")
    if discovered:
        return discovered
    raise FileNotFoundError(
        "Set STOCKFISH_PATH to the engine executable or add stockfish to PATH."
    )


def score_fields(score, pov):
    """Represent scores as centipawns or signed mate distance, never both."""
    relative = score.pov(pov)
    if relative.is_mate():
        return None, relative.mate()
    return relative.score(), None


def mate_event(best_mate, played_mate):
    if best_mate is not None and best_mate > 0:
        if played_mate is None or played_mate < 0:
            return "missed_forced_mate"
    if played_mate is not None and played_mate < 0:
        if best_mate is None or best_mate >= 0:
            return "allowed_forced_mate"
    if best_mate == played_mate:
        return "mate_outcome_preserved"
    return "mate_score_changed"


def analyze_game(row, engine, engine_name):
    board = chess.Board()
    color_name = str(row["player_color"]).strip().lower()
    if color_name not in {"white", "black"}:
        raise ValueError(f"Invalid player_color: {color_name!r}")
    player_color = chess.WHITE if color_name == "white" else chess.BLACK

    cpl_values = []
    move_audit = []
    best_moves = inaccuracies = mistakes = blunders = 0
    mate_counts = {
        "missed_forced_mates": 0,
        "allowed_forced_mates": 0,
        "mate_score_changed": 0,
        "mate_outcome_preserved": 0,
    }
    player_move_number = 0
    ply_number = 0

    for san_move in str(row["moves"]).split():
        if san_move in {"1-0", "0-1", "1/2-1/2", "*"}:
            continue
        move = board.parse_san(san_move)
        if board.turn == player_color:
            player_move_number += 1
            fen_before = board.fen()

            # Compare the engine's unrestricted best score with a search
            # forcing the played move, both from the same root position.
            best_info = engine.analyse(
                board, chess.engine.Limit(depth=ENGINE_DEPTH)
            )
            played_info = engine.analyse(
                board,
                chess.engine.Limit(depth=ENGINE_DEPTH),
                root_moves=[move],
            )
            best_line = best_info.get("pv", [])
            if not best_line:
                raise RuntimeError("Stockfish returned no best-move line")
            best_move = best_line[0]
            best_cp, best_mate = score_fields(best_info["score"], player_color)
            played_cp, played_mate = score_fields(
                played_info["score"], player_color
            )

            cpl = None
            classification = None
            mate_label = None
            if best_mate is None and played_mate is None:
                cpl = max(0, best_cp - played_cp)
                cpl_values.append(cpl)
                if cpl <= 10:
                    best_moves += 1
                    classification = "best_or_near_best"
                elif cpl < 50:
                    inaccuracies += 1
                    classification = "inaccuracy"
                elif cpl < 100:
                    mistakes += 1
                    classification = "mistake"
                else:
                    blunders += 1
                    classification = "blunder"
            else:
                mate_label = mate_event(best_mate, played_mate)
                key = (
                    mate_label + "s"
                    if mate_label in {
                        "missed_forced_mate", "allowed_forced_mate"
                    }
                    else mate_label
                )
                mate_counts[key] += 1

            move_audit.append({
                "player_id": row["player_id"],
                "game_id": row["game_id"],
                "opponent_id": row["opponent_id"],
                "player_color": color_name,
                "player_move_number": player_move_number,
                "ply_number": ply_number + 1,
                "fen_before": fen_before,
                "played_move_san": san_move,
                "played_move_uci": move.uci(),
                "best_move_san": board.san(best_move),
                "best_move_uci": best_move.uci(),
                "best_score_cp": best_cp,
                "best_score_mate": best_mate,
                "played_score_cp": played_cp,
                "played_score_mate": played_mate,
                "cpl": cpl,
                "move_classification": classification,
                "mate_event": mate_label,
                "engine_name": engine_name,
                "engine_depth": ENGINE_DEPTH,
                "evaluation_method": "same_root_best_vs_forced_played_move",
            })
        board.push(move)
        ply_number += 1

    if player_move_number == 0:
        raise ValueError("Game contains no moves by the selected player")

    cp_move_count = len(cpl_values)
    mate_move_count = player_move_number - cp_move_count
    average_cpl = sum(cpl_values) / cp_move_count if cp_move_count else None
    # Project-defined, transparent proxy: percentage of CP-comparable moves
    # with CPL below 50. Mate-evaluation moves are excluded and counted apart.
    accuracy = (
        100 * sum(cpl < 50 for cpl in cpl_values) / cp_move_count
        if cp_move_count else None
    )
    best_move_percentage = (
        100 * best_moves / cp_move_count if cp_move_count else None
    )
    result = {
        "player_id": row["player_id"],
        "game_id": row["game_id"],
        "opponent_id": row["opponent_id"],
        "player_color": color_name,
        "player_rating": row["player_rating"],
        "opponent_rating": row["opponent_rating"],
        "winner": row["winner"],
        "total_player_moves": player_move_number,
        "cp_evaluable_moves": cp_move_count,
        "mate_evaluation_moves": mate_move_count,
        "average_cpl": round(average_cpl, 2) if average_cpl is not None else None,
        "blunders": blunders,
        "mistakes": mistakes,
        "inaccuracies": inaccuracies,
        "best_moves": best_moves,
        "best_move_percentage": (
            round(best_move_percentage, 2)
            if best_move_percentage is not None else None
        ),
        "accuracy": round(accuracy, 2) if accuracy is not None else None,
        "missed_forced_mates": mate_counts["missed_forced_mates"],
        "allowed_forced_mates": mate_counts["allowed_forced_mates"],
        "mate_score_changed": mate_counts["mate_score_changed"],
        "mate_outcome_preserved": mate_counts["mate_outcome_preserved"],
        "engine_name": engine_name,
        "engine_depth": ENGINE_DEPTH,
        "cpl_definition": "max(0, best_cp - forced_played_move_cp); mate excluded",
        "accuracy_definition": (
            "percentage of cp-evaluable moves with CPL < 50; mate excluded"
        ),
    }
    return result, move_audit


def validate_input(df):
    required = {
        "player_id", "game_id", "opponent_id", "player_color",
        "player_rating", "opponent_rating", "winner", "moves",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Processed input is missing columns: {sorted(missing)}")
    if len(df) != EXPECTED_GAMES:
        raise ValueError(f"Expected 1,200 games; found {len(df)}")
    if df["player_id"].nunique() != EXPECTED_PLAYERS:
        raise ValueError(
            f"Expected 30 players; found {df['player_id'].nunique()}"
        )
    counts = df.groupby("player_id")["game_id"].nunique()
    if not (counts == GAMES_PER_PLAYER).all():
        raise ValueError(f"Input does not have 40 games per player: {counts.to_dict()}")
    if df.duplicated(["player_id", "game_id"]).any():
        raise ValueError("Input contains duplicate player-game records")


def main():
    if not INPUT_FILE.is_file():
        raise FileNotFoundError(f"Input file not found: {INPUT_FILE}")
    engine_path = resolve_stockfish_path()
    df = pd.read_csv(INPUT_FILE)
    validate_input(df)
    print(f"Validated {len(df)} records for {df.player_id.nunique()} players.")
    print(f"Starting Stockfish: {engine_path}")

    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    results = []
    move_audit = []
    errors = []
    try:
        engine_name = engine.id.get("name", "Stockfish")
        for index, row in df.iterrows():
            print(f"Analyzing game {index + 1}/{len(df)} ({row['game_id']})")
            try:
                result, moves = analyze_game(row, engine, engine_name)
                results.append(result)
                move_audit.extend(moves)
            except Exception as exc:
                errors.append({
                    "row_index": index,
                    "player_id": row.get("player_id"),
                    "game_id": row.get("game_id"),
                    "error": str(exc),
                })
    finally:
        engine.quit()

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(results).to_csv(OUTPUT_FILE, index=False)
    pd.DataFrame(move_audit).to_csv(MOVE_AUDIT_FILE, index=False)
    if errors:
        pd.DataFrame(errors).to_csv(ERROR_FILE, index=False)
        raise RuntimeError(
            f"Analysis had {len(errors)} failed games; see {ERROR_FILE}"
        )
    if len(results) != EXPECTED_GAMES:
        raise RuntimeError(f"Expected 1,200 output rows; wrote {len(results)}")

    print("\nStockfish analysis complete.")
    print(f"Game-level output: {OUTPUT_FILE} ({len(results)} rows)")
    print(f"Move-level audit: {MOVE_AUDIT_FILE} ({len(move_audit)} moves)")
    print(
        "Mate-evaluation moves:",
        sum(result["mate_evaluation_moves"] for result in results),
    )
    print(f"Engine: {engine_name}; depth: {ENGINE_DEPTH}")


if __name__ == "__main__":
    main()
