"""Loads plugins named in config/plugins.json by string."""
import importlib
import json
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "config" / "plugins.json"

PLUGINS = {
    "rate_limit": "app.core.rate_limit",
    "audit": "app.plugins.audit",
}


def load_enabled():
    enabled = json.loads(CONFIG.read_text())["enabled"]
    return {name: importlib.import_module(PLUGINS[name]) for name in enabled}
