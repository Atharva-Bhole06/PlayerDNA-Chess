"""Demonstration mode API for college presentation.

Provides self-contained, pre-analyzed genuine Stockfish game reports,
actual stored Elo calculations from PostgreSQL, and PlayerDNA model status.
"""

import json
import math
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import PROJECT_ROOT
from backend.db.models import (
    CompetitiveRatingHistory,
    LiveGame,
    LivePlayerDNAHistory,
    PlayerDNAStyleModel,
    UserAccount,
)
from backend.db.session import get_db
from backend.routes.dependencies import optional_current_user
from backend.schemas.demo import (
    DemoActualRatedGame,
    DemoGameSummary,
    DemoImportantMoment,
    DemoModelStatus,
    DemoMoveAnalysis,
    DemoOverviewResponse,
    DemoPlayerProfile,
)

router = APIRouter(prefix="/demo", tags=["demonstration mode"])

DEMO_ANALYSIS_FILE = PROJECT_ROOT / "backend" / "data" / "demo_game_analysis.json"

PGN_SAMPLE = """[Event "College Project Demonstration - Opera Game"]
[Site "Paris, France"]
[Date "1858.??.??"]
[Round "?"]
[White "Paul Morphy (Prepared Demo)"]
[Black "Duke of Brunswick & Count Isouard (Prepared Demo)"]
[Result "1-0"]
[Termination "Checkmate"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7
12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8
17. Rd8# 1-0"""

IMPORTANT_MOMENTS: list[dict[str, Any]] = [
    {
        "ply": 1,
        "title": "Opening Move",
        "category": "opening",
        "description": "White claims immediate central control with 1. e4, freeing diagonal lines for queen and light-squared bishop.",
        "move_san": "e4",
        "best_san": "e4",
    },
    {
        "ply": 4,
        "title": "Minor Inaccuracy",
        "category": "inaccuracy",
        "description": "Philidor's Defense (2... d6). While solid, it locks in the dark-squared bishop and concedes a slight central initiative to White.",
        "move_san": "d6",
        "best_san": "Nc6",
    },
    {
        "ply": 6,
        "title": "Tactical Mistake",
        "category": "mistake",
        "description": "3... Bg4 prematurely pins the knight. White can immediately strike at e5, forcing Black to either surrender the bishop or fall behind in tempo.",
        "move_san": "Bg4",
        "best_san": "exd4",
    },
    {
        "ply": 18,
        "title": "Strategic Overextension",
        "category": "mistake",
        "description": "9... b5 attempts to kick the bishop, but compromises the queen's protection and leaves the black king stranded in the center.",
        "move_san": "b5",
        "best_san": "Qc7",
    },
    {
        "ply": 19,
        "title": "Brilliant Piece Sacrifice",
        "category": "critical",
        "description": "10. Nxb5! White sacrifices a knight to shatter Black's pawn shield and open attacking avenues directly toward the uncastled king.",
        "move_san": "Nxb5",
        "best_san": "Nxb5",
    },
    {
        "ply": 22,
        "title": "Defensive Inaccuracy",
        "category": "better_move",
        "description": "11... Nbd7 blocks the check but enters a devastating pin. Stockfish identifies 11... Kd8 as a more resilient alternative.",
        "move_san": "Nbd7",
        "best_san": "Kd8",
    },
    {
        "ply": 31,
        "title": "Queen Decoy Sacrifice",
        "category": "tactic",
        "description": "16. Qb8+!! Classic queen sacrifice. Black is forced to capture with 16... Nxb8, deflecting the knight from defending the critical d8 square.",
        "move_san": "Qb8+",
        "best_san": "Qb8+",
    },
    {
        "ply": 33,
        "title": "Final Checkmate",
        "category": "checkmate",
        "description": "17. Rd8# Back-rank checkmate delivered by the rook, protected by the bishop on g5. A masterpiece in piece coordination.",
        "move_san": "Rd8#",
        "best_san": "Rd8#",
    },
]


