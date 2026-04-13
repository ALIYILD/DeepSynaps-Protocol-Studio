from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ApiServiceError(Exception):
    code: str
    message: str
    warnings: list[str] = field(default_factory=list)
    status_code: int = 422
    details: dict[str, Any] | None = None
