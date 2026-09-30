"""Records API calls for the audit log."""
EVENTS = []


def record(event):
    EVENTS.append(event)
