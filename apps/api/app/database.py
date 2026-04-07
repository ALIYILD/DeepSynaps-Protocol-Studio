from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.settings import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    url = get_settings().database_url
    if url.startswith("sqlite"):
        return create_engine(url, future=True, connect_args={"check_same_thread": False})
    else:
        # PostgreSQL - connection pooling
        return create_engine(
            url,
            future=True,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,   # detect stale connections
            pool_recycle=3600,    # recycle connections every hour
        )


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def init_database() -> None:
    import app.persistence.models  # noqa: F401  # registers all models with Base.metadata

    Base.metadata.create_all(bind=engine)


def reset_database() -> None:
    import app.persistence.models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
