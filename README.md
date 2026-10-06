# Confera — Zoom-style video meetings

Next.js (App Router) frontend + FastAPI backend. Media is peer-to-peer WebRTC; the backend only does
signaling (WebSocket), meeting records (Postgres/SQLite) and host-only actions. Hosts sign in with Clerk;
**anyone with a meeting link can join as a guest without an account**.

```
Browser A ──┐                         ┌── Browser B
            │  WebRTC media (P2P, or relayed by TURN)
            └─────────────────────────┘
   │ wss://  signaling + roster + chat                │
   └──────────────► FastAPI  (/ws/meetings/{id}) ◄─────┘
                    REST  /api/meetings, /api/ice-servers  ──► Postgres
```

## Meeting flow

1. Signed-in user creates a meeting on the dashboard → gets a **9-digit ID and an absolute link**
   (`https://<your-frontend>/meeting/123456789`). Copy it from the "Meeting ready" dialog, a meeting card,
   or the 🔗 chip inside the call.
2. Anyone opens the link (incognito, another browser, another device) → **lobby** with camera/mic preview,
   name field, permission errors with *Try again*, then **Join**.
3. In the room: mic, camera, screen share, participants (host can mute all / remove), chat, local
   recording, leave. The host can *End meeting for all*.
4. Leaving/closing the tab removes the participant for everyone within seconds (socket close, plus a
   heartbeat for silent network drops). Refreshing returns to the lobby and rejoins as the same name.
5. Network blips: peers keep talking P2P; the socket reconnects with backoff, the server rebuilds the
   roster, and ICE restarts automatically if the media path failed.

## Features

| Area | What you get |
| --- | --- |
| Joining | Shareable link, guests join without an account, lobby with camera/mic preview, device pickers, mic level meter, permission-error recovery |
| Security | **Waiting room** (admit / deny / admit all), **passcode** (hashed), **meeting lock**, signed join tickets (identity and role are decided by the server), WebSocket origin check, rate limits |
| Roles | Host, **co-hosts** (appointed by the host), guests. Moderators can admit, mute one/all, remove, lock, toggle the waiting room |
| In the call | Mic, camera, screen share, **raise hand**, **reactions**, **pin** and **speaker view**, active-speaker highlight, **live captions**, **background blur**, local recording |
| Chat | Public chat with history for late joiners, **private messages**, **file sharing** (up to 10 MB, deleted when the meeting ends) |
| Devices | Switch camera / microphone / speaker mid-call without rejoining |
| Reliability | Reconnect with backoff, heartbeat, ICE restart, refresh/rejoin, recovery after a backend restart |

## Configuration

### Backend (`backend/.env.example`)

| Variable | Purpose |
| --- | --- |
| `CLERK_ISSUER_DOMAIN` | Verifies host JWTs (required) |
| `ALLOWED_ORIGINS` | Exact frontend origin(s), comma separated, e.g. `https://app.example.com`. Used for CORS **and** the WebSocket origin check |
| `ALLOWED_ORIGIN_REGEX` | Optional, e.g. Vercel previews |
| `SECRET_KEY` | Signs join tickets. **Set a long random value in production**; otherwise a key is derived from other settings |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Where shared files live (default `backend/uploads`, 10 MB). Files are deleted when the meeting ends; on hosts with an ephemeral disk they also vanish on restart |
| `DATABASE_URL` | Postgres in production (`postgres://` is accepted). SQLite when unset |
| `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`/`TURN_CREDENTIAL` **or** `TURN_SECRET` | ICE servers handed to browsers via `GET /api/ice-servers` |

### Frontend (`frontend/.env.example`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| `NEXT_PUBLIC_BACKEND_URL` | Public **https** URL of the backend. The WebSocket URL is derived from it (`https` → `wss`) |
| `NEXT_PUBLIC_APP_URL` | Optional; only if the public app URL differs from the browser origin |

`NEXT_PUBLIC_*` values are baked in at build time: **rebuild after changing them**.