def _load_sample_game() -> DemoGameSummary:
    with open(DEMO_ANALYSIS_FILE, "r", encoding="utf-8") as f:
        raw_moves = json.load(f)

    moves = [DemoMoveAnalysis(**m) for m in raw_moves]

    # Calculate genuine metrics using application standards
    cp_moves = [m.cpl for m in moves if m.cpl is not None]
    average_cpl = sum(cp_moves) / len(cp_moves) if cp_moves else 0.0
    accuracy_pct = 100.0 * math.exp(-average_cpl / 100.0)

    blunders = sum(1 for m in moves if m.classification == "blunder")
    mistakes = sum(1 for m in moves if m.classification == "mistake")
    inaccuracies = sum(1 for m in moves if m.classification == "inaccuracy")
    best_agreements = sum(1 for m in moves if m.played_san == m.best_san)
    agreement_pct = (100.0 * best_agreements / len(moves)) if moves else 0.0

    if accuracy_pct >= 90 and blunders == 0:
        stars = 5
        star_reason = f"5 Stars: Estimated accuracy {accuracy_pct:.1f}% with high move agreement."
    elif accuracy_pct >= 75 and blunders <= 1:
        stars = 4
        star_reason = f"4 Stars: Estimated accuracy {accuracy_pct:.1f}% with solid tactical play."
    else:
        stars = 3
        star_reason = f"3 Stars: Estimated accuracy {accuracy_pct:.1f}% with key instructional mistakes."

    recommendations = [
        "White demonstrated ideal development and rapid kingside castling to dominate open lines.",
        "Black neglected king safety in the opening; avoid flank pawn pushes like 9... b5 when king is uncastled.",
        "Stockfish highlights that 11... Kd8 was tougher defense than stepping into the triple pin on d7.",
        "Engine tactical evaluations depend on depth limits and should be treated as guidance, not ground truth.",
    ]

    return DemoGameSummary(
        game_id="demo-opera-game-1858",
        white_player="Paul Morphy (Prepared Demo)",
        white_rating=1200,
        black_player="Duke of Brunswick & Count Isouard (Prepared Demo)",
        black_rating=1200,
        result="1-0",
        termination="Checkmate",
        pgn=PGN_SAMPLE,
        moves=moves,
        important_moments=[DemoImportantMoment(**item) for item in IMPORTANT_MOMENTS],
        moves_analyzed=len(moves),
        average_cpl=round(average_cpl, 1),
        accuracy_pct=round(accuracy_pct, 1),
        stars=stars,
        star_reason=star_reason,
        best_move_agreement_pct=round(agreement_pct, 1),
        blunders=blunders,
        mistakes=mistakes,
        inaccuracies=inaccuracies,
        recommendations=recommendations,
    )


def _get_actual_rated_game(session: Session) -> DemoActualRatedGame | None:
    # Query for the latest completed competitive game that recorded rating changes
    history_row = (
        session.scalars(
            select(CompetitiveRatingHistory)
            .order_by(CompetitiveRatingHistory.created_at.desc())
            .limit(1)
        )
        .first()
    )

    if not history_row:
        return None

    game = session.get(LiveGame, history_row.game_id)
    if not game:
        return None

    white_user = session.get(UserAccount, game.white_user_id)
    black_user = session.get(UserAccount, game.black_user_id)
    if not white_user or not black_user:
        return None

    white_hist = session.get(CompetitiveRatingHistory, (white_user.id, game.id))
    black_hist = session.get(CompetitiveRatingHistory, (black_user.id, game.id))

    white_before = white_hist.rating_before if white_hist else game.white_rating_at_start
    white_after = white_hist.rating_after if white_hist else white_user.rating
    black_before = black_hist.rating_before if black_hist else game.black_rating_at_start
    black_after = black_hist.rating_after if black_hist else black_user.rating

    expected_white = 1.0 / (1.0 + 10.0 ** ((black_before - white_before) / 400.0))
    expected_black = 1.0 - expected_white

    return DemoActualRatedGame(
        game_id=game.id,
        white_username=white_user.username,
        white_rating_before=white_before,
        white_rating_after=white_after,
        white_rating_delta=white_after - white_before,
        black_username=black_user.username,
        black_rating_before=black_before,
        black_rating_after=black_after,
        black_rating_delta=black_after - black_before,
        result=game.result or "1-0",
        termination=game.termination or "resignation",
        k_factor=32,
        expected_score_white=round(expected_white, 4),
        expected_score_black=round(expected_black, 4),
        finished_at=game.finished_at or game.created_at,
        has_actual_data=True,
    )


