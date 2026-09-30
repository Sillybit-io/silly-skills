import unittest

from app.jobs.digest_mailer import send_digests


class DigestTest(unittest.TestCase):
    def test_sends_once_per_user(self):
        self.assertEqual(send_digests(["dana"], now=3000.0), ["dana"])
