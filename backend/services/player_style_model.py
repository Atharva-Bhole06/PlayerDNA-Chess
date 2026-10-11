"""Optional, versioned Player DNA clustering inference with a safe fallback."""

import logging
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import PROJECT_ROOT
from backend.db.models import LivePlayerDNAHistory, PlayerDNAStyleModel


logger = logging.getLogger(__name__)
FEATURES = ("median_cpl", "cpl_std", "inaccuracies_per_100_cp_moves")
MODEL_DIRECTORY = (PROJECT_ROOT / "artifacts" / "models").resolve()


@lru_cache(maxsize=8)
def _load_artifact(path: str, version: str, mtime_ns: int):
    import joblib
    payload = joblib.load(path)
    if payload.get("version") != version or tuple(payload.get("features", ())) != FEATURES:
        raise ValueError("Model artifact metadata is inconsistent")
    return payload


def predict_player_style(session: Session, user_id: str) -> dict | None:
    model = session.scalar(select(PlayerDNAStyleModel).order_by(PlayerDNAStyleModel.trained_at.desc()).limit(1))
    dna = session.scalar(select(LivePlayerDNAHistory).where(LivePlayerDNAHistory.user_id == user_id)
                         .order_by(LivePlayerDNAHistory.snapshot_at.desc()).limit(1))
    if model is None or dna is None or dna.games_analyzed < 3:
        return None
    try:
        path = (PROJECT_ROOT / model.artifact_path).resolve()
        if not path.is_relative_to(MODEL_DIRECTORY) or not path.is_file():
            return None
        payload = _load_artifact(str(path), model.version, path.stat().st_mtime_ns)
        cluster = int(payload["pipeline"].predict([[getattr(dna, name) for name in FEATURES]])[0])
        return {"cluster": cluster, "model_version": model.version}
    except Exception:
        logger.warning("Player style model is unavailable; using no cluster label", exc_info=True)
        return None
