"""Run player-profile EDA and write standalone SVG visualizations.

PCA is visualization-only; it does not alter the DNA data or perform
matchmaking.
"""
from html import escape
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "player_profiles.csv"
OUT_DIR = ROOT / "data" / "visualizations"
DNA_FEATURES = [
    "median_cpl", "cpl_std", "inaccuracies_per_100_cp_moves",
]
CORRELATION_FEATURES = [
    "mean_accuracy_pct", "median_accuracy_pct", "median_cpl",
    "mean_cpl_weighted_by_cp_moves", "cpl_std",
    "mean_best_move_percentage", "blunders_per_100_cp_moves",
    "mistakes_per_100_cp_moves", "inaccuracies_per_100_cp_moves",
    "mate_evaluation_rate_pct",
]


def robust_transform(frame, columns):
    values = frame[columns].astype(float)
    median = values.median()
    q1 = values.quantile(0.25)
    q3 = values.quantile(0.75)
    iqr = q3 - q1
    if (iqr == 0).any():
        raise ValueError("A selected feature has zero IQR")
    return (values - median) / iqr


def text(x, y, value, size=13, anchor="start", fill="#263238", rotate=None):
    transform = f' transform="rotate({rotate} {x} {y})"' if rotate is not None else ""
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
        f'fill="{fill}"{transform}>{escape(str(value))}</text>'
    )


def header(width, height, title, subtitle):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        text(30, 38, title, 23, fill="#16324f"),
        text(30, 62, subtitle, 12, fill="#52606d"),
    ]


def save(name, parts):
    parts.append("</svg>")
    (OUT_DIR / name).write_text("\n".join(parts), encoding="utf-8")


def diverging(value, low=-1.0, high=1.0):
    t = float(np.clip((value - low) / (high - low), 0, 1))
    if t < 0.5:
        u, start, end = t * 2, (49, 105, 166), (247, 247, 247)
    else:
        u, start, end = (t - .5) * 2, (247, 247, 247), (178, 24, 43)
    rgb = tuple(round(a + (b - a) * u) for a, b in zip(start, end))
    return "#%02x%02x%02x" % rgb


def draw_distributions(frame):
    width, height = 1180, 900
    parts = header(
        width, height, "Selected Player DNA feature distributions",
        "30 players; raw values; histograms are descriptive",
    )
    colors = ["#2b6cb0", "#2f855a", "#805ad5"]
    for i, feature in enumerate(DNA_FEATURES):
        y0 = 105 + i * 235
        counts, edges = np.histogram(frame[feature].to_numpy(float), bins=8)
        left, right, top, bottom = 210, 1070, y0 + 35, y0 + 180
        max_count = max(int(counts.max()), 1)
        parts.append(text(30, y0 + 20, feature, 16, fill="#16324f"))
        parts.append(
            f'<line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" '
            'stroke="#52606d"/>'
        )
        bar_width = (right - left) / len(counts)
        for j, count in enumerate(counts):
            bar_height = (bottom - top) * count / max_count
            x, y = left + j * bar_width + 2, bottom - bar_height
            parts.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width-4:.1f}" '
                f'height="{bar_height:.1f}" fill="{colors[i]}" opacity="0.86"/>'
            )
            parts.append(text(x + bar_width / 2 - 2, y - 4, count, 10, "middle"))
            if j in (0, 3, 7):
                parts.append(text(
                    x + bar_width / 2, bottom + 17, f"{edges[j]:.1f}",
                    10, "middle", "#52606d",
                ))
        parts.append(text(left, bottom + 35, "Feature value", 11))
        parts.append(text(1130, top + 8, f"n={len(frame)}", 11, "end"))
    save("player_dna_distributions.svg", parts)


def draw_correlation(corr):
    labels, cell = corr.columns.tolist(), 67
    n, left, top = len(corr), 250, 125
    width, height = left + n * cell + 45, top + n * cell + 80
    parts = header(
        width, height, "Candidate performance feature correlations",
        "Pearson correlation across 30 player profiles; descriptive only",
    )
    for i, row_name in enumerate(labels):
        parts.append(text(left - 10, top + i * cell + cell * .62,
                          row_name, 10, "end"))
        parts.append(text(left + i * cell + cell * .48, top - 8,
                          row_name, 9, rotate=-50))
        for j in range(n):
            value = float(corr.iloc[i, j])
            x, y = left + j * cell, top + i * cell
            parts.append(
                f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" '
                f'fill="{diverging(value)}" stroke="#ffffff"/>'
            )
            parts.append(text(
                x + cell / 2, y + cell / 2 + 4, f"{value:.2f}", 11,
                "middle", "#ffffff" if abs(value) > .7 else "#263238",
            ))
    save("player_profile_correlation.svg", parts)


