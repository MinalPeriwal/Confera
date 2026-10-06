import asyncio
from collections import deque
from dataclasses import dataclass, field

from fastapi import WebSocket

from .security import TokenBucket

# Custom WebSocket close codes (4000-4999 are application defined)
CLOSE_UNAUTHORIZED = 4401
CLOSE_REMOVED = 4403
CLOSE_MEETING_NOT_FOUND = 4404
CLOSE_DENIED = 4405
CLOSE_IDLE_TIMEOUT = 4408
CLOSE_REPLACED = 4409
CLOSE_MEETING_ENDED = 4410

# Fields other participants are allowed to see.
PUBLIC_FIELDS = (
    "id", "display_name", "is_host", "is_cohost", "is_muted", "camera_enabled", "is_screen_sharing", "hand_raised",
)
CHAT_HISTORY_LIMIT = 200


def new_general_bucket() -> TokenBucket:
    return TokenBucket(rate=100, capacity=200)  # signaling bursts (ICE candidates) are legitimate


def new_social_bucket() -> TokenBucket:
    return TokenBucket(rate=4, capacity=10)  # chat / reactions / captions


@dataclass
class Peer:
    websocket: WebSocket
    client_id: str
    participant_id: int
    name: str
    is_host: bool
    is_cohost: bool = False
    info: dict = field(default_factory=dict)
    joined: bool = False
    waiting: bool = False
    pending_join: dict = field(default_factory=dict)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    general_bucket: TokenBucket = field(default_factory=new_general_bucket)
    social_bucket: TokenBucket = field(default_factory=new_social_bucket)

    @property
    def can_moderate(self) -> bool:
        return self.is_host or self.is_cohost

    def public_info(self) -> dict:
        data = {k: self.info.get(k) for k in PUBLIC_FIELDS if k in self.info}
        data.update(id=self.participant_id, display_name=self.name, is_host=self.is_host,
                    is_cohost=self.is_cohost, client_id=self.client_id)
        return data