## Deploying (e.g. Vercel + Render)

1. **Backend** (Render web service, start command
   `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers`): set `DATABASE_URL`,
   `CLERK_ISSUER_DOMAIN`, `ALLOWED_ORIGINS=https://<your-vercel-domain>`, and TURN settings.
   **Run exactly one worker/instance**: room state is in memory (see Limitations).
2. **Frontend** (Vercel): set the Clerk keys and `NEXT_PUBLIC_BACKEND_URL=https://<your-backend>`; deploy.
   Do not rely on Vercel rewrites for WebSockets, which is why the browser talks to the backend directly.
3. **TURN is required for real-world reliability.** STUN alone fails for users behind symmetric NATs or
   corporate firewalls (typically 10–20% of users). Run [coturn](https://github.com/coturn/coturn)
   (use `use-auth-secret` + `static-auth-secret=<TURN_SECRET>`) or a hosted TURN provider, and expose
   `turn:` on UDP/TCP 3478 and `turns:` on 5349/443. Check `GET /api/ice-servers` → `"hasTurn": true`.
4. HTTPS is mandatory: browsers only allow camera/microphone on `https://` (or `localhost`).

## Local development

```bash
# backend (from the repo root)
python -m venv backend/venv && backend/venv/Scripts/pip install -r backend/requirements.txt   # Windows
backend/venv/Scripts/python -m uvicorn backend.main:app --port 8010

# frontend
cd frontend && npm install
# frontend/.env.local:  NEXT_PUBLIC_BACKEND_URL=http://localhost:8010   (and the Clerk keys)
npm run dev
```

Set `ALLOWED_ORIGINS` in `backend/.env` to the frontend origin you use locally.

## Tests

```bash
# server: rooms, signaling relay, cleanup, host-only actions, ICE config (fast, no browser)
pip install -r backend/requirements-dev.txt && python -m pytest backend/tests

# full browser test: several separate Chrome processes join the same link and exchange real
# audio/video over WebRTC (mute/camera/screen share, 3 users, leave, refresh, network blip)
cd e2e && npm install
python ../e2e/create_meeting.py                      # local only: prints a meeting id
APP_URL=https://your-app.example.com MEETING_ID=<id> node meeting.e2e.mjs

# feature test: passcode, waiting room, lock, co-host, moderation, hand/reactions/pin, private chat,
# file sharing, devices, background blur. It needs a host: the helper mints a host-role ticket with the
# server's own signing code (so no Clerk login is needed locally).
python ../e2e/create_meeting.py --json --waiting-room --passcode abcd --host-name Alice
APP_URL=http://localhost:3000 MEETING_ID=<meeting_id> HOST_TICKET=<host_ticket> node features.e2e.mjs
```

For a deployed app, create the meeting in the UI and pass its ID as `MEETING_ID`.
Set `BACKEND_RESTART_SIGNAL=<path>` to also test recovery from a backend restart (see the script header).
The test replaces the camera with a synthetic canvas stream by default because some Chrome builds ship a
broken fake camera; set `SYNTHETIC_CAMERA=0` to use Chrome's own.

## Limitations

- **Not built (needs a different architecture or a paid service):** breakout rooms, cloud recording
  (recording is local to the recorder's device), virtual-background *images* (blur only), transferring host
  ownership to another account (you can appoint co-hosts; only the account that created the meeting can
  end it for everyone), and meetings larger than ~8 people (needs an SFU such as LiveKit).
- **Captions** use the browser's built-in speech recognition (Chrome, Edge, Safari), so quality and
  languages depend on the browser; Firefox has none.

- **Single backend process.** Room state lives in memory. Scaling out needs a shared pub/sub layer
  (e.g. Redis) behind `ConnectionManager`.
- **Mesh topology.** Every participant connects to every other, which is great up to ~6–8 people. Larger
  meetings need an SFU (LiveKit, mediasoup).
- Screen sharing sends video only (no system audio) and is unavailable on most mobile browsers (the
  button is disabled there). Local recording is desktop-only.