def draw_player_heatmap(frame, scaled):
    order = frame["median_cpl"].sort_values().index
    labels, row_h, col_w = scaled.columns.tolist(), 24, 250
    left, top = 235, 110
    width, height = left + col_w * len(labels) + 40, top + row_h * len(frame) + 65
    parts = header(
        width, height, "Player comparison: robust-scaled DNA features",
        "Sorted by median CPL, lower first; colors clipped to ±2.5 IQR units",
    )
    for j, label in enumerate(labels):
        parts.append(text(left + j * col_w + col_w / 2, top - 12,
                          label, 12, "middle"))
    for row_idx, source_idx in enumerate(order):
        y = top + row_idx * row_h
        parts.append(text(left - 10, y + 16, frame.loc[source_idx, "player_id"],
                          10, "end"))
        for j, label in enumerate(labels):
            value = float(scaled.loc[source_idx, label])
            x = left + j * col_w
            parts.append(
                f'<rect x="{x}" y="{y}" width="{col_w}" height="{row_h}" '
                f'fill="{diverging(value, -2.5, 2.5)}" stroke="#ffffff"/>'
            )
            parts.append(text(
                x + col_w / 2, y + 16, f"{value:.2f}", 10, "middle",
                "#ffffff" if abs(value) > 1.7 else "#263238",
            ))
    save("player_dna_player_comparison.svg", parts)


def draw_pca(frame, scaled):
    values = scaled.to_numpy(float)
    centered = values - values.mean(axis=0)
    u, singular, _ = np.linalg.svd(centered, full_matrices=False)
    coordinates = u[:, :2] * singular[:2]
    variance = singular**2
    explained = variance / variance.sum()
    width, height = 1100, 790
    left, right, top, bottom = 100, 1040, 120, 670
    parts = header(
        width, height, "PCA view of Player DNA features",
        f"Visualization only; PC1 {explained[0]*100:.1f}%, "
        f"PC2 {explained[1]*100:.1f}% variance",
    )
    x_min, x_max = coordinates[:, 0].min(), coordinates[:, 0].max()
    y_min, y_max = coordinates[:, 1].min(), coordinates[:, 1].max()
    x_pad = max((x_max - x_min) * .12, .2)
    y_pad = max((y_max - y_min) * .12, .2)
    x_min, x_max = x_min - x_pad, x_max + x_pad
    y_min, y_max = y_min - y_pad, y_max + y_pad
    parts.extend([
        f'<line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" stroke="#52606d"/>',
        f'<line x1="{left}" y1="{top}" x2="{left}" y2="{bottom}" stroke="#52606d"/>',
        text((left+right)/2, 720, f"PC1 ({explained[0]*100:.1f}%)", 14, "middle"),
        text(25, (top+bottom)/2, f"PC2 ({explained[1]*100:.1f}%)", 14,
             "middle", rotate=-90),
    ])
    for i, (xv, yv) in enumerate(coordinates):
        x = left + (xv - x_min) / (x_max - x_min) * (right - left)
        y = bottom - (yv - y_min) / (y_max - y_min) * (bottom - top)
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="#2b6cb0"/>')
        parts.append(text(x + 7, y - 5, frame.iloc[i]["player_id"], 9))
    save("player_dna_pca.svg", parts)
    return explained


