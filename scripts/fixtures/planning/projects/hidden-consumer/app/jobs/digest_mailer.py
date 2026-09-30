"""Sends one digest email per user, at most once per rate-limit window."""
from app.core.rate_limit import RateLimited, check_rate_limit

SENT = []


def send_digests(users, now=None):
    for user in users:
        try:
            check_rate_limit(f"digest:{user}", now=now)
        except RateLimited:
            continue
        SENT.append(user)
    return list(SENT)
