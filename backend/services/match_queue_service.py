"""Transactional Elo-fair queue and initial persistent game creation."""

import secrets
import uuid
import os
import math
import statistics
from datetime import datetime, timedelta, timezone

import chess
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.db.models import LiveGame, LivePlayerDNAHistory, MatchQueueEntry, UserAccount


INITIAL_WINDOW = 100
NEW_PLAYER_WINDOW = 250
WINDOW_STEP_SECONDS = 10
WINDOW_STEP_RATING = 50
MAX_WINDOW = 500
START_TIME_MS = int(os.getenv("PLAYERDNA_GAME_TIME_SECONDS", "300")) * 1000
INCREMENT_MS = int(os.getenv("PLAYERDNA_GAME_INCREMENT_SECONDS", "0")) * 1000


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def rating_window(entry: MatchQueueEntry, games_played: int, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    age = max(0, int((now - _utc(entry.joined_at)).total_seconds()))
    base = NEW_PLAYER_WINDOW if games_played < 5 else INITIAL_WINDOW
    return min(MAX_WINDOW, base + age // WINDOW_STEP_SECONDS * WINDOW_STEP_RATING)


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _live_dna_population(session: Session):
    snapshots = session.scalars(select(LivePlayerDNAHistory).order_by(
        LivePlayerDNAHistory.snapshot_at.desc(), LivePlayerDNAHistory.game_id,
    )).all()
    latest = {}
    for row in snapshots:
        if row.games_analyzed >= 3:
            latest.setdefault(row.user_id, row)
    if len(latest) < 5:
        return None
    features = ("median_cpl", "cpl_std", "inaccuracies_per_100_cp_moves")
    scales = {}
    for feature in features:
        values = [float(getattr(row, feature)) for row in latest.values()]
        spread = _percentile(values, .75) - _percentile(values, .25)
        if spread <= 1e-9:
            spread = statistics.pstdev(values)
        if spread > 1e-9:
            scales[feature] = spread
    return (latest, scales) if scales else None


def _distance_from_population(population, first_user_id: str, second_user_id: str) -> float | None:
    if population is None:
        return None
    latest, scales = population
    if first_user_id not in latest or second_user_id not in latest:
        return None
    squared = 0.0
    for feature, spread in scales.items():
        gap = (float(getattr(latest[first_user_id], feature)) - float(getattr(latest[second_user_id], feature))) / spread
        squared += gap * gap
    return math.sqrt(squared)


def live_dna_distance(session: Session, first_user_id: str, second_user_id: str) -> float | None:
    return _distance_from_population(_live_dna_population(session), first_user_id, second_user_id)


class MatchQueueService:
    def __init__(self, session: Session):
        self.session = session

    def _lock_queue(self):
        if self.session.bind.dialect.name == "postgresql":
            self.session.execute(text("SELECT pg_advisory_xact_lock(731044211)"))

    def join(self, user: UserAccount) -> dict:
        self._lock_queue()
        now = datetime.now(timezone.utc)
        stale_before = now - timedelta(seconds=45)
        stale = self.session.scalars(select(MatchQueueEntry).where(MatchQueueEntry.last_seen_at < stale_before)).all()
        for expired in stale:
            self.session.delete(expired)
        existing_game = self._active_game(user.id)
        if existing_game:
            return {"status": "matched", "game_id": existing_game.id, "wait_seconds": 0, "rating_window": None}
        entry = self.session.get(MatchQueueEntry, user.id)
        if entry is None:
            entry = MatchQueueEntry(user_id=user.id, rating_at_join=user.rating, last_seen_at=now)
            self.session.add(entry)
            self.session.flush()
        else:
            entry.last_seen_at = now

        candidates = self.session.scalars(
            select(MatchQueueEntry).where(MatchQueueEntry.user_id != user.id)
            .order_by(MatchQueueEntry.joined_at, MatchQueueEntry.user_id).with_for_update()
        ).all()
        dna_population = _live_dna_population(self.session)
        eligible = []
        for candidate in candidates:
            opponent = self.session.get(UserAccount, candidate.user_id)
            if opponent is None or self._active_game(opponent.id):
                self.session.delete(candidate)
                continue
            allowed = max(rating_window(entry, user.games_played, now),
                          rating_window(candidate, opponent.games_played, now))
            if abs(user.rating - opponent.rating) > allowed:
                continue
            distance = _distance_from_population(dna_population, user.id, opponent.id)
            eligible.append((abs(user.rating - opponent.rating), distance if distance is not None else float("inf"),
                             _utc(candidate.joined_at), candidate.user_id, candidate, opponent, allowed))
        if eligible:
            _, _, _, _, candidate, opponent, allowed = min(eligible, key=lambda row: row[:4])
            white, black = (user, opponent) if secrets.randbelow(2) == 0 else (opponent, user)
            game = LiveGame(id=str(uuid.uuid4()), white_user_id=white.id, black_user_id=black.id,
                            white_rating_at_start=white.rating, black_rating_at_start=black.rating,
                            status="active", current_fen=chess.Board().fen(), pgn="",
                            white_time_ms=START_TIME_MS, black_time_ms=START_TIME_MS, increment_ms=INCREMENT_MS,
                            turn_started_at=now)
            self.session.add(game)
            self.session.delete(entry)
            self.session.delete(candidate)
            self.session.commit()
            return {"status": "matched", "game_id": game.id, "wait_seconds": 0, "rating_window": allowed}
        self.session.commit()
        waited = max(0, int((now - _utc(entry.joined_at)).total_seconds()))
        return {"status": "waiting", "game_id": None, "wait_seconds": waited,
                "rating_window": rating_window(entry, user.games_played, now)}

    def cancel(self, user_id: str) -> dict:
        self._lock_queue()
        entry = self.session.get(MatchQueueEntry, user_id)
        if entry is not None:
            self.session.delete(entry)
            self.session.commit()
        game = self._active_game(user_id)
        return {"status": "matched" if game else "cancelled", "game_id": game.id if game else None,
                "wait_seconds": 0, "rating_window": None}

    def status(self, user: UserAccount) -> dict:
        entry = self.session.get(MatchQueueEntry, user.id)
        if entry is not None:
            now = datetime.now(timezone.utc)
            entry.last_seen_at = now
            self.session.commit()
            return {"status": "waiting", "game_id": None,
                    "wait_seconds": max(0, int((now - _utc(entry.joined_at)).total_seconds())),
                    "rating_window": rating_window(entry, user.games_played, now)}
        game = self._active_game(user.id)
        return {"status": "matched" if game else "idle", "game_id": game.id if game else None,
                "wait_seconds": 0, "rating_window": None}

    def _active_game(self, user_id: str):
        return self.session.scalar(select(LiveGame).where(
            LiveGame.status == "active",
            (LiveGame.white_user_id == user_id) | (LiveGame.black_user_id == user_id),
        ).order_by(LiveGame.created_at.desc()))
