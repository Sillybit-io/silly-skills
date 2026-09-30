import unittest

from app.api.server import dispatch


class ThrottleTest(unittest.TestCase):
    def test_sets_remaining_header(self):
        response = dispatch("/messages", {"client": "throttle-a"})
        self.assertEqual(response["headers"]["X-RateLimit-Remaining"], "99")

    def test_health_is_not_limited(self):
        self.assertNotIn("headers", dispatch("/health", {"client": "throttle-b"}))
