from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Maps meeting_id -> list of active WebSockets (for broadcast)
        self.active_connections: dict[str, list[WebSocket]] = {}
        # Maps meeting_id -> {client_id: WebSocket} (for targeted relay)
        self.client_sockets: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str, client_id: str | None = None):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)

        if client_id:
            if meeting_id not in self.client_sockets:
                self.client_sockets[meeting_id] = {}
            self.client_sockets[meeting_id][client_id] = websocket

    def disconnect(self, websocket: WebSocket, meeting_id: str, client_id: str | None = None):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]

        if client_id and meeting_id in self.client_sockets:
            self.client_sockets[meeting_id].pop(client_id, None)
            if not self.client_sockets[meeting_id]:
                del self.client_sockets[meeting_id]

    async def send_to(self, message: dict, meeting_id: str, client_id: str):
        """Send a message to a specific client in the meeting."""
        target = self.client_sockets.get(meeting_id, {}).get(client_id)
        if target:
            try:
                await target.send_json(message)
            except Exception:
                pass

    async def broadcast(self, message: dict, meeting_id: str, exclude: WebSocket | None = None):
        """Broadcast a message to all clients in the meeting, optionally excluding one."""
        if meeting_id in self.active_connections:
            for connection in self.active_connections[meeting_id]:
                if connection != exclude:
                    try:
                        await connection.send_json(message)
                    except Exception:
                        pass

manager = ConnectionManager()
