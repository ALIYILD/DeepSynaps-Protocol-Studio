from __future__ import annotations

import importlib
import importlib.util
import os
from pathlib import Path
import sys
from typing import Any


_PKG_NAME = "_ali_home_hermes_runtime"
_LOADED_ROOT: Path | None = None


def _bundled_runtime_root() -> Path:
    return Path(__file__).resolve().parent.parent / "hermes_runtime_bundle"


def runtime_root() -> Path:
    raw = os.getenv("HERMES_RUNTIME_ROOT")
    if raw:
        return Path(raw).expanduser()
    home_root = Path.home() / ".hermes"
    if (home_root / "runtime" / "__init__.py").exists():
        return home_root
    bundled_root = _bundled_runtime_root()
    if (bundled_root / "runtime" / "__init__.py").exists():
        return bundled_root
    return home_root


def _load_runtime_package() -> None:
    global _LOADED_ROOT
    root = runtime_root() / "runtime"
    init_path = root / "__init__.py"
    if not init_path.exists():
        raise FileNotFoundError(f"Hermes runtime package not found at {init_path}")
    if _LOADED_ROOT == root and _PKG_NAME in sys.modules:
        return
    for key in list(sys.modules):
        if key == _PKG_NAME or key.startswith(f"{_PKG_NAME}."):
            sys.modules.pop(key, None)
    spec = importlib.util.spec_from_file_location(
        _PKG_NAME,
        init_path,
        submodule_search_locations=[str(root)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Hermes runtime package from {init_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[_PKG_NAME] = module
    spec.loader.exec_module(module)
    _LOADED_ROOT = root


def _load_submodule(name: str):
    _load_runtime_package()
    return importlib.import_module(f"{_PKG_NAME}.{name}")


def board_store():
    boards_mod = _load_submodule("boards")
    return boards_mod.HermesBoardStore(runtime_root())


def preview_route(payload: dict[str, Any]) -> dict[str, Any]:
    router_mod = _load_submodule("router")
    return router_mod.preview_route(payload)


def route_intake_task(payload: dict[str, Any]) -> dict[str, Any]:
    router_mod = _load_submodule("router")
    return router_mod.route_intake_task(board_store(), payload)


def process_telegram_update(update: dict[str, Any], *, dry_run: bool = True) -> dict[str, Any]:
    telegram_mod = _load_submodule("telegram_ingress")
    return telegram_mod.process_telegram_update(update, store=board_store(), dry_run=dry_run)
