from collections import deque
from threading import Lock
from time import time


class RateLimiter:
    """Simple in-memory sliding-window rate limiter."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clients: dict[str, deque[float]] = {}
        self._lock = Lock()

    def is_allowed(self, client_id: str) -> bool:
        with self._lock:
            now = time()
            window = self._clients.setdefault(client_id, deque())
            while window and window[0] < now - self.window_seconds:
                window.popleft()
            if len(window) >= self.max_requests:
                return False
            window.append(now)
            return True
