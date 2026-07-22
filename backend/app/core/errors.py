"""Custom exception types for the app."""


class AppError(Exception):
    """Base class for known application errors."""

    status_code: int = 500
    message: str = "Internal error"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.message)
        if message:
            self.message = message


class ConfigError(AppError):
    status_code = 500
    message = "Server misconfigured"


class RateLimitError(AppError):
    status_code = 429
    message = "Rate limit exceeded"


class GradingError(AppError):
    status_code = 502
    message = "Could not grade answer"