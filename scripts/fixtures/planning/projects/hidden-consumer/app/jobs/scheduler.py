"""Runs periodic jobs."""
from app.jobs import cleanup, digest_mailer

JOBS = {
    "digest": lambda: digest_mailer.send_digests(["ana", "ben"]),
    "cleanup": cleanup.run,
}


def run(name):
    return JOBS[name]()
