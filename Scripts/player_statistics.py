'''# Calculates how many games each player has in games.csv.
# Used to find players with enough games for PlayerDNA analysis.
# '''
import pandas as pd

df = pd.read_csv("data/games.csv")

white_counts = df["white_id"].value_counts()
black_counts = df["black_id"].value_counts()

player_counts = white_counts.add(
    black_counts,
    fill_value=0
)

print("Total games:", len(df))
print("Unique players:", len(player_counts))

print("\nPlayers with at least:")
print("100 games:", (player_counts >= 100).sum())
print("75 games:", (player_counts >= 75).sum())
print("50 games:", (player_counts >= 50).sum())
print("40 games:", (player_counts >= 40).sum())
print("30 games:", (player_counts >= 30).sum())