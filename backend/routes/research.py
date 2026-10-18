"""Research portal and AI experiment endpoints, strictly protected by admin_user."""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import AIExperiment, LivePlayerDNAHistory, PlayerDNAStyleModel
from backend.db.session import get_db
from backend.routes.dependencies import admin_user
from backend.services.ai_experiment_service import (
    STOCKFISH_PRESETS,
    cancel_experiment,
    create_experiment,
    run_experiment_async,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


class CreateExperimentRequest(BaseModel):
    name: str = Field(default="", max_length=100)
    white_preset: str = Field(..., description="Engine preset for White: novice, intermediate, master")
    black_preset: str = Field(..., description="Engine preset for Black: novice, intermediate, master")


class ExperimentResponse(BaseModel):
    id: str
    name: str
    white_preset: str
    black_preset: str
    white_config: dict[str, Any]
    black_config: dict[str, Any]
    games_total: int
    status: str
    white_wins: int
    black_wins: int
    draws: int
    pgn: str
    final_fen: str | None
    termination: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None


class MLStatusResponse(BaseModel):
    status: str
    analyzed_users_count: int
    required_users_count: int
    message: str
    active_model: dict[str, Any] | None


@router.get("/engine-presets")
def get_engine_presets(_admin=Depends(admin_user)):
    """Return Stockfish UCI strength presets. Strictly distinct from ML-trained models."""
    return STOCKFISH_PRESETS


@router.get("/experiments", response_model=list[ExperimentResponse])
def list_experiments(_admin=Depends(admin_user), session: Session = Depends(get_db)):
    """List all AI-vs-AI experiment runs."""
    rows = session.scalars(
        select(AIExperiment).order_by(AIExperiment.created_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "white_preset": r.white_preset,
            "black_preset": r.black_preset,
            "white_config": r.white_config,
            "black_config": r.black_config,
            "games_total": r.games_total,
            "status": r.status,
            "white_wins": r.white_wins,
            "black_wins": r.black_wins,
            "draws": r.draws,
            "pgn": r.pgn,
            "final_fen": r.final_fen,
            "termination": r.termination,
            "error_message": r.error_message,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]


@router.post("/experiments", response_model=ExperimentResponse, status_code=201)
def create_and_run_experiment(
    req: CreateExperimentRequest,
    admin=Depends(admin_user),
    session: Session = Depends(get_db),
):
    """Create and trigger an auditable AI-vs-AI experiment."""
    try:
        exp = create_experiment(
            session=session,
            name=req.name,
            white_preset=req.white_preset,
            black_preset=req.black_preset,
            user_id=admin.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Start the experiment execution in background thread
    run_experiment_async(exp.id)

    return {
        "id": exp.id,
        "name": exp.name,
        "white_preset": exp.white_preset,
        "black_preset": exp.black_preset,
        "white_config": exp.white_config,
        "black_config": exp.black_config,
        "games_total": exp.games_total,
        "status": exp.status,
        "white_wins": exp.white_wins,
        "black_wins": exp.black_wins,
        "draws": exp.draws,
        "pgn": exp.pgn,
        "final_fen": exp.final_fen,
        "termination": exp.termination,
        "error_message": exp.error_message,
        "created_at": exp.created_at.isoformat() if exp.created_at else "",
        "started_at": exp.started_at.isoformat() if exp.started_at else None,
        "completed_at": exp.completed_at.isoformat() if exp.completed_at else None,
    }


@router.get("/experiments/{experiment_id}", response_model=ExperimentResponse)
def get_experiment(
    experiment_id: str,
    _admin=Depends(admin_user),
    session: Session = Depends(get_db),
):
    exp = session.get(AIExperiment, experiment_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {
        "id": exp.id,
        "name": exp.name,
        "white_preset": exp.white_preset,
        "black_preset": exp.black_preset,
        "white_config": exp.white_config,
        "black_config": exp.black_config,
        "games_total": exp.games_total,
        "status": exp.status,
        "white_wins": exp.white_wins,
        "black_wins": exp.black_wins,
        "draws": exp.draws,
        "pgn": exp.pgn,
        "final_fen": exp.final_fen,
        "termination": exp.termination,
        "error_message": exp.error_message,
        "created_at": exp.created_at.isoformat() if exp.created_at else "",
        "started_at": exp.started_at.isoformat() if exp.started_at else None,
        "completed_at": exp.completed_at.isoformat() if exp.completed_at else None,
    }


@router.post("/experiments/{experiment_id}/cancel", response_model=ExperimentResponse)
def cancel_experiment_route(
    experiment_id: str,
    _admin=Depends(admin_user),
    session: Session = Depends(get_db),
):
    try:
        exp = cancel_experiment(session, experiment_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "id": exp.id,
        "name": exp.name,
        "white_preset": exp.white_preset,
        "black_preset": exp.black_preset,
        "white_config": exp.white_config,
        "black_config": exp.black_config,
        "games_total": exp.games_total,
        "status": exp.status,
        "white_wins": exp.white_wins,
        "black_wins": exp.black_wins,
        "draws": exp.draws,
        "pgn": exp.pgn,
        "final_fen": exp.final_fen,
        "termination": exp.termination,
        "error_message": exp.error_message,
        "created_at": exp.created_at.isoformat() if exp.created_at else "",
        "started_at": exp.started_at.isoformat() if exp.started_at else None,
        "completed_at": exp.completed_at.isoformat() if exp.completed_at else None,
    }


@router.get("/ml/status", response_model=MLStatusResponse)
def get_ml_status(_admin=Depends(admin_user), session: Session = Depends(get_db)):
    """Inspect Player DNA K-Means style clustering readiness and training status."""
    # Count distinct registered users with games_analyzed >= 3 and feature_version == 'live_dna_raw_v1'
    rows = session.scalars(
        select(LivePlayerDNAHistory).where(
            LivePlayerDNAHistory.feature_version == "live_dna_raw_v1",
            LivePlayerDNAHistory.games_analyzed >= 3,
        )
    ).all()
    user_ids = {r.user_id for r in rows}
    count = len(user_ids)
    required = 10

    active_model_row = session.scalar(
        select(PlayerDNAStyleModel).order_by(PlayerDNAStyleModel.trained_at.desc()).limit(1)
    )
    active_model = None
    if active_model_row is not None:
        active_model = {
            "version": active_model_row.version,
            "model_type": active_model_row.model_type,
            "purpose": active_model_row.purpose,
            "training_rows": active_model_row.training_rows,
            "metrics": active_model_row.metrics,
            "trained_at": active_model_row.trained_at.isoformat() if active_model_row.trained_at else None,
        }

    if count < required:
        status = "insufficient_data"
        message = (
            f"Unsupervised K-Means clustering requires at least {required} registered players with "
            f"three analyzed games. Found {count} player(s). Historical cohort data is strictly excluded from live model training."
        )
    else:
        status = "ready"
        message = (
            f"Live user criteria met ({count} eligible players). Model can be trained or re-evaluated via "
            "python -m Scripts.train_player_style_model."
        )

    return {
        "status": status,
        "analyzed_users_count": count,
        "required_users_count": required,
        "message": message,
        "active_model": active_model,
    }
