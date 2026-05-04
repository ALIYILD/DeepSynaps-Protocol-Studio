from collections.abc import Generator
import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.settings import get_settings


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable FK enforcement for every new SQLite connection."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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


def _sqlite_schema_outdated() -> bool:
    """True when the on-disk SQLite schema is missing ORM columns (e.g. after a model change).

    ``create_all`` does not ALTER existing tables, and the fast test truncate path
    leaves old CREATE TABLE definitions in place — inserts then fail with
    ``no column named …``. When this happens, fall back to a full drop + create.
    """
    if engine.dialect.name != "sqlite":
        return False
    from sqlalchemy import inspect as sql_inspect

    insp = sql_inspect(engine)
    table_names = set(insp.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in table_names:
            return True
        reflected = {c["name"] for c in insp.get_columns(table.name)}
        expected = {c.name for c in table.columns}
        if not expected <= reflected:
            return True
    return False


def reset_database(fast: bool = False) -> None:
    import app.persistence.models  # noqa: F401
    from sqlalchemy import inspect, text

    # Reflect ALL existing tables (not just metadata-known ones) so stale tables
    # from previous schema versions don't block create_all.
    insp = inspect(engine)
    existing_table_names = set(insp.get_table_names())

    is_sqlite = engine.dialect.name == "sqlite"

    if fast and existing_table_names:
        # Fast test-path: truncate data instead of dropping/recreating schema.
        # ~20x faster for SQLite with 100+ tables.
        with engine.begin() as conn:
            conn.execute(text("PRAGMA foreign_keys = OFF"))
            for table_name in existing_table_names:
                conn.execute(text(f'DELETE FROM "{table_name}"'))
            if "sqlite_sequence" in existing_table_names:
                conn.execute(text('DELETE FROM "sqlite_sequence"'))
            conn.execute(text("PRAGMA foreign_keys = ON"))
        if _sqlite_schema_outdated():
            return reset_database(fast=False)
        return

    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys = OFF"))
        # Drop every table currently in the DB regardless of whether it is in
        # the current metadata — this prevents "table already exists" errors
        # when the schema has evolved and old tables linger in the test file.
        for table_name in existing_table_names:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys = ON"))

    Base.metadata.create_all(bind=engine)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
