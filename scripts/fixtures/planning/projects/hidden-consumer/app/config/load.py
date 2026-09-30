"""Loads limiter settings from config/limits.json and the environment."""
import json
import os
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "config" / "limits.json"


def load_limits():
    limits = json.loads(CONFIG.read_text())
    if os.environ.get("RATE_LIMIT_WINDOW"):
        limits["window_seconds"] = int(os.environ["RATE_LIMIT_WINDOW"])
    return limits
