from ipaddress import ip_address


def require_loopback_bind_host(value):
    host = (value or "127.0.0.1").strip()
    try:
        address = ip_address(host)
    except ValueError as error:
        raise ValueError("The voice host must bind to a loopback IP address.") from error
    if not address.is_loopback:
        raise ValueError("The voice host must bind to a loopback IP address; public binding is not supported.")
    return host


PARAKEET_DEFAULT_MODEL = "nemo-parakeet-tdt-0.6b-v2"
WHISPER_DEFAULT_MODEL = "base.en"


def stt_settings(provider, model):
    """Pick the speech-to-text engine. Parakeet is the default; LOCAL_STT_PROVIDER=faster_whisper keeps Whisper."""
    name = (provider or "parakeet").strip().lower().replace("-", "_")
    model = (model or "").strip()
    if name in ("faster_whisper", "whisper"):
        return "faster_whisper", model or WHISPER_DEFAULT_MODEL
    if name != "parakeet":
        raise ValueError(f"Unknown LOCAL_STT_PROVIDER {provider!r}; use parakeet or faster_whisper.")
    # An old .env may still say LOCAL_STT_MODEL=base.en; that is a Whisper model, so ignore it for Parakeet.
    return "parakeet", model if "parakeet" in model else PARAKEET_DEFAULT_MODEL
