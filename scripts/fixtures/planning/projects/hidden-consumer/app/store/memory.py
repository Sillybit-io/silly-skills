"""In-process key-value store with expiring counters."""
import time


class MemoryStore:
    def __init__(self):
        self._values = {}

    def incr(self, key, ttl):
        value, expires = self._values.get(key, (0, 0))
        if expires and expires < time.time():
            value = 0
        value += 1
        self._values[key] = (value, time.time() + ttl)
        return value

    def keys(self, prefix):
        return sorted(k for k in self._values if k.startswith(prefix + ":"))

    def delete(self, key):
        self._values.pop(key, None)


store = MemoryStore()