def _get_player_profile(session: Session, user: UserAccount | None) -> DemoPlayerProfile:
    target_user = user
    if target_user is None:
        # Pick an existing registered player with games if possible, else JourneyPlayer1
        target_user = session.scalars(
            select(UserAccount)
            .where(UserAccount.games_played > 0)
            .order_by(UserAccount.games_played.desc())
            .limit(1)
        ).first()

    if target_user is None:
        target_user = session.scalars(select(UserAccount).limit(1)).first()

    username = target_user.username if target_user else "DemoPresenter"
    current_rating = target_user.rating if target_user else 1200
    games_played = target_user.games_played if target_user else 0
    wins = target_user.wins if target_user else 0
    losses = target_user.losses if target_user else 0
    draws = target_user.draws if target_user else 0

    # Rating history
    history_records: list[dict[str, Any]] = []
    if target_user:
        hist_rows = session.scalars(
            select(CompetitiveRatingHistory)
            .where(CompetitiveRatingHistory.user_id == target_user.id)
            .order_by(CompetitiveRatingHistory.created_at.asc())
        ).all()
        for idx, row in enumerate(hist_rows, start=1):
            history_records.append({
                "game_index": idx,
                "game_id": row.game_id,
                "rating_before": row.rating_before,
                "rating_after": row.rating_after,
                "delta": row.rating_after - row.rating_before,
                "timestamp": row.created_at.isoformat(),
            })

    return DemoPlayerProfile(
        username=username,
        current_rating=current_rating,
        is_provisional=games_played < 5,
        games_played=games_played,
        wins=wins,
        losses=losses,
        draws=draws,
        initial_rating_explanation=(
            "1200 is PlayerDNA's configured starting estimate used to seed competitive matchmaking, "
            "not a verified measure of the player's chess strength. It provides an initial balance point."
        ),
        provisional_policy_explanation=(
            "PlayerDNA Rating Policy: A player remains 'Provisional' until completing 5 rated competitive games. "
            "This rule ensures the matchmaking algorithm calibrates rating uncertainty during the initial cohort placement."
        ),
        rating_history=history_records,
    )


def _get_model_status(session: Session) -> DemoModelStatus:
    model = session.scalar(
        select(PlayerDNAStyleModel).order_by(PlayerDNAStyleModel.trained_at.desc()).limit(1)
    )

    # Count eligible registered users with >= 3 analyzed games
    dna_rows = session.scalars(
        select(LivePlayerDNAHistory)
        .where(LivePlayerDNAHistory.games_analyzed >= 3)
    ).all()
    eligible_users = len({r.user_id for r in dna_rows})

    components = [
        {
            "component": "Elo Rating System",
            "responsibility": "Estimates scalar competitive strength and updates after rated matches.",
            "implementation": "Standard Elo formula with K=32, executed authoritatively by FastAPI upon game completion.",
        },
        {
            "component": "Matchmaking Service",
            "responsibility": "Pairs opponents based on queue mode (Casual: unrated, Competitive: rating-window expansion).",
            "implementation": "Transactional FIFO queue with time-expanding rating intervals (±50 rating per 10s up to 500).",
        },
        {
            "component": "Stockfish UCI Engine",
            "responsibility": "Evaluates chess positions, computes centipawn losses (CPL), and identifies tactical moves.",
            "implementation": "Persistent UCI process communicating via standard protocol with depth-limited analysis.",
        },
        {
            "component": "PlayerDNA ML Model",
            "responsibility": "Discovers player style archetypes via unsupervised machine learning clustering.",
            "implementation": "Scikit-Learn K-Means pipeline on 3D vectors: median CPL, CPL standard deviation, and inaccuracy frequency.",
        },
        {
            "component": "Game Reporting Engine",
            "responsibility": "Synthesizes engine evaluation, move history, and player DNA into an explainable report.",
            "implementation": "Calculates accuracy % (100 * exp(-average_cpl/100)), performance stars, and tactical coaching tips.",
        },
    ]

    if model is not None:
        explanation = (
            f"Trained K-Means style model '{model.version}' is active in the system, trained on {model.training_rows} "
            f"live player feature profiles with unsupervised silhouette evaluation."
        )
        return DemoModelStatus(
            is_model_trained=True,
            model_version=model.version,
            model_type="Unsupervised K-Means Clustering",
            training_rows=model.training_rows,
            data_fingerprint=model.data_fingerprint,
            metrics=model.metrics,
            min_users_required=10,
            min_analyzed_games_per_user=3,
            eligible_users_count=eligible_users,
            individual_inference_games_required=3,
            explanation=explanation,
            components_summary=components,
        )
    else:
        explanation = (
            f"The PlayerDNA Style Model requires at least 10 registered users with ≥ 3 analyzed games each "
            f"to train an authentic unsupervised K-Means cluster without synthetic bias. Currently, {eligible_users}/10 "
            f"eligible registered user profiles have completed the 3-game minimum."
        )
        return DemoModelStatus(
            is_model_trained=False,
            model_version=None,
            model_type="Unsupervised K-Means Clustering (Awaiting Cohort Threshold)",
            training_rows=None,
            data_fingerprint=None,
            metrics=None,
            min_users_required=10,
            min_analyzed_games_per_user=3,
            eligible_users_count=eligible_users,
            individual_inference_games_required=3,
            explanation=explanation,
            components_summary=components,
        )


