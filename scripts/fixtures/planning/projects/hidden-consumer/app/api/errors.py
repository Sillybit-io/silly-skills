"""HTTP error responses."""


def too_many_requests(error):
    return {
        "status": 429,
        "headers": {"Retry-After": str(int(error.retry_after))},
        "body": {"error": "rate_limited", "key": error.key},
    }


def not_found():
    return {"status": 404, "body": {"error": "not_found"}}
