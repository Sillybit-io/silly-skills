"""Maps paths to route handlers."""
from app.api.routes import health, messages, search, uploads

ROUTES = {
    "/health": health.handle,
    "/messages": messages.handle,
    "/search": search.handle,
    "/uploads": uploads.handle,
}


def dispatch(path, request):
    handler = ROUTES.get(path)
    if handler is None:
        from app.api.errors import not_found

        return not_found()
    return handler(request)
