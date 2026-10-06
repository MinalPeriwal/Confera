import asyncio
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from .. import room_service
from ..connection_manager import (
    CLOSE_IDLE_TIMEOUT,
    CLOSE_MEETING_ENDED,
    CLOSE_MEETING_NOT_FOUND,
    CLOSE_REMOVED,
    CLOSE_UNAUTHORIZED,
    manager,
)
from ..database import SessionLocal
from ..security import read_ticket
from .. import crud

router = APIRouter()

# Signaling messages relayed to exactly one peer.
TARGETED_TYPES = {"offer", "answer", "ice_candidate"}
# Fields a participant may change about themselves after joining.
UPDATABLE_FIELDS = ("is_muted", "camera_enabled", "is_screen_sharing", "hand_raised")
ALLOWED_REACTIONS = {"👍", "👏", "❤️", "😂", "😮", "🎉", "🙏", "👎"}
MAX_CHAT_LENGTH = 2000
MAX_CAPTION_LENGTH = 300
# Clients ping every ~15s; anything silent for longer than this is a dead connection.
IDLE_TIMEOUT_SECONDS = int(os.getenv("WS_IDLE_TIMEOUT_SECONDS", "45"))


def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def _origin_allowed(origin: str | None) -> bool:
    if not origin:  # non-browser clients
        return True
    allowed = allowed_origins()
    if "*" in allowed or origin.rstrip("/") in allowed:
        return True
    pattern = os.getenv("ALLOWED_ORIGIN_REGEX")
    return bool(pattern and re.fullmatch(pattern, origin))


def _meeting_status(meeting_id: str) -> str | None:
    db = SessionLocal()
    try:
        meeting = crud.get_meeting(db, meeting_id)
        return meeting.status if meeting else None
    finally:
        db.close()


