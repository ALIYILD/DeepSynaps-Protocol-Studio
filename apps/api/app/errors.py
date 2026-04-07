from dataclasses import dataclass


@dataclass(slots=True)
class ApiServiceError(Exception):
    code: str
    message: str
    warnings: list[str]
    status_code: int = 422
