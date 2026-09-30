"""Route handlers for /search."""
from app.api.middleware.throttle import throttle


@throttle
def handle(request):
    return {"status": 200, "body": {"route": "search", "client": request["client"]}}
