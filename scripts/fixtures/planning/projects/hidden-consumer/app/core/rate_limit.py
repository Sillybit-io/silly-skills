"""Fixed-window rate limiter used by the API and background jobs."""
import time

from app.config.load import load_limits
from app.store.keys import limit_key
from app.store.memory import store


class RateLimited(Exception):
    """Raised when a caller exceeds its window."""

    def __init__(self, key, retry_after):
        super().__init__(f"rate limited: {key}")
        self.key = key
        self.retry_after = retry_after


def check_rate_limit(subject, now=None):
    """Counts one request for `subject` and raises RateLimited over the limit."""
    limits = load_limits()
    now = time.time() if now is None else now
    window = int(now // limits["window_seconds"])
    key = limit_key(subject, window)
    count = store.incr(key, ttl=limits["window_seconds"])
    if count > limits["max_requests"]:
        raise RateLimited(key, limits["window_seconds"] - (now % limits["window_seconds"]))
    return limits["max_requests"] - count
