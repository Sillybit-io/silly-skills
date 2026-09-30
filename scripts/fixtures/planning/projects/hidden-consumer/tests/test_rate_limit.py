import unittest

from app.core.rate_limit import RateLimited, check_rate_limit


class RateLimitTest(unittest.TestCase):
    def test_counts_down_within_one_window(self):
        self.assertEqual(check_rate_limit("t1", now=120.0), 99)
        self.assertEqual(check_rate_limit("t1", now=150.0), 98)

    def test_raises_over_the_limit(self):
        for _ in range(100):
            check_rate_limit("t2", now=600.0)
        with self.assertRaises(RateLimited):
            check_rate_limit("t2", now=601.0)

    def test_new_window_resets(self):
        for _ in range(100):
            check_rate_limit("t3", now=1200.0)
        self.assertEqual(check_rate_limit("t3", now=1260.0), 99)
