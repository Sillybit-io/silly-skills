import unittest

from app.admin.inspect import windows_for
from app.core.rate_limit import check_rate_limit


class InspectTest(unittest.TestCase):
    def test_groups_by_fixed_window(self):
        check_rate_limit("inspect-a", now=180.0)
        self.assertEqual(windows_for("inspect-a"), [3])
