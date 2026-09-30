"""Route handlers for /messages."""
from app.api.middleware.throttle import throttle


@throttle
def handle(request):
    return {"status": 200, "body": {"route": "messages", "client": request["client"]}}
