from dataclasses import dataclass, field


@dataclass(slots=True)
class ApiServiceError(Exception):
    code: str
    message: str
    warnings: list[str] = field(default_factory=list)
    status_code: int = 422
