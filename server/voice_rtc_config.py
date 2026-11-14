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