class ConnectionManager:
    """In-memory room registry. One process only: run a single uvicorn worker, or
    put a pub/sub layer (e.g. Redis) in front of this before scaling horizontally."""

    def __init__(self):
        self.rooms: dict[str, dict[str, Peer]] = {}  # meeting_id -> {client_id: Peer}
        self.state: dict[str, dict] = {}  # meeting_id -> {"locked": bool, "waiting_room": bool}
        self.history: dict[str, deque] = {}  # meeting_id -> recent public chat messages

    # ── connection lifecycle ────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, meeting_id: str, client_id: str, *, participant_id: int,
                      name: str, is_host: bool) -> Peer:
        """Accept the socket and register it. A reconnect with the same client_id
        replaces (and closes) the previous, possibly half-dead, socket."""
        await websocket.accept()
        room = self.rooms.setdefault(meeting_id, {})
        previous = room.get(client_id)
        peer = Peer(websocket=websocket, client_id=client_id, participant_id=participant_id, name=name, is_host=is_host)
        if previous:
            # Carry the live state over so a quick reconnect doesn't flicker for others.
            peer.info = dict(previous.info)
            peer.joined = previous.joined
            peer.is_cohost = previous.is_cohost
        room[client_id] = peer
        if previous:
            try:
                await previous.websocket.close(code=CLOSE_REPLACED)
            except Exception:
                pass
        return peer

    def disconnect(self, meeting_id: str, peer: Peer) -> bool:
        """Unregister a peer. Returns True only if this socket was still the active
        one for its client_id (False when it had already been replaced)."""
        room = self.rooms.get(meeting_id)
        if not room or room.get(peer.client_id) is not peer:
            return False
        del room[peer.client_id]
        if not room:
            self.rooms.pop(meeting_id, None)
            self.state.pop(meeting_id, None)
            self.history.pop(meeting_id, None)
        return True

    # ── queries ─────────────────────────────────────────────────────────────

    def roster(self, meeting_id: str, exclude_client_id: str | None = None) -> list[dict]:
        room = self.rooms.get(meeting_id, {})
        return [p.public_info() for cid, p in room.items() if p.joined and cid != exclude_client_id]

    def waiting(self, meeting_id: str) -> list[Peer]:
        return [p for p in self.rooms.get(meeting_id, {}).values() if p.waiting and not p.joined]

    def waiting_list(self, meeting_id: str) -> list[dict]:
        return [{"client_id": p.client_id, "display_name": p.name} for p in self.waiting(meeting_id)]

    def moderators(self, meeting_id: str) -> list[Peer]:
        return [p for p in self.rooms.get(meeting_id, {}).values() if p.joined and p.can_moderate]

    def get(self, meeting_id: str, client_id: str) -> Peer | None:
        return self.rooms.get(meeting_id, {}).get(client_id)

    def find_by_participant_id(self, meeting_id: str, participant_id: int) -> Peer | None:
        for peer in self.rooms.get(meeting_id, {}).values():
            if peer.participant_id == participant_id:
                return peer
        return None

    def room_state(self, meeting_id: str) -> dict:
        return dict(self.state.get(meeting_id, {"locked": False, "waiting_room": False}))

    def remember_chat(self, meeting_id: str, message: dict) -> None:
        self.history.setdefault(meeting_id, deque(maxlen=CHAT_HISTORY_LIMIT)).append(message)

    def chat_history(self, meeting_id: str) -> list[dict]:
        return list(self.history.get(meeting_id, []))

    # ── messaging ───────────────────────────────────────────────────────────

    async def _send(self, peer: Peer, message: dict) -> None:
        try:
            async with peer.send_lock:
                await peer.websocket.send_json(message)
        except Exception:
            # Dead sockets are cleaned up by their own receive loop / idle timeout.
            pass

    async def send_to_peer(self, peer: Peer, message: dict) -> None:
        await self._send(peer, message)

    async def send_to(self, meeting_id: str, client_id: str, message: dict) -> None:
        peer = self.get(meeting_id, client_id)
        if peer and peer.joined:
            await self._send(peer, message)

    async def broadcast(self, meeting_id: str, message: dict, exclude_client_id: str | None = None) -> None:
        room = self.rooms.get(meeting_id)
        if not room:
            return
        targets = [p for cid, p in room.items() if p.joined and cid != exclude_client_id]
        await asyncio.gather(*(self._send(p, message) for p in targets))

    async def push_waiting_list(self, meeting_id: str) -> None:
        message = {"type": "waiting_list", "participants": self.waiting_list(meeting_id)}
        await asyncio.gather(*(self._send(p, message) for p in self.moderators(meeting_id)))

    # ── host/moderator actions ──────────────────────────────────────────────

    async def end_meeting(self, meeting_id: str) -> None:
        """Tell everyone (including people still waiting) the meeting is over and drop the room."""
        room = self.rooms.pop(meeting_id, {})
        self.state.pop(meeting_id, None)
        self.history.pop(meeting_id, None)
        peers = list(room.values())
        await asyncio.gather(*(self._send(p, {"type": "meeting_ended"}) for p in peers))
        for peer in peers:
            try:
                await peer.websocket.close(code=CLOSE_MEETING_ENDED)
            except Exception:
                pass

    async def mute_all(self, meeting_id: str, except_client_id: str | None = None) -> None:
        room = self.rooms.get(meeting_id, {})
        targets = [p for p in room.values() if p.joined and not p.can_moderate and p.client_id != except_client_id]
        for p in targets:
            p.info["is_muted"] = True
        await asyncio.gather(*(self._send(p, {"type": "force_mute"}) for p in targets))
        if targets:
            await self.broadcast(meeting_id, {"type": "participants_muted", "client_ids": [p.client_id for p in targets]})

    async def kick(self, peer: Peer, message_type: str, code: int) -> None:
        await self._send(peer, {"type": message_type})
        try:
            await peer.websocket.close(code=code)
        except Exception:
            pass

    async def remove_participant(self, meeting_id: str, participant_id: int) -> bool:
        peer = self.find_by_participant_id(meeting_id, participant_id)
        if not peer:
            return False
        await self.kick(peer, "removed", CLOSE_REMOVED)
        return True


manager = ConnectionManager()
