# Verifies player_game_records.csv.
# Checks total records, unique players, unique games and games per player.
# Ensures the dataset contains 30 players with 40 games each.
import pandas as pd

df = pd.read_csv("data/player_game_records.csv")

print("========== PLAYER DATASET VERIFICATION ==========")

print("\nTotal player-game records:", len(df))

print("\nNumber of unique players:", df["player_id"].nunique())

print("\nNumber of unique games:", df["game_id"].nunique())

print("\nGames per player:")

games_per_player = (
    df.groupby("player_id")["game_id"]
    .nunique()
    .sort_values()
)

print(games_per_player)

print("\nPlayers with exactly 40 games:")
print((games_per_player == 40).sum())

print("\nPlayers with fewer than 40 games:")
print((games_per_player < 40).sum())

print("\nFirst 5 records:")
print(df.head())