"""Join tickets, passcodes and rate limiting.

A *ticket* is issued by the REST join endpoint and required to open the meeting WebSocket. It binds
the connection to a meeting, a participant row and a server-decided role, so a client cannot claim to
be the host, change its name, or enter a meeting it was never admitted to by the REST layer.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

TICKET_TTL_SECONDS = 12 * 3600
_log = logging.getLogger("uvicorn.error")


def _secret() -> bytes:
    configured = os.getenv("SECRET_KEY")
    if configured:
        return configured.encode()
    # Stable across restarts so reconnecting clients keep working, but set SECRET_KEY in production.
    seed = f"{os.getenv('CLERK_ISSUER_DOMAIN', '')}|{os.getenv('DATABASE_URL', 'sqlite')}|confera"
    if not getattr(_secret, "_warned", False):
        _log.warning("SECRET_KEY is not set: deriving a signing key from other settings. Set SECRET_KEY in production.")
        _secret._warned = True  # type: ignore[attr-defined]
    return hashlib.sha256(seed.encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def make_ticket(meeting_id: str, participant_id: int, name: str, is_host: bool) -> str:
    payload = {"m": meeting_id, "p": participant_id, "n": name, "h": is_host, "e": int(time.time()) + TICKET_TTL_SECONDS}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_ticket(ticket: str | None, meeting_id: str) -> dict | None:
    """Returns {participant_id, name, is_host} for a valid ticket for this meeting, else None."""
    if not ticket or "." not in ticket:
        return None
    body, sig = ticket.rsplit(".", 1)
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if payload.get("m") != meeting_id or payload.get("e", 0) < time.time():
        return None
    return {"participant_id": payload["p"], "name": payload["n"], "is_host": bool(payload["h"])}


def hash_passcode(passcode: str) -> str:
    salt = secrets.token_bytes(8)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode(), salt, 50_000)
    return f"{_b64(salt)}${_b64(digest)}"


def check_passcode(passcode: str | None, stored: str | None) -> bool:
    if not stored:
        return True
    if not passcode:
        return False
    try:
        salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", passcode.encode(), _unb64(salt_b64), 50_000)
        return hmac.compare_digest(digest, _unb64(digest_b64))
    except Exception:
        return False


class TokenBucket:
    """Allows `rate` events/second with bursts up to `capacity`."""

    def __init__(self, rate: float, capacity: float):
        self.rate, self.capacity = rate, capacity
        self.tokens, self.stamp = capacity, time.monotonic()

    def allow(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.stamp) * self.rate)
        self.stamp = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


def rate_limit(request: Request, bucket: str, limit: int, window_seconds: int = 60) -> None:
    """Sliding-window limiter per client IP (in memory, per process). Raises 429 when exceeded."""
    if os.getenv("DISABLE_RATE_LIMIT") == "1":
        return
    key = f"{bucket}:{client_ip(request)}"
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > window_seconds:
        hits.popleft()
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment and try again.")
    hits.append(now)
