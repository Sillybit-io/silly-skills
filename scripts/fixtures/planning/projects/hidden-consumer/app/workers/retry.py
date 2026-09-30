"""Retries background work that was rate limited."""
from app.core.rate_limit import RateLimited

QUEUE = []


def run_with_retry(task):
    try:
        return task()
    except RateLimited as error:
        QUEUE.append((task, error.retry_after))
        return None
