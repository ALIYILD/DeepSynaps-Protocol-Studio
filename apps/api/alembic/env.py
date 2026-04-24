import os
import sys
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.schema import CreateIndex, CreateTable
from alembic import context

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.persistence.models import Base  # noqa: E402
from app.settings import get_settings  # noqa: E402


# ── Idempotent DDL on SQLite ─────────────────────────────────────────────────
# Fly's SQLite volume was partially bootstrapped via Base.metadata.create_all()
# before every migration was wired through alembic, leaving the schema ahead of
# the stamped revision in places. Rather than patching each historical migration
# (17+ create_table entries from rev 014 onward), emit IF NOT EXISTS on the
# SQLite dialect so replays are harmless.

@compiles(CreateTable, "sqlite")
def _sqlite_create_table_if_not_exists(element, compiler, **kw):
    text = compiler.visit_create_table(element, **kw)
    if text.lstrip().startswith("CREATE TABLE IF NOT EXISTS"):
        return text
    return text.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1)


@compiles(CreateIndex, "sqlite")
def _sqlite_create_index_if_not_exists(element, compiler, **kw):
    text = compiler.visit_create_index(element, **kw)
    if "INDEX IF NOT EXISTS" in text:
        return text
    return (
        text
        .replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS", 1)
        .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS", 1)
    )


# SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Intercept add_column
# at the alembic impl layer and skip when the target column already exists —
# same drift-handling as the CreateTable/CreateIndex hooks above.
from alembic.ddl.impl import DefaultImpl  # noqa: E402
from sqlalchemy import inspect as _sa_inspect  # noqa: E402

_orig_add_column = DefaultImpl.add_column


def _idempotent_add_column(self, table_name, column, schema=None, **kw):
    bind = getattr(self, "connection", None)
    if bind is not None:
        try:
            inspector = _sa_inspect(bind)
            existing = {c["name"] for c in inspector.get_columns(table_name, schema=schema)}
            if column.name in existing:
                return
        except Exception:
            pass
    return _orig_add_column(self, table_name, column, schema=schema, **kw)


DefaultImpl.add_column = _idempotent_add_column


# One-shot self-heal for Fly's drifted SQLite volume: swallow the exact two
# DBAPI errors that indicate "this DDL is already reflected in the schema" and
# let alembic's version bookkeeping advance. Any other error propagates as
# normal. After this deploy lands and alembic_version catches up to head,
# subsequent migrations run cleanly against a matched schema and this branch
# is unreachable.
import logging as _logging  # noqa: E402

_orig_exec = DefaultImpl._exec
_DRIFT_SIGNALS = ("already exists", "duplicate column")
_env_log = _logging.getLogger("alembic.env")


def _forgiving_exec(self, construct, *args, **kwargs):
    try:
        return _orig_exec(self, construct, *args, **kwargs)
    except Exception as exc:  # noqa: BLE001 — narrow via message match below
        msg = str(exc).lower()
        if any(signal in msg for signal in _DRIFT_SIGNALS):
            _env_log.warning(
                "alembic: swallowing idempotent drift on %s: %s",
                type(construct).__name__,
                str(exc)[:240],
            )
            return None
        raise


DefaultImpl._exec = _forgiving_exec

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return get_settings().database_url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    import sqlite3 as _sqlite3
    from sqlalchemy import event as _event

    url = get_url()
    if url.startswith("sqlite"):
        connectable = create_engine(url, connect_args={"check_same_thread": False})

        @_event.listens_for(connectable, "connect")
        def _set_fk_pragma(dbapi_conn, _record):
            if isinstance(dbapi_conn, _sqlite3.Connection):
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()
    else:
        connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
