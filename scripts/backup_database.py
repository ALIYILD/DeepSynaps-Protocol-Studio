from __future__ import annotations

import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from app.settings import get_settings  # noqa: E402


def resolve_sqlite_path(database_url: str) -> Path:
    if not database_url.startswith("sqlite:///"):
        raise RuntimeError("Database backup hook currently supports sqlite URLs only.")
    return (REPO_ROOT / database_url.removeprefix("sqlite:///")).resolve()


def main() -> int:
    settings = get_settings()
    backup_root = settings.database_backup_root
    backup_root.mkdir(parents=True, exist_ok=True)

    source_path = resolve_sqlite_path(settings.database_url)
    if not source_path.exists():
        raise RuntimeError(f"Database file does not exist: {source_path}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target_path = backup_root / f"{source_path.stem}-{timestamp}{source_path.suffix}"
    shutil.copy2(source_path, target_path)
    print(target_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
