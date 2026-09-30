"""Storage key formats shared by the rate limiter and the admin tools."""
LIMIT_PREFIX = "rl"


def limit_key(subject, window):
    return f"{LIMIT_PREFIX}:{subject}:{window}"


def parse_limit_key(key):
    prefix, rest = key.split(":", 1)
    subject, window = rest.rsplit(":", 1)
    if prefix != LIMIT_PREFIX:
        raise ValueError(f"not a rate-limit key: {key}")
    return subject, int(window)
