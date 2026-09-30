"""Route handlers for /uploads."""
from app.api.middleware.throttle import throttle


@throttle
def handle(request):
    return {"status": 200, "body": {"route": "uploads", "client": request["client"]}}
