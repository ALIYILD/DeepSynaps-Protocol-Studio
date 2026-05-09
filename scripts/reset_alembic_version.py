"""One-shot helper: set alembic_version on MPG so the upgrade can resume from 039.

Idempotent. Reads the current value, prints it, and only writes if it differs.
"""
import os
import sys

import sqlalchemy as sa


TARGET_REVISION = "039_mri_analyses"


def main() -> int:
    url = os.environ.get("PG_URL")
    if not url:
        print("PG_URL env var required", file=sys.stderr)
        return 2
    eng = sa.create_engine(url)
    with eng.begin() as c:
        rows = c.execute(sa.text("SELECT version_num FROM alembic_version")).fetchall()
        current = rows[0][0] if rows else None
        print(f"current alembic_version: {current!r}")
        if current == TARGET_REVISION:
            print(f"already at {TARGET_REVISION}; no change")
            return 0
        c.execute(sa.text("DELETE FROM alembic_version"))
        c.execute(
            sa.text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
            {"v": TARGET_REVISION},
        )
        print(f"set alembic_version -> {TARGET_REVISION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
