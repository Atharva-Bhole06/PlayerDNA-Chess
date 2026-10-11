"""Build the versioned 30-player PlayerDNA cohort from ``data/games.csv``."""

try:  # Supports both ``python Scripts/...py`` and package imports.
    from Scripts.player_dataset import main
except ModuleNotFoundError:
    from player_dataset import main


if __name__ == "__main__":
    main()
