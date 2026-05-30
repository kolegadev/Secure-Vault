import time

from secret_server.signing.rate_limiter import RateLimiter


def test_rate_limit_allows_under_limit():
    rl = RateLimiter(max_requests=3, window_seconds=60)
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("alice") is True


def test_rate_limit_blocks_over_limit():
    rl = RateLimiter(max_requests=2, window_seconds=60)
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("alice") is False


def test_rate_limit_per_client():
    rl = RateLimiter(max_requests=1, window_seconds=60)
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("bob") is True


def test_rate_limit_window_slides():
    rl = RateLimiter(max_requests=1, window_seconds=0.1)
    assert rl.is_allowed("alice") is True
    assert rl.is_allowed("alice") is False
    time.sleep(0.15)
    assert rl.is_allowed("alice") is True
