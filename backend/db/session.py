"""Environment-based database configuration and SQLAlchemy sessions."""

import os
import threading
from collections.abc import Generator

from sqlalchemy import Engine, URL, create_engine, make_url, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


from backend.config import PROJECT_ROOT


class DatabaseUnavailableError(RuntimeError):
    """Database configuration is absent or its connection is unavailable."""


_engine: Engine | None = None
_lock = threading.Lock()


def get_database_url() -> str:
    configured_url = os.getenv("DATABASE_URL")
    if configured_url:
        parsed = make_url(configured_url)
        if parsed.drivername in {"postgresql", "postgresql+psycopg2"}:
            parsed = parsed.set(drivername="postgresql+psycopg")
        return parsed.render_as_string(hide_password=False)

    keys = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    config = {key: os.getenv(key) for key in keys}
    if any(value is None or value == "" for value in config.values()):
        raise DatabaseUnavailableError(
            "Database is not configured; set DATABASE_URL or all DB_* variables"
        )
    try:
        port = int(config["DB_PORT"])
    except ValueError as exc:
        raise DatabaseUnavailableError("DB_PORT must be an integer") from exc
    url = URL.create(
        "postgresql+psycopg",
        username=config["DB_USER"],
        password=config["DB_PASSWORD"],
        host=config["DB_HOST"],
        port=port,
        database=config["DB_NAME"],
    )
    return url.render_as_string(hide_password=False)


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                try:
                    url = get_database_url()
                    kwargs = {"pool_pre_ping": True}
                    if "sqlite" not in url:
                        kwargs.update(pool_size=5, max_overflow=10)
                    _engine = create_engine(url, **kwargs)
                except DatabaseUnavailableError:
                    raise
                except Exception as exc:
                    raise DatabaseUnavailableError("Database configuration is invalid") from exc
    return _engine


def get_db() -> Generator[Session, None, None]:
    try:
        engine = get_engine()
        with Session(engine) as session:
            try:
                yield session
            except SQLAlchemyError as exc:
                session.rollback()
                raise DatabaseUnavailableError("Database operation failed") from exc
            finally:
                session.rollback()
    except DatabaseUnavailableError:
        raise
    except SQLAlchemyError as exc:
        raise DatabaseUnavailableError("Database connection failed") from exc


def database_is_available() -> bool:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except (DatabaseUnavailableError, SQLAlchemyError):
        return False


def dispose_engine() -> None:
    global _engine
    with _lock:
        if _engine is not None:
            _engine.dispose()
            _engine = None
