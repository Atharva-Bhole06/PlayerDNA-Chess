import pandas as pd
import chess
import os
from pathlib import Path

try:  # Script invocation adds Scripts/ to sys.path.
    from player_dataset import load_manifest, validate_player_game_records
except ModuleNotFoundError:  # Package import in tests and tools.
    from Scripts.player_dataset import load_manifest, validate_player_game_records


# ============================================================
# 1. FILE PATHS
# ============================================================

INPUT_FILE = "data/player_game_records.csv"
OUTPUT_FILE = "data/processed_player_games.csv"
ERROR_FILE = "data/chess_processing_errors.csv"


# ============================================================
# 2. READ DATASET
# ============================================================

print("Loading dataset...")

df = pd.read_csv(
    INPUT_FILE,
    comment="#"
)

COHORT_MANIFEST = Path(__file__).resolve().parents[1] / "data" / "player_cohort_manifest.json"
cohort = load_manifest(COHORT_MANIFEST)
validate_player_game_records(df, cohort)

print(f"Loaded {len(df)} records.")
print(
    f"Validated ordered cohort: {len(cohort['players'])} players x "
    f"{cohort['games_per_player']} games."
)
print()


# ============================================================
# 3. FUNCTION TO PROCESS ONE GAME
# ============================================================

def process_game(row):

    moves_text = str(row["moves"]).strip()

    player_color = str(row["player_color"]).lower().strip()

    # Convert player color to python-chess color
    if player_color == "white":
        player_is_white = True

    elif player_color == "black":
        player_is_white = False

    else:
        raise ValueError(
            f"Invalid player_color: {player_color}"
        )

    # Create starting chess board
    board = chess.Board()

    # --------------------------------------------------------
    # Counters
    # --------------------------------------------------------

    total_plies = 0

    player_moves = 0
    opponent_moves = 0

    player_captures = 0
    opponent_captures = 0

    player_checks = 0
    opponent_checks = 0

    player_castles = 0
    opponent_castles = 0

    player_pawn_moves = 0
    opponent_pawn_moves = 0

    player_piece_moves = 0
    opponent_piece_moves = 0

    player_promotions = 0
    opponent_promotions = 0

    # --------------------------------------------------------
    # Replay moves
    # --------------------------------------------------------

    moves = moves_text.split()

    for san in moves:

        # Ignore possible result tokens
        if san in ["1-0", "0-1", "1/2-1/2", "*"]:
            continue

        # Whose turn is it before making the move?
        is_player_move = (
            board.turn == chess.WHITE
            and player_is_white
        ) or (
            board.turn == chess.BLACK
            and not player_is_white
        )

        # Parse SAN notation
        move = board.parse_san(san)

        # Piece making the move
        piece = board.piece_at(move.from_square)

        # Basic move information BEFORE pushing
        is_capture = board.is_capture(move)
        is_castling = board.is_castling(move)
        is_promotion = move.promotion is not None

        # Push the move
        board.push(move)

        # Check whether this move gave check
        gave_check = board.is_check()

        total_plies += 1

        # ----------------------------------------------------
        # Player move
        # ----------------------------------------------------

        if is_player_move:

            player_moves += 1

            if is_capture:
                player_captures += 1

            if gave_check:
                player_checks += 1

            if is_castling:
                player_castles += 1

            if is_promotion:
                player_promotions += 1

            if piece and piece.piece_type == chess.PAWN:
                player_pawn_moves += 1
            else:
                player_piece_moves += 1

        # ----------------------------------------------------
        # Opponent move
        # ----------------------------------------------------

        else:

            opponent_moves += 1

            if is_capture:
                opponent_captures += 1

            if gave_check:
                opponent_checks += 1

            if is_castling:
                opponent_castles += 1

            if is_promotion:
                opponent_promotions += 1

            if piece and piece.piece_type == chess.PAWN:
                opponent_pawn_moves += 1
            else:
                opponent_piece_moves += 1

    # ========================================================
    # Return extracted features
    # ========================================================

    return {

        "total_plies_processed": total_plies,

        "player_moves_processed": player_moves,
        "opponent_moves_processed": opponent_moves,

        "player_captures": player_captures,
        "opponent_captures": opponent_captures,

        "player_checks": player_checks,
        "opponent_checks": opponent_checks,

        "player_castles": player_castles,
        "opponent_castles": opponent_castles,

        "player_pawn_moves": player_pawn_moves,
        "opponent_pawn_moves": opponent_pawn_moves,

        "player_piece_moves": player_piece_moves,
        "opponent_piece_moves": opponent_piece_moves,

        "player_promotions": player_promotions,
        "opponent_promotions": opponent_promotions,

        "final_fen": board.fen(),
    }


# ============================================================
# 4. PROCESS ALL GAMES
# ============================================================

print("Processing chess games...")

results = []
errors = []

for index, row in df.iterrows():

    try:

        features = process_game(row)

        # Keep original row
        result = row.to_dict()

        # Add extracted chess features
        result.update(features)

        results.append(result)

    except Exception as e:

        errors.append({
            "row_index": index,
            "game_id": row.get("game_id"),
            "player_id": row.get("player_id"),
            "error": str(e)
        })

    # Progress indicator
    if (index + 1) % 100 == 0:
        print(f"Processed {index + 1}/{len(df)}")


# ============================================================
# 5. SAVE RESULTS
# ============================================================

processed_df = pd.DataFrame(results)

processed_df.to_csv(
    OUTPUT_FILE,
    index=False
)

print()
print("======================================")
print("PROCESSING COMPLETE")
print("======================================")

print(f"Input records:     {len(df)}")
print(f"Successful:        {len(processed_df)}")
print(f"Failed:            {len(errors)}")

print()
print(f"Processed file: {OUTPUT_FILE}")


# ============================================================
# 6. SAVE ERRORS IF ANY
# ============================================================

if errors:

    errors_df = pd.DataFrame(errors)

    errors_df.to_csv(
        ERROR_FILE,
        index=False
    )

    print(f"Error file:     {ERROR_FILE}")

else:

    print("No processing errors!")

print()
print("New features:")
print(processed_df.columns.tolist())
