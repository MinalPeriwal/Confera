from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..connection_manager import manager

router = APIRouter()

# Signaling message types that must be relayed only to their intended target peer
TARGETED_TYPES = {"offer", "answer", "ice_candidate"}

@router.websocket("/{meeting_id}")
async def meeting_websocket(websocket: WebSocket, meeting_id: str):
    client_id: str | None = None
    participant_id = None

    # We need the client_id before accepting so we can register it in the manager.
    # We'll accept first, then read the first message which must be the registration/join.
    await manager.connect(websocket, meeting_id, client_id=None)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            # First message from a new client should include their client_id.
            # We lazily register once we see it.
            if client_id is None and data.get("client_id"):
                client_id = data["client_id"]
                if meeting_id not in manager.client_sockets:
                    manager.client_sockets[meeting_id] = {}
                manager.client_sockets[meeting_id][client_id] = websocket

            if msg_type == "participant_joined":
                participant_id = data.get("participant", {}).get("id")
                # Broadcast join to all other participants
                await manager.broadcast(data, meeting_id, exclude=websocket)

            elif msg_type == "participant_left":
                participant_id = data.get("participant_id")
                await manager.broadcast(data, meeting_id, exclude=websocket)

            elif msg_type in TARGETED_TYPES:
                # WebRTC signaling: relay only to the intended peer
                to_client = data.get("to")
                if to_client:
                    await manager.send_to(data, meeting_id, to_client)

            else:
                # All other messages (participant_updated, chat, etc.) are broadcast
                await manager.broadcast(data, meeting_id, exclude=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, meeting_id, client_id=client_id)
        # Notify others about the unexpected disconnect
        if participant_id:
            await manager.broadcast({
                "type": "participant_left",
                "participant_id": participant_id
            }, meeting_id)
