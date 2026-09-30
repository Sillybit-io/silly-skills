"""Health check. Not rate limited so monitors never see 429."""


def handle(request):
    return {"status": 200, "body": {"ok": True}}