@router.get("/overview", response_model=DemoOverviewResponse)
def get_demo_overview(
    user: UserAccount | None = Depends(optional_current_user),
    session: Session = Depends(get_db),
):
    sample_game = _load_sample_game()
    actual_rated_game = _get_actual_rated_game(session)
    player_profile = _get_player_profile(session, user)
    model_status = _get_model_status(session)

    elo_info = {
        "formula": "New rating = Previous rating + K × (Actual score − Expected score)",
        "k_factor": 32,
        "k_factor_explanation": "K=32 is the weight factor controlling rating sensitivity per game.",
        "actual_scores": {
            "win": 1.0,
            "draw": 0.5,
            "loss": 0.0,
        },
        "expected_score_formula": "Expected score = 1 / (1 + 10^((Opponent_Rating − Player_Rating) / 400))",
        "initial_rating": 1200,
        "provisional_threshold_games": 5,
    }

    workflow_steps = [
        {
            "step": 1,
            "title": "Player Identity & Seeding",
            "description": "Users register securely with Argon2id-hashed credentials and receive a baseline 1200 Elo provisional rating.",
            "tech": "FastAPI · Argon2 · PostgreSQL",
        },
        {
            "step": 2,
            "title": "Dual-Track Matchmaking",
            "description": "Normal Play runs casual unrated matchmaking. Competitive runs Elo-window expansion (±50/10s) with DNA similarity.",
            "tech": "Advisory Locks · In-Memory Queue State",
        },
        {
            "step": 3,
            "title": "Authoritative Live Gameplay",
            "description": "Move legality, clocks, FEN positions, and PGN logs are enforced authoritatively via python-chess and WebSockets.",
            "tech": "python-chess · WebSockets · PostgreSQL",
        },
        {
            "step": 4,
            "title": "Single-Execution Elo Finalization",
            "description": "Upon game completion, Elo changes are calculated authoritatively once, saved to history, and applied to player accounts.",
            "tech": "K-32 Elo Engine · Transactional History",
        },
        {
            "step": 5,
            "title": "Asynchronous Stockfish Worker",
            "description": "Post-game Stockfish UCI worker computes centipawn loss (CPL), move classifications, accuracy %, and star ratings.",
            "tech": "Stockfish 16 UCI · Asynchronous Background Job",
        },
        {
            "step": 6,
            "title": "PlayerDNA Profiling & ML Clustering",
            "description": "Aggregates move quality into a 3D feature snapshot (median CPL, CPL standard deviation, inaccuracy rate) for K-Means.",
            "tech": "Scikit-Learn · Unsupervised Silhouette Selection",
        },
    ]

    return {
        "sample_game": sample_game,
        "actual_rated_game": actual_rated_game,
        "player_profile": player_profile,
        "model_status": model_status,
        "elo_formula_info": elo_info,
        "system_workflow_steps": workflow_steps,
    }