def _attachment(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    name, url, size = raw.get("name"), raw.get("url"), raw.get("size")
    if not (isinstance(name, str) and isinstance(url, str) and isinstance(size, int)):
        return None
    if not url.startswith("/api/meetings/"):
        return None
    return {"name": name[:200], "url": url[:500], "size": size}


@router.websocket("/{meeting_id}")
async def meeting_websocket(
    websocket: WebSocket,
    meeting_id: str,
    client_id: str = Query(..., min_length=8, max_length=64),
    ticket: str | None = Query(None),
):
    if not _origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008)
        return

    meeting_id = meeting_id.replace(" ", "")
    status = await run_in_threadpool(_meeting_status, meeting_id)
    if status is None or status == "ended":
        # Accept first so the browser can read the close code instead of a bare 403.
        await websocket.accept()
        await websocket.close(code=CLOSE_MEETING_NOT_FOUND if status is None else CLOSE_MEETING_ENDED)
        return

    identity = read_ticket(ticket, meeting_id)
    if identity is None:
        await websocket.accept()
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    peer = await manager.connect(
        websocket, meeting_id, client_id,
        participant_id=identity["participant_id"], name=identity["name"], is_host=identity["is_host"],
    )

    async def moderator_only(action) -> None:
        if peer.joined and peer.can_moderate:
            await action()

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                await websocket.close(code=CLOSE_IDLE_TIMEOUT)
                break
            except ValueError:
                continue  # malformed JSON: ignore

            if not isinstance(data, dict) or not peer.general_bucket.allow():
                continue
            msg_type = data.get("type")

            if msg_type == "ping":
                await manager.send_to_peer(peer, {"type": "pong"})
                continue
            if msg_type == "leave":
                break
            if msg_type == "join":
                await room_service.handle_join(meeting_id, peer, data)
                continue
            if not peer.joined:
                continue  # waiting-room guests can do nothing but wait (or leave)

            target = manager.get(meeting_id, data["client_id"]) if isinstance(data.get("client_id"), str) else None

            if msg_type == "update":
                changes = {k: bool(data[k]) for k in UPDATABLE_FIELDS if k in data}
                peer.info.update(changes)
                await manager.broadcast(
                    meeting_id,
                    {"type": "participant_updated", "participant": {"client_id": peer.client_id, **changes}},
                    exclude_client_id=peer.client_id,
                )

            elif msg_type in TARGETED_TYPES:
                to = data.get("to")
                if isinstance(to, str) and to != peer.client_id:
                    # `from` is stamped by the server so peers cannot impersonate each other.
                    relay = {k: v for k, v in data.items() if k not in ("from", "client_id")}
                    relay["from"] = peer.client_id
                    await manager.send_to(meeting_id, to, relay)

            elif msg_type == "chat_message":
                if not peer.social_bucket.allow():
                    continue
                text = str(data.get("text") or "").strip()[:MAX_CHAT_LENGTH]
                attachment = _attachment(data.get("attachment"))
                if not text and not attachment:
                    continue
                message = {
                    "type": "chat_message",
                    "id": uuid.uuid4().hex,
                    "from": peer.client_id,
                    "sender": peer.name,
                    "text": text,
                    "attachment": attachment,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                recipient = data.get("to")
                if isinstance(recipient, str):
                    # Private message: only the recipient (the sender echoes locally).
                    message["private"] = True
                    message["to"] = recipient
                    await manager.send_to(meeting_id, recipient, message)
                else:
                    manager.remember_chat(meeting_id, message)
                    await manager.broadcast(meeting_id, message, exclude_client_id=peer.client_id)

            elif msg_type == "reaction":
                emoji = data.get("emoji")
                if emoji in ALLOWED_REACTIONS and peer.social_bucket.allow():
                    await manager.broadcast(meeting_id, {"type": "reaction", "client_id": peer.client_id, "emoji": emoji})

            elif msg_type == "caption":
                text = str(data.get("text") or "").strip()[:MAX_CAPTION_LENGTH]
                if text and peer.social_bucket.allow():
                    await manager.broadcast(meeting_id, {
                        "type": "caption", "client_id": peer.client_id, "sender": peer.name,
                        "text": text, "final": bool(data.get("final")),
                    }, exclude_client_id=peer.client_id)

            # ── moderation: host and co-hosts ──────────────────────────────
            elif msg_type == "admit" and target:
                await moderator_only(lambda: room_service.admit(meeting_id, target))
            elif msg_type == "deny" and target:
                await moderator_only(lambda: room_service.deny(meeting_id, target))
            elif msg_type == "admit_all":
                async def admit_everyone():
                    for waiting_peer in manager.waiting(meeting_id):
                        await room_service.admit(meeting_id, waiting_peer)
                await moderator_only(admit_everyone)
            elif msg_type == "mute_peer" and target and target.joined and not target.can_moderate:
                async def mute_one():
                    target.info["is_muted"] = True
                    await manager.send_to_peer(target, {"type": "force_mute"})
                await moderator_only(mute_one)
            elif msg_type == "mute_all":
                await moderator_only(lambda: manager.mute_all(meeting_id, except_client_id=peer.client_id))
            elif msg_type == "remove" and target and not target.is_host and target is not peer:
                await moderator_only(lambda: manager.kick(target, "removed", CLOSE_REMOVED))
            elif msg_type == "set_lock":
                await moderator_only(lambda: room_service.apply_settings(meeting_id, locked=bool(data.get("locked"))))
            elif msg_type == "set_waiting_room":
                await moderator_only(lambda: room_service.apply_settings(meeting_id, waiting_room=bool(data.get("enabled"))))
            elif msg_type == "make_cohost" and target and peer.is_host and target.joined and not target.is_host:
                await room_service.set_cohost(meeting_id, target, bool(data.get("value", True)))
            elif msg_type == "lower_hand" and target and target.joined:
                async def lower():
                    target.info["hand_raised"] = False
                    await manager.broadcast(meeting_id, {
                        "type": "participant_updated",
                        "participant": {"client_id": target.client_id, "hand_raised": False},
                    })
                await moderator_only(lower)
            # Unknown message types (including client-sent "meeting_ended") are ignored:
            # ending a meeting is a host-authenticated REST action.
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        was_active = manager.disconnect(meeting_id, peer)
        if was_active:
            if peer.joined:
                await manager.broadcast(meeting_id, {
                    "type": "participant_left",
                    "client_id": peer.client_id,
                    "participant_id": peer.participant_id,
                })
            elif peer.waiting:
                await manager.push_waiting_list(meeting_id)
            await run_in_threadpool(room_service.mark_left, peer.participant_id)
        try:
            await websocket.close()
        except Exception:
            pass
