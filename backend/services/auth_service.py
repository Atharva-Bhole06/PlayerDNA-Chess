"""Account creation and opaque, revocable browser sessions."""

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import LivePlayerDNAHistory, Player, UserAccount, UserSession


SESSION_SECONDS = 60 * 60 * 24 * 14
PBKDF2_ROUNDS = 600_000


class UsernameTakenError(ValueError):
    pass


class InvalidCredentialsError(ValueError):
    pass


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, rounds, salt, expected = encoded.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(rounds)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class AuthService:
    def __init__(self, session: Session):
        self.session = session
        self.session_seconds = SESSION_SECONDS
        self.secure_cookies = os.getenv("PLAYERDNA_COOKIE_SECURE", "false").lower() == "true"

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def profile(self, user: UserAccount) -> dict:
        dna = self.session.scalar(select(LivePlayerDNAHistory).where(
            LivePlayerDNAHistory.user_id == user.id,
        ).order_by(LivePlayerDNAHistory.snapshot_at.desc()).limit(1))
        dna_status = "available" if dna is not None else "collecting" if user.games_played else "awaiting_first_game"
        return {"username": user.username, "rating": user.rating, "games_played": user.games_played,
                "wins": user.wins, "losses": user.losses, "draws": user.draws, "player_dna_status": dna_status,
                "is_admin": bool(user.is_admin)}

    def _new_session(self, user: UserAccount) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        self.session.add(UserSession(token_hash=self._token_hash(token), user_id=user.id,
                                     expires_at=now + timedelta(seconds=self.session_seconds)))
        self.session.commit()
        return token

    def register(self, username: str, password: str) -> tuple[UserAccount, str]:
        username_key = username.casefold()
        if self.session.scalar(select(UserAccount.id).where(UserAccount.username_key == username_key)):
            raise UsernameTakenError()
        player_id = f"live-{uuid.uuid4()}"
        user = UserAccount(id=str(uuid.uuid4()), username=username, username_key=username_key,
                           password_hash=_hash_password(password), player_id=player_id)
        self.session.add(Player(player_id=player_id, cohort_member=False))
        self.session.add(user)
        self.session.flush()
        token = self._new_session(user)
        return user, token

    def login(self, username: str, password: str) -> tuple[UserAccount, str]:
        user = self.session.scalar(select(UserAccount).where(UserAccount.username_key == username.casefold()))
        if user is None or not _verify_password(password, user.password_hash):
            raise InvalidCredentialsError()
        return user, self._new_session(user)

    def authenticate(self, token: str | None) -> UserAccount | None:
        if not token:
            return None
        record = self.session.get(UserSession, self._token_hash(token))
        if record is None:
            return None
        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            self.session.delete(record)
            self.session.commit()
            return None
        return self.session.get(UserAccount, record.user_id)

    def logout(self, token: str | None) -> None:
        if token:
            record = self.session.get(UserSession, self._token_hash(token))
            if record is not None:
                self.session.delete(record)
                self.session.commit()