def write_eda_report(profiles, explained):
    summary = profiles.select_dtypes(include=[np.number]).describe().T
    summary = summary[["min", "max", "mean", "50%", "std"]]
    summary.index.name = "feature"
    summary.rename(columns={"50%": "median"}).to_csv(
        ROOT / "data" / "player_profiles_numeric_summary.csv"
    )

    corr = profiles[CORRELATION_FEATURES].corr()
    corr.to_csv(ROOT / "data" / "player_profiles_correlations.csv")
    pairs = []
    for i, first in enumerate(CORRELATION_FEATURES):
        for second in CORRELATION_FEATURES[i+1:]:
            value = corr.loc[first, second]
            if pd.notna(value) and abs(value) >= .85:
                pairs.append((first, second, value))
    pairs.sort(key=lambda item: abs(item[2]), reverse=True)

    result_corr = profiles[
        ["win_rate_pct", "mean_accuracy_pct", "median_cpl",
         "blunders_per_100_cp_moves", "mean_player_rating"]
    ].corr()
    outcome_lines = [
        f"| {feature} | {result_corr.loc['win_rate_pct', feature]:.3f} |"
        for feature in [
            "mean_accuracy_pct", "median_cpl",
            "blunders_per_100_cp_moves", "mean_player_rating",
        ]
    ]
    outlier_lines = []
    for feature in DNA_FEATURES + [
        "mean_accuracy_pct", "mean_best_move_percentage",
        "blunders_per_100_cp_moves", "mate_evaluation_rate_pct",
    ]:
        values = profiles[feature].dropna()
        q1, q3 = values.quantile([.25, .75])
        iqr = q3 - q1
        mask = (profiles[feature] < q1 - 1.5 * iqr) | (
            profiles[feature] > q3 + 1.5 * iqr
        )
        outlier_lines.append(
            f"| {feature} | "
            f"{', '.join(profiles.loc[mask, 'player_id']) if mask.any() else 'None'} |"
        )
    both_colors = profiles[
        profiles["games_as_white"].gt(0) & profiles["games_as_black"].gt(0)
    ]
    white_black_accuracy_gap = (
        both_colors["white_mean_accuracy_pct"]
        - both_colors["black_mean_accuracy_pct"]
    )
    white_black_cpl_gap = (
        both_colors["white_mean_cpl"] - both_colors["black_mean_cpl"]
    )

    report = [
        "# Player profile EDA",
        "",
        f"Input: data/player_profiles.csv ({len(profiles)} players, "
        f"{len(profiles.columns)} columns).",
        "",
        "Every profile represents 40 games. There are no duplicate players or "
        "infinite numerical values. Twelve color-specific fields are undefined "
        "for bleda and ssf7 because each has 40 White games and no Black games.",
        "",
        "## Recommended DNA features",
        "",
        "- median_cpl: robust typical game-level centipawn loss.",
        "- cpl_std: game-to-game variability in game-level CPL.",
        "- inaccuracies_per_100_cp_moves: moderate-error frequency among "
        "centipawn-evaluable moves.",
        "",
        "All three vary across the 30 players. Robust scaling is recommended. "
        "The vector describes measured performance tendencies, not a full "
        "chess style model.",
        "",
        f"PCA visualization explained variance: PC1 {explained[0]*100:.2f}%, "
        f"PC2 {explained[1]*100:.2f}%, PC3 {explained[2]*100:.2f}%; "
        f"first two retain {explained[:2].sum()*100:.2f}%.",
        "",
        "## Highly correlated feature pairs (absolute Pearson r >= 0.85)",
        "",
        "| Feature 1 | Feature 2 | r |",
        "|---|---|---:|",
    ]
    report.extend(
        [f"| {a} | {b} | {value:.3f} |" for a, b, value in pairs]
        or ["| None | None | — |"]
    )
    report.extend([
        "",
        "Notable redundancies: mean and median accuracy correlate at about "
        "0.98; mean accuracy and median CPL at about -0.92; median CPL and "
        "blunders per 100 CP moves at about 0.93; weighted CPL and blunders "
        "per 100 CP moves at about 0.98. Accuracy, all error-class rates, and "
        "multiple CPL summaries should not all receive independent weight.",
        "",
        "## Other EDA findings",
        "",
        "IQR outliers (1.5×IQR rule) among selected and related metrics:",
        "",
        "| Feature | Players flagged |",
        "|---|---|",
        *outlier_lines,
        "",
        "Win-rate relationships (Pearson r across 30 players; descriptive):",
        "",
        "| Feature | r with win_rate_pct |",
        "|---|---:|",
        *outcome_lines,
        "",
        f"White/Black comparison uses {len(both_colors)} players with at least "
        f"one game in both colors. Mean White-minus-Black accuracy difference "
        f"is {white_black_accuracy_gap.mean():.2f} percentage points "
        f"(median {white_black_accuracy_gap.median():.2f}); mean White-minus-"
        f"Black CPL difference is {white_black_cpl_gap.mean():.2f} "
        f"centipawns (median {white_black_cpl_gap.median():.2f}). These are "
        "descriptive only; sample sizes are unequal and include very small "
        "color subsets.",
        "",
        "The profile sample has only 30 players. Correlations are exploratory, "
        "not causal or population-level claims. Accuracy is a project-defined "
        "threshold-rate metric. Phase-specific, positional, tactical-motif, "
        "and opening performance features are unavailable.",
        "",
        "Full numeric summaries are in player_profiles_numeric_summary.csv; "
        "the complete candidate correlation matrix is in "
        "player_profiles_correlations.csv.",
        "",
        "## Visualizations",
        "",
        "- visualizations/player_dna_distributions.svg",
        "- visualizations/player_profile_correlation.svg",
        "- visualizations/player_dna_player_comparison.svg",
        "- visualizations/player_dna_pca.svg",
    ])
    (ROOT / "data" / "player_profiles_eda_report.md").write_text(
        "\n".join(report) + "\n", encoding="utf-8"
    )


def main():
    if not INPUT.is_file():
        raise FileNotFoundError(f"Player profiles not found: {INPUT}")
    profiles = pd.read_csv(INPUT)
    if profiles["player_id"].nunique() != 30 or profiles["player_id"].duplicated().any():
        raise ValueError("EDA expects exactly 30 unique profiles")
    if not (profiles["games_analyzed"] == 40).all():
        raise ValueError("EDA expects 40 games for each player")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scaled = robust_transform(profiles, DNA_FEATURES)
    draw_distributions(profiles)
    draw_correlation(profiles[CORRELATION_FEATURES].corr())
    draw_player_heatmap(profiles, scaled)
    explained = draw_pca(profiles, scaled)
    write_eda_report(profiles, explained)
    print(f"EDA report and SVG visualizations saved under {ROOT / 'data'}")


if __name__ == "__main__":
    main()
