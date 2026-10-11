# Validates selected_games.csv.
# Checks total rows, unique games, games per player and duplicate game IDs.
# Used for debugging the initial dataset-selection process.

import pandas as pd

df = pd.read_csv("data/selected_games.csv")

print("Total rows:", len(df))

print("\nUnique game IDs:", df["id"].nunique())

print("\nPlayer game counts:")

# Count games for each player
white_counts = df["white_id"].value_counts()
black_counts = df["black_id"].value_counts()

player_counts = white_counts.add(
    black_counts,
    fill_value=0
)

print(player_counts.sort_values(ascending=False))

print("\nPlayers with fewer than 40 games:")

print(
    player_counts[player_counts < 40]
)

print("\nDuplicate game IDs:")

duplicates = df[
    df["id"].duplicated(keep=False)
]

print(duplicates[["id", "white_id", "black_id"]])