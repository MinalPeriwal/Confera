import base64
import hashlib
import hmac
import os
import time

from fastapi import APIRouter

router = APIRouter()

DEFAULT_STUN = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@router.get("/ice-servers")
def ice_servers():
    """ICE server list for WebRTC clients.

    STUN_URLS            comma separated, defaults to Google's public STUN servers
    TURN_URLS            comma separated, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"
    TURN_USERNAME / TURN_CREDENTIAL   static long-term credentials, or
    TURN_SECRET          coturn `static-auth-secret` -> short-lived credentials are minted per request
    """
    servers: list[dict] = [{"urls": _split(os.getenv("STUN_URLS", DEFAULT_STUN))}]

    turn_urls = _split(os.getenv("TURN_URLS", ""))
    if turn_urls:
        secret = os.getenv("TURN_SECRET")
        if secret:
            expiry = int(time.time()) + int(os.getenv("TURN_TTL_SECONDS", "86400"))
            username = str(expiry)
            digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
            servers.append({"urls": turn_urls, "username": username, "credential": base64.b64encode(digest).decode()})
        elif os.getenv("TURN_USERNAME") and os.getenv("TURN_CREDENTIAL"):
            servers.append({
                "urls": turn_urls,
                "username": os.environ["TURN_USERNAME"],
                "credential": os.environ["TURN_CREDENTIAL"],
            })
    return {"iceServers": servers, "hasTurn": len(servers) > 1}
