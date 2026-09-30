"""Rejects API calls over the caller's rate limit."""
from app.api.errors import too_many_requests
from app.core.rate_limit import RateLimited, check_rate_limit


def throttle(handler):
    def wrapped(request):
        try:
            remaining = check_rate_limit(request["client"])
        except RateLimited as error:
            return too_many_requests(error)
        response = handler(request)
        response.setdefault("headers", {})["X-RateLimit-Remaining"] = str(remaining)
        return response

    return wrapped
