import unittest

from cli import main
from greet import greet


class GreetTest(unittest.TestCase):
    def test_greets_by_name(self):
        self.assertEqual(greet("Ana"), "Hello, Ana")

    def test_cli_returns_zero(self):
        self.assertEqual(main(["Ben"]), 0)
