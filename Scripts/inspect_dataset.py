'''We created this to look at the dataset before doing anything with it.
and tells us:

Number of games
Number of columns
Column names
First few rows
Missing values
'''


import pandas as pd

# Load dataset
df = pd.read_csv("data/games.csv")

print("========== DATASET INFORMATION ==========")

print("Number of games:", len(df))
print("Number of columns:", len(df.columns))

print("\nColumns:")
for column in df.columns:
    print("-", column)

print("\nFirst 5 rows:")
print(df.head())

print("\nMissing values:")
print(df.isnull().sum())