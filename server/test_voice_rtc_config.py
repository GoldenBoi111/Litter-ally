import unittest

from voice_rtc_config import require_loopback_bind_host


class RequireLoopbackBindHostTests(unittest.TestCase):
    def test_accepts_ipv4_and_ipv6_loopback(self):
        self.assertEqual(require_loopback_bind_host("127.0.0.1"), "127.0.0.1")
        self.assertEqual(require_loopback_bind_host("::1"), "::1")

    def test_defaults_to_ipv4_loopback(self):
        self.assertEqual(require_loopback_bind_host(None), "127.0.0.1")

    def test_rejects_wildcard_and_private_lan_addresses(self):
        for host in ("0.0.0.0", "::", "192.168.1.12", "example.com"):
            with self.subTest(host=host), self.assertRaisesRegex(ValueError, "loopback"):
                require_loopback_bind_host(host)


if __name__ == "__main__":
    unittest.main()
