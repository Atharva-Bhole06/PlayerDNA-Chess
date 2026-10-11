"""Train and evaluate K-Means on valid, analyzed live-player DNA snapshots.

Requires ``python -m pip install -r requirements-ml.txt``. Historical Kaggle
players and games are excluded; a model is not produced until 10 live users
each have at least three analyzed games.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import PROJECT_ROOT
from backend.db.models import LivePlayerDNAHistory, PlayerDNAStyleModel
from backend.db.session import DatabaseUnavailableError, get_engine
from backend.services.player_style_model import FEATURES


MIN_USERS = 10
FEATURE_VERSION = "live_dna_raw_v1"
MODEL_DIRECTORY = PROJECT_ROOT / "artifacts" / "models"


def _latest_rows(session: Session) -> list[LivePlayerDNAHistory]:
    rows = session.scalars(select(LivePlayerDNAHistory).order_by(
        LivePlayerDNAHistory.user_id, LivePlayerDNAHistory.snapshot_at.desc(), LivePlayerDNAHistory.game_id,
    )).all()
    latest = {}
    for row in rows:
        if row.feature_version == FEATURE_VERSION and row.games_analyzed >= 3:
            latest.setdefault(row.user_id, row)
    return [latest[key] for key in sorted(latest)]


def train() -> dict:
    try:
        import numpy as np
        from joblib import dump
        from sklearn.cluster import KMeans
        from sklearn.impute import SimpleImputer
        from sklearn.metrics import silhouette_score
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise RuntimeError("Install ML dependencies with: python -m pip install -r requirements-ml.txt") from exc

    with Session(get_engine()) as session:
        rows = _latest_rows(session)
        if len(rows) < MIN_USERS:
            raise RuntimeError(f"Need at least {MIN_USERS} registered users with three analyzed games; found {len(rows)}")
        matrix = [[float(getattr(row, feature)) for feature in FEATURES] for row in rows]
        fingerprint = hashlib.sha256(json.dumps(
            [[row.user_id, *values] for row, values in zip(rows, matrix)], separators=(",", ":"),
        ).encode()).hexdigest()
        upper_k = min(5, len(rows) - 1)
        scores = {}
        candidates = {}
        for k in range(2, upper_k + 1):
            pipeline = make_pipeline(
                SimpleImputer(strategy="median"), StandardScaler(),
                KMeans(n_clusters=k, random_state=42, n_init=20),
            )
            labels = pipeline.fit_predict(matrix)
            if len(set(labels)) < 2:
                continue
            transformed = pipeline[:-1].transform(matrix)
            score = float(silhouette_score(transformed, labels, metric="euclidean"))
            scores[str(k)] = score
            candidates[k] = pipeline
        if not candidates:
            raise RuntimeError("Clustering produced fewer than two distinct style groups")
        selected_k = max(candidates, key=lambda k: (scores[str(k)], -k))
        pipeline = candidates[selected_k]
        rng = np.random.default_rng(42)
        bootstrap_scores = []
        for _ in range(100):
            indices = rng.integers(0, len(matrix), len(matrix))
            sample = [matrix[index] for index in indices]
            if len({tuple(row) for row in sample}) <= selected_k:
                continue
            bootstrap = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                                      KMeans(n_clusters=selected_k, random_state=42, n_init=20))
            labels = bootstrap.fit_predict(sample)
            if len(set(labels)) < 2 or len(set(labels)) >= len(sample):
                continue
            transformed = bootstrap[:-1].transform(sample)
            bootstrap_scores.append(float(silhouette_score(transformed, labels, metric="euclidean")))
        version = "player_style_kmeans_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
        artifact = MODEL_DIRECTORY / f"{version}.joblib"
        artifact.resolve().relative_to(MODEL_DIRECTORY.resolve())
        dump({"version": version, "features": FEATURES, "pipeline": pipeline}, artifact)
        metrics = {
            "selected_k": selected_k,
            "silhouette_by_k": scores,
            "baseline_k2_silhouette": scores.get("2"),
            "selected_silhouette": scores[str(selected_k)],
            "bootstrap_silhouette": {
                "valid_replicates": len(bootstrap_scores),
                "mean": sum(bootstrap_scores) / len(bootstrap_scores) if bootstrap_scores else None,
                "std": float(np.std(bootstrap_scores)) if bootstrap_scores else None,
                "percentile_95_interval": [float(np.percentile(bootstrap_scores, 2.5)),
                                           float(np.percentile(bootstrap_scores, 97.5))] if bootstrap_scores else None,
            },
            "evaluation": "in-sample unsupervised silhouette with bootstrap uncertainty; not a predictive accuracy metric",
            "seed": 42,
        }
        session.add(PlayerDNAStyleModel(
            version=version, model_type="kmeans_player_style", purpose="Group registered players by measured move-quality DNA",
            feature_version=FEATURE_VERSION, training_rows=len(rows), data_fingerprint=fingerprint,
            metrics=metrics, artifact_path=str(artifact.relative_to(PROJECT_ROOT)),
        ))
        session.commit()
        return {"version": version, "training_rows": len(rows), "metrics": metrics,
                "artifact": str(artifact.relative_to(PROJECT_ROOT))}


def main():
    try:
        print(json.dumps(train(), indent=2))
    except (DatabaseUnavailableError, RuntimeError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
