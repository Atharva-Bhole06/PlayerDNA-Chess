"""Isolated SQLite fixture for database and API integration tests."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.import_csv import import_data
from backend.db.session import get_db
from backend.main import app


def test_engine():
    """Create a fresh in-memory database for one test fixture lifecycle."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        import_data(session)
    return engine


def configure_test_database():
    """Configure FastAPI to use a newly created, isolated test database."""
    engine = test_engine()

    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return engine
