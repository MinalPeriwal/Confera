"""Room logic shared by the WebSocket handler and the REST routers (DB + in-memory room state)."""
from starlette.concurrency import run_in_threadpool

from . import crud, models
from .connection_manager import Peer, manager
from .database import SessionLocal

MAX_NAME_LENGTH = 60


# ── sync DB helpers (run in a threadpool) ───────────────────────────────────

def load_room_flags(meeting_id: str, participant_id: int) -> dict | None:
    db = SessionLocal()
    try:
        meeting = crud.get_meeting(db, meeting_id)
        if not meeting:
            return None
        participant = db.get(models.Participant, participant_id)
        if not participant or participant.meeting_id != meeting.id:
            return None
        return {
            "status": meeting.status,
            "locked": bool(meeting.locked),
            "waiting_room": bool(meeting.waiting_room),
            "admitted": bool(participant.admitted),
            "is_cohost": bool(participant.is_cohost),
        }
    finally:
        db.close()


def set_participant_flag(participant_id: int, **fields) -> None:
    db = SessionLocal()
    try:
        participant = db.get(models.Participant, participant_id)
        if participant:
            for key, value in fields.items():
                setattr(participant, key, value)
            db.commit()
    finally:
        db.close()


def set_meeting_flags(meeting_id: str, **fields) -> None:
    db = SessionLocal()
    try:
        meeting = crud.get_meeting(db, meeting_id)
        if meeting:
            for key, value in fields.items():
                setattr(meeting, key, value)
            db.commit()
    finally:
        db.close()


def mark_left(participant_id: int) -> None:
    db = SessionLocal()
    try:
        crud.leave_participant(db, participant_id)
    finally:
        db.close()


# ── async room operations ───────────────────────────────────────────────────

async def complete_join(meeting_id: str, peer: Peer, media: dict) -> None:
    """Make `peer` a full participant: send it the roster/state/chat history and announce it."""
    peer.waiting = False
    already_joined = peer.joined
    peer.joined = True
    peer.info.update({
        "is_muted": bool(media.get("is_muted")),
        "camera_enabled": bool(media.get("camera_enabled")),
        "is_screen_sharing": bool(media.get("is_screen_sharing")),
        "hand_raised": bool(peer.info.get("hand_raised")),
    })
    await manager.send_to_peer(peer, {
        "type": "joined",
        "client_id": peer.client_id,
        "you": {"is_host": peer.is_host, "is_cohost": peer.is_cohost},
        "participants": manager.roster(meeting_id, exclude_client_id=peer.client_id),
        "state": manager.room_state(meeting_id),
        "chat_history": manager.chat_history(meeting_id),
    })
    await manager.broadcast(
        meeting_id,
        {"type": "participant_updated" if already_joined else "participant_joined", "participant": peer.public_info()},
        exclude_client_id=peer.client_id,
    )
    if peer.can_moderate:
        await manager.send_to_peer(peer, {"type": "waiting_list", "participants": manager.waiting_list(meeting_id)})


async def handle_join(meeting_id: str, peer: Peer, data: dict) -> None:
    flags = await run_in_threadpool(load_room_flags, meeting_id, peer.participant_id)
    if flags is None:
        await manager.kick(peer, "meeting_ended", 4404)
        return
    peer.is_cohost = flags["is_cohost"]
    manager.state[meeting_id] = {"locked": flags["locked"], "waiting_room": flags["waiting_room"]}
    must_wait = flags["waiting_room"] and not peer.is_host and not flags["admitted"]
    if must_wait:
        peer.waiting = True
        peer.pending_join = data
        await manager.send_to_peer(peer, {"type": "waiting"})
        await manager.push_waiting_list(meeting_id)
        return
    await complete_join(meeting_id, peer, data)


async def admit(meeting_id: str, peer: Peer) -> None:
    if not peer.waiting or peer.joined:
        return
    await run_in_threadpool(set_participant_flag, peer.participant_id, admitted=True)
    await complete_join(meeting_id, peer, peer.pending_join)
    await manager.push_waiting_list(meeting_id)


async def deny(meeting_id: str, peer: Peer) -> None:
    if not peer.waiting:
        return
    await manager.kick(peer, "denied", 4405)
    await manager.push_waiting_list(meeting_id)


async def apply_settings(meeting_id: str, *, locked: bool | None = None, waiting_room: bool | None = None) -> None:
    """Persist + broadcast lock / waiting-room changes. Turning the waiting room off admits everyone waiting."""
    state = manager.state.setdefault(meeting_id, manager.room_state(meeting_id))
    changes = {}
    if locked is not None:
        state["locked"] = changes["locked"] = locked
    if waiting_room is not None:
        state["waiting_room"] = changes["waiting_room"] = waiting_room
    if changes:
        await run_in_threadpool(set_meeting_flags, meeting_id, **changes)
    await manager.broadcast(meeting_id, {"type": "meeting_state", "state": dict(state)})
    if waiting_room is False:
        for waiting_peer in manager.waiting(meeting_id):
            await admit(meeting_id, waiting_peer)


async def set_cohost(meeting_id: str, target: Peer, value: bool) -> None:
    target.is_cohost = value
    await run_in_threadpool(set_participant_flag, target.participant_id, is_cohost=value)
    await manager.broadcast(meeting_id, {
        "type": "participant_updated", "participant": {"client_id": target.client_id, "is_cohost": value},
    })
    if value and target.joined:
        await manager.send_to_peer(target, {"type": "waiting_list", "participants": manager.waiting_list(meeting_id)})
