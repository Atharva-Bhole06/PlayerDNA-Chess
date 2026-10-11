"""Run queued post-game Stockfish work without blocking live move requests.

Run once with ``python -m backend.analysis_worker --once`` or run the worker
continuously with ``python -m backend.analysis_worker``.
"""

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.db.models import GameAnalysisJob
from backend.db.session import DatabaseUnavailableError, get_engine
from backend.services.chess_service import chess_service
from backend.services.game_analysis_service import process_game_analysis


logger = logging.getLogger("playerdna.analysis_worker")
STALE_AFTER = timedelta(minutes=15)


def claim_next_job() -> str | None:
    now = datetime.now(timezone.utc)
    with Session(get_engine()) as session:
        statement = select(GameAnalysisJob).where(or_(
            GameAnalysisJob.status == "queued",
            (GameAnalysisJob.status == "processing") & (GameAnalysisJob.started_at < now - STALE_AFTER),
        )).order_by(GameAnalysisJob.created_at, GameAnalysisJob.game_id).with_for_update(skip_locked=True)
        job = session.scalar(statement)
        if job is None:
            return None
        job.status = "processing"
        job.attempts += 1
        job.started_at = now
        job.error_message = None
        game_id = job.game_id
        session.commit()
        return game_id


def run_one() -> str | None:
    game_id = claim_next_job()
    if game_id is None:
        return None
    with Session(get_engine()) as session:
        return process_game_analysis(session, game_id, chess_service.analyze_move, "Stockfish (UCI)")


def retry_failed_jobs() -> int:
    with Session(get_engine()) as session:
        jobs = session.scalars(select(GameAnalysisJob).where(GameAnalysisJob.status == "failed")).all()
        for job in jobs:
            job.status = "queued"
            job.error_message = None
            job.started_at = None
            job.completed_at = None
        session.commit()
        return len(jobs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Process at most one queued game")
    parser.add_argument("--retry-failed", action="store_true", help="Requeue failed jobs before processing")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        if args.retry_failed:
            logger.info("Requeued %s failed analysis job(s)", retry_failed_jobs())
        while True:
            result = run_one()
            if result is None:
                if args.once:
                    break
                time.sleep(2)
                continue
            logger.info("Processed game analysis job: %s", result)
            if args.once:
                break
    except DatabaseUnavailableError as exc:
        parser.exit(2, f"Database unavailable: {exc}\n")
    finally:
        chess_service.close()


if __name__ == "__main__":
    main()
