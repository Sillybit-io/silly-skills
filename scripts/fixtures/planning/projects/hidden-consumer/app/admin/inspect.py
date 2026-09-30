"""Admin view of current rate-limit counters, grouped by window."""
from app.store.keys import LIMIT_PREFIX, parse_limit_key
from app.store.memory import store


def windows_for(subject):
    found = []
    for key in store.keys(LIMIT_PREFIX):
        who, window = parse_limit_key(key)
        if who == subject:
            found.append(window)
    return found
