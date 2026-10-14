"""Shared environment safety checks for ERS reset/demo/test data tools."""
from __future__ import annotations

import os

_ALLOWED_NON_PRODUCTION = {
    "local": "development",
    "dev": "development",
    "development": "development",
    "test": "test",
    "testing": "test",
    "ci": "test",
}
_PRODUCTION = {"production", "prod"}


def require_non_production_data_mutation(operation: str, environment: str | None = None) -> str:
    raw = (environment if environment is not None else os.environ.get("APP_ENV", "")).strip().lower()
    if raw in _PRODUCTION:
        raise SystemExit(
            f"Refusing {operation}: Production data must not be modified by reset/demo/test tooling."
        )
    normalized = _ALLOWED_NON_PRODUCTION.get(raw)
    if normalized is None:
        shown = raw or "unset"
        raise SystemExit(
            f"Refusing {operation}: APP_ENV must explicitly identify local/development/test; got {shown!r}."
        )
    return normalized
