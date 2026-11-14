import unittest

from voice_rtc_config import require_loopback_bind_host, stt_settings


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


class SttSettingsTests(unittest.TestCase):
    def test_defaults_to_parakeet(self):
        self.assertEqual(stt_settings(None, None), ("parakeet", "nemo-parakeet-tdt-0.6b-v2"))

    def test_ignores_a_leftover_whisper_model_name_for_parakeet(self):
        self.assertEqual(stt_settings("parakeet", "base.en"), ("parakeet", "nemo-parakeet-tdt-0.6b-v2"))
        self.assertEqual(stt_settings("parakeet", "nemo-parakeet-tdt-0.6b-v3"), ("parakeet", "nemo-parakeet-tdt-0.6b-v3"))

    def test_whisper_remains_available(self):
        self.assertEqual(stt_settings("faster_whisper", None), ("faster_whisper", "base.en"))
        self.assertEqual(stt_settings("faster-whisper", "small.en"), ("faster_whisper", "small.en"))

    def test_rejects_unknown_provider(self):
        with self.assertRaisesRegex(ValueError, "LOCAL_STT_PROVIDER"):
            stt_settings("vosk", None)


if __name__ == "__main__":
    unittest.main()
