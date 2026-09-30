"""Small string helpers."""


def slug(text):
    return "-".join(text.lower().split())
