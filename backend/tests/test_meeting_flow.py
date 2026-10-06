"""Server-side tests: rooms, tickets, signaling relay, waiting room, lock, passcode, roles, chat, files,
cleanup and host-only actions.   Run from the repository root:  python -m pytest backend/tests
"""
import os
import tempfile
from contextlib import contextmanager

import pytest

_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db_file.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_db_file.name}"
os.environ["ALLOWED_ORIGINS"] = "https://app.example.com"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp()
os.environ["DISABLE_RATE_LIMIT"] = "1"
os.environ.pop("ALLOWED_ORIGIN_REGEX", None)

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from backend import crud, models, schemas  # noqa: E402
from backend.auth import get_current_user  # noqa: E402
from backend.connection_manager import manager  # noqa: E402
from backend.database import SessionLocal  # noqa: E402
from backend.main import app  # noqa: E402
from backend.security import make_ticket  # noqa: E402


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def host(db):
    return crud.get_user_by_clerk_id(db, "host_1") or crud.create_user(
        db, schemas.UserCreate(clerk_id="host_1", email=None, name="Host")
    )


@pytest.fixture()
def other_user(db):
    return crud.get_user_by_clerk_id(db, "other_1") or crud.create_user(
        db, schemas.UserCreate(clerk_id="other_1", email=None, name="Other")
    )


@pytest.fixture()
def meeting(db, host):
    return crud.create_meeting(db, schemas.MeetingCreate(instant=True, host_name="Host", title="t"), host_id=host.id)


@pytest.fixture()
def client():
    manager.rooms.clear()
    manager.state.clear()
    manager.history.clear()
    with TestClient(app) as c:  # one shared event loop, like production
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def connect(client, db):
    """connect(meeting, client_id, name, host=False, admitted=True) -> context manager yielding (ws, participant)."""

    @contextmanager
    def _connect(meeting, client_id, name="Guest", host=False, admitted=True, ticket=None):
        p = crud.create_participant(
            db, meeting.id, schemas.ParticipantCreate(display_name=name, is_host=host), admitted=admitted
        )
        t = ticket if ticket is not None else make_ticket(meeting.meeting_id, p.id, name, host)
        with client.websocket_connect(f"/ws/meetings/{meeting.meeting_id}?client_id={client_id}&ticket={t}") as ws:
            yield ws, p

    return _connect


def join(ws, **media):
    ws.send_json({"type": "join", **media})
    msg = ws.receive_json()
    assert msg["type"] == "joined", msg
    if msg["you"]["is_host"] or msg["you"]["is_cohost"]:
        assert ws.receive_json()["type"] == "waiting_list"  # moderators always get the current waiting list
    return msg


# ── rooms, tickets, signaling ───────────────────────────────────────────────

def test_two_clients_share_a_room_and_see_each_other(meeting, connect):
    with connect(meeting, "client-aaaa", "Alice") as (a, pa):
        joined = join(a)
        assert joined["participants"] == [] and joined["you"] == {"is_host": False, "is_cohost": False}
        with connect(meeting, "client-bbbb", "Bob") as (b, pb):
            roster = join(b)["participants"]
            assert [p["display_name"] for p in roster] == ["Alice"] and roster[0]["id"] == pa.id
            msg = a.receive_json()
            assert msg["type"] == "participant_joined"
            assert msg["participant"]["client_id"] == "client-bbbb" and msg["participant"]["id"] == pb.id


def test_meeting_id_with_spaces_resolves_to_same_room(client, meeting, connect, db):
    spaced = " ".join([meeting.meeting_id[:3], meeting.meeting_id[3:6], meeting.meeting_id[6:]])
    with connect(meeting, "client-aaaa", "Alice") as (a, _):
        join(a)
        p = crud.create_participant(db, meeting.id, schemas.ParticipantCreate(display_name="Bob"))
        t = make_ticket(meeting.meeting_id, p.id, "Bob", False)
        with client.websocket_connect(f"/ws/meetings/{spaced}?client_id=client-bbbb&ticket={t}") as b:
            assert len(join(b)["participants"]) == 1


def test_websocket_requires_a_valid_ticket(meeting, connect):
    for bad in ("", "garbage", "abc.def"):
        with connect(meeting, "client-aaaa", ticket=bad) as (ws, _):
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == 4401


def test_ticket_for_another_meeting_is_rejected(db, host, meeting, connect):
    other = crud.create_meeting(db, schemas.MeetingCreate(instant=True, host_name="H", title="o"), host_id=host.id)
    foreign = make_ticket(other.meeting_id, 1, "Mallory", True)
    with connect(meeting, "client-aaaa", ticket=foreign) as (ws, _):
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401


def test_identity_and_role_come_from_the_ticket_not_the_client(meeting, connect):
    with connect(meeting, "client-aaaa", "Alice") as (a, _), connect(meeting, "client-bbbb", "Bob") as (b, _):
        join(a)
        join(b, display_name="Mallory", is_host=True, is_cohost=True); a.receive_json()
        b.send_json({"type": "update", "is_host": True, "display_name": "Mallory"})
        upd = a.receive_json()
        assert upd["participant"] == {"client_id": "client-bbbb"}  # unknown fields are dropped
        a.send_json({"type": "ping"}); a.receive_json()
        with connect(meeting, "client-cccc", "Carol") as (c, _):
            roster = {p["client_id"]: p for p in join(c)["participants"]}
            assert roster["client-bbbb"]["display_name"] == "Bob" and roster["client-bbbb"]["is_host"] is False


def test_signaling_is_relayed_only_to_target_and_sender_is_stamped(meeting, connect):
    with connect(meeting, "client-aaaa", "A") as (a, _), connect(meeting, "client-bbbb", "B") as (b, _), \
         connect(meeting, "client-cccc", "C") as (c, _):
        join(a)
        join(b); a.receive_json()
        join(c); a.receive_json(); b.receive_json()
        a.send_json({"type": "offer", "to": "client-bbbb", "from": "client-cccc", "sdp": "v=0"})
        got = b.receive_json()
        assert got["type"] == "offer" and got["from"] == "client-aaaa"
        b.send_json({"type": "ice_candidate", "to": "client-aaaa", "candidate": {"candidate": "x"}})
        assert a.receive_json()["type"] == "ice_candidate"
        a.send_json({"type": "chat_message", "text": "hi all"})
        assert c.receive_json()["type"] == "chat_message"  # C never saw the offer / candidate


def test_state_updates_broadcast_and_late_joiner_sees_current_state(meeting, connect):
    with connect(meeting, "client-aaaa", "Alice") as (a, _), connect(meeting, "client-bbbb", "Bob") as (b, _):
        join(a)
        join(b); a.receive_json()
        a.send_json({"type": "update", "is_muted": True, "is_screen_sharing": True, "hand_raised": True})
        upd = b.receive_json()
        assert upd["participant"] == {"client_id": "client-aaaa", "is_muted": True, "is_screen_sharing": True, "hand_raised": True}
        with connect(meeting, "client-cccc", "Carol") as (c, _):
            roster = {p["client_id"]: p for p in join(c)["participants"]}
            assert roster["client-aaaa"]["is_screen_sharing"] and roster["client-aaaa"]["hand_raised"]


def test_disconnect_removes_participant_and_marks_db_left(client, meeting, connect, db):
    with connect(meeting, "client-aaaa", "Alice") as (a, _):
        join(a)
        with connect(meeting, "client-bbbb", "Bob") as (b, pb):
            join(b); a.receive_json()
        left = a.receive_json()
        assert left == {"type": "participant_left", "client_id": "client-bbbb", "participant_id": pb.id}
    db.expire_all()
    assert db.get(models.Participant, pb.id).left_at is not None
    assert manager.rooms == {}


def test_reconnect_with_same_client_id_replaces_old_socket_silently(meeting, connect):
    with connect(meeting, "client-aaaa", "Alice") as (a, _):
        join(a)
        with connect(meeting, "client-bbbb", "Bob") as (b1, pb):
            join(b1); a.receive_json()
            t = make_ticket(meeting.meeting_id, pb.id, "Bob", False)
            with connect(meeting, "client-bbbb", "Bob", ticket=t) as (b2, _):
                roster = join(b2)["participants"]
                assert [p["client_id"] for p in roster] == ["client-aaaa"]
                with pytest.raises(WebSocketDisconnect) as exc:
                    b1.receive_json()
                assert exc.value.code == 4409
                assert a.receive_json()["type"] == "participant_updated"  # never a "left"
        assert a.receive_json()["type"] == "participant_left"


def test_unknown_and_ended_meetings_are_rejected_with_close_codes(client, meeting, db):
    with client.websocket_connect("/ws/meetings/999999999?client_id=client-aaaa&ticket=x") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4404
    meeting.status = "ended"
    db.commit()
    with client.websocket_connect(f"/ws/meetings/{meeting.meeting_id}?client_id=client-aaaa&ticket=x") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4410
    assert client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "Late"}).status_code == 410


def test_websocket_from_disallowed_origin_is_rejected(client, meeting, db):
    p = crud.create_participant(db, meeting.id, schemas.ParticipantCreate(display_name="A"))
    t = make_ticket(meeting.meeting_id, p.id, "A", False)
    url = f"/ws/meetings/{meeting.meeting_id}?client_id=client-aaaa&ticket={t}"
    with pytest.raises(Exception):
        with client.websocket_connect(url, headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()
    with client.websocket_connect(url, headers={"origin": "https://app.example.com"}) as ws:
        join(ws)


# ── REST join: guests, passcode, lock ───────────────────────────────────────

def test_guest_can_fetch_and_join_without_auth_and_gets_a_ticket(client, meeting):
    assert client.get(f"/api/meetings/{meeting.meeting_id}").status_code == 200
    r = client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "Guest", "is_host": True})
    body = r.json()
    assert r.status_code == 200 and body["is_host"] is False and body["participant"]["is_host"] is False
    assert body["ticket"]


def test_host_is_recognised_server_side_on_join(client, meeting, host):
    from backend.auth import get_optional_user
    app.dependency_overrides[get_optional_user] = lambda: host
    assert client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "H"}).json()["is_host"] is True


def test_passcode_is_required_hashed_and_never_returned(client, db, host):
    m = crud.create_meeting(db, schemas.MeetingCreate(instant=True, host_name="H", title="p", passcode="s3cret"), host_id=host.id)
    assert m.passcode_hash and "s3cret" not in m.passcode_hash
    body = client.get(f"/api/meetings/{m.meeting_id}").json()
    assert body["has_passcode"] is True and "passcode" not in body and "passcode_hash" not in body
    assert client.post(f"/api/meetings/{m.meeting_id}/join", json={"display_name": "G"}).status_code == 403
    assert client.post(f"/api/meetings/{m.meeting_id}/join", json={"display_name": "G", "passcode": "nope"}).status_code == 403
    assert client.post(f"/api/meetings/{m.meeting_id}/join", json={"display_name": "G", "passcode": "s3cret"}).status_code == 200


def test_locked_meeting_rejects_new_guests(client, meeting, db):
    meeting.locked = True
    db.commit()
    r = client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "G"})
    assert r.status_code == 423


# ── waiting room & moderation ───────────────────────────────────────────────

def test_waiting_room_holds_guests_until_admitted(meeting, connect, db):
    meeting.waiting_room = True
    db.commit()
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _):
        assert join(h)["you"]["is_host"] is True
        with connect(meeting, "client-gggg", "Guest", admitted=False) as (g, pg):
            g.send_json({"type": "join"})
            assert g.receive_json() == {"type": "waiting"}
            assert h.receive_json() == {"type": "waiting_list", "participants": [{"client_id": "client-gggg", "display_name": "Guest"}]}
            # a waiting guest cannot chat, signal or see anyone
            g.send_json({"type": "chat_message", "text": "let me in"})
            g.send_json({"type": "ping"})
            assert g.receive_json() == {"type": "pong"}
            h.send_json({"type": "admit", "client_id": "client-gggg"})
            joined = g.receive_json()
            assert joined["type"] == "joined" and [p["client_id"] for p in joined["participants"]] == ["client-hhhh"]
            assert h.receive_json()["type"] == "participant_joined"
    db.expire_all()
    assert db.get(models.Participant, pg.id).admitted is True


def test_waiting_guest_can_be_denied_and_a_guest_cannot_admit(meeting, connect, db):
    meeting.waiting_room = True
    db.commit()
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _),          connect(meeting, "client-gggg", "G1", admitted=False) as (g1, _),          connect(meeting, "client-iiii", "G2", admitted=True) as (g2, _):
        join(h)
        g1.send_json({"type": "join"})
        assert g1.receive_json() == {"type": "waiting"}
        join(g2)  # already admitted: straight in
        g2.send_json({"type": "admit", "client_id": "client-gggg"})  # an unprivileged guest cannot admit
        g2.send_json({"type": "ping"})
        assert g2.receive_json() == {"type": "pong"}
        h.send_json({"type": "deny", "client_id": "client-gggg"})
        assert g1.receive_json() == {"type": "denied"}
        with pytest.raises(WebSocketDisconnect) as exc:
            g1.receive_json()
        assert exc.value.code == 4405


def test_waiting_room_off_for_host_and_previously_admitted_guest(meeting, connect, db):
    meeting.waiting_room = True
    db.commit()
    with connect(meeting, "client-gggg", "Returning", admitted=True) as (g, _):
        assert join(g)["type"] == "joined"  # admitted earlier (e.g. reconnecting): no second wait


def test_turning_waiting_room_off_admits_everyone_waiting(meeting, connect, db):
    meeting.waiting_room = True
    db.commit()
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _), connect(meeting, "client-gggg", "G", admitted=False) as (g, _):
        join(h)
        g.send_json({"type": "join"}); g.receive_json(); h.receive_json()
        h.send_json({"type": "set_waiting_room", "enabled": False})
        joined = g.receive_json()  # waiting guests are admitted straight into the room, state included
        assert joined["type"] == "joined" and joined["state"]["waiting_room"] is False


def test_lock_via_websocket_persists_and_blocks_new_joins(client, meeting, connect, db):
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _), connect(meeting, "client-gggg", "G") as (g, _):
        join(h); join(g); h.receive_json()
        h.send_json({"type": "set_lock", "locked": True})
        assert h.receive_json() == {"type": "meeting_state", "state": {"locked": True, "waiting_room": False}}
        assert g.receive_json()["type"] == "meeting_state"
        g.send_json({"type": "set_lock", "locked": False}); g.send_json({"type": "ping"})
        assert g.receive_json() == {"type": "pong"}  # a guest cannot unlock
    db.expire_all()
    assert db.get(models.Meeting, meeting.id).locked is True
    assert client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "Late"}).status_code == 423


def test_cohost_can_moderate_and_only_host_can_promote(meeting, connect):
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _), connect(meeting, "client-cccc", "Co") as (c, _), \
         connect(meeting, "client-gggg", "G") as (g, _):
        join(h); join(c); h.receive_json(); join(g); h.receive_json(); c.receive_json()
        g.send_json({"type": "make_cohost", "client_id": "client-gggg", "value": True})  # guest cannot promote
        c.send_json({"type": "make_cohost", "client_id": "client-gggg", "value": True})  # neither can a co-host
        h.send_json({"type": "make_cohost", "client_id": "client-cccc", "value": True})
        for ws in (h, c, g):
            msg = ws.receive_json()
            assert msg == {"type": "participant_updated", "participant": {"client_id": "client-cccc", "is_cohost": True}}
        assert c.receive_json()["type"] == "waiting_list"  # newly promoted: gets the waiting list
        c.send_json({"type": "mute_peer", "client_id": "client-gggg"})
        assert g.receive_json() == {"type": "force_mute"}
        c.send_json({"type": "remove", "client_id": "client-hhhh"})  # nobody can remove the host
        c.send_json({"type": "remove", "client_id": "client-gggg"})
        assert g.receive_json() == {"type": "removed"}


def test_host_mute_all_spares_moderators_and_remove_participant_via_rest(client, meeting, host, connect):
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _), connect(meeting, "client-gggg", "G") as (g, pg):
        join(h); join(g); h.receive_json()
        app.dependency_overrides[get_current_user] = lambda: host
        assert client.post(f"/api/meetings/{meeting.meeting_id}/mute-all").status_code == 200
        assert g.receive_json() == {"type": "force_mute"}
        assert g.receive_json()["type"] == "participants_muted"
        assert h.receive_json()["type"] == "participants_muted"  # the host itself was not muted
        assert client.delete(f"/api/meetings/{meeting.meeting_id}/participants/{pg.id}").status_code == 204
        assert g.receive_json() == {"type": "removed"}


def test_host_actions_require_the_host(client, meeting, other_user):
    assert client.patch(f"/api/meetings/{meeting.meeting_id}/end").status_code in (401, 403)
    assert client.patch(f"/api/meetings/{meeting.meeting_id}/settings", json={"locked": True}).status_code in (401, 403)
    app.dependency_overrides[get_current_user] = lambda: other_user
    for call in (
        lambda: client.patch(f"/api/meetings/{meeting.meeting_id}/end"),
        lambda: client.post(f"/api/meetings/{meeting.meeting_id}/mute-all"),
        lambda: client.delete(f"/api/meetings/{meeting.meeting_id}/participants/1"),
        lambda: client.patch(f"/api/meetings/{meeting.meeting_id}/settings", json={"locked": True}),
    ):
        assert call().status_code == 403


def test_host_settings_endpoint_updates_db_and_live_room(client, meeting, host, connect, db):
    with connect(meeting, "client-gggg", "G") as (g, _):
        join(g)
        app.dependency_overrides[get_current_user] = lambda: host
        r = client.patch(f"/api/meetings/{meeting.meeting_id}/settings", json={"locked": True, "waiting_room": True, "passcode": "abcd"})
        assert r.status_code == 200 and r.json()["has_passcode"] and r.json()["locked"] and r.json()["waiting_room"]
        assert g.receive_json() == {"type": "meeting_state", "state": {"locked": True, "waiting_room": True}}
        r = client.patch(f"/api/meetings/{meeting.meeting_id}/settings", json={"clear_passcode": True})
        assert r.json()["has_passcode"] is False


def test_host_end_meeting_notifies_everyone_including_waiting_guests(client, meeting, host, connect, db):
    meeting.waiting_room = True
    db.commit()
    with connect(meeting, "client-hhhh", "Host", host=True) as (h, _), connect(meeting, "client-gggg", "W", admitted=False) as (w, _):
        join(h)
        w.send_json({"type": "join"}); w.receive_json(); h.receive_json()
        app.dependency_overrides[get_current_user] = lambda: host
        assert client.patch(f"/api/meetings/{meeting.meeting_id}/end").status_code == 200
        for ws in (h, w):
            assert ws.receive_json() == {"type": "meeting_ended"}
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == 4410


# ── chat, reactions, captions, files ────────────────────────────────────────

def test_chat_is_stamped_truncated_private_and_has_history(meeting, connect):
    with connect(meeting, "client-aaaa", "Alice") as (a, _), connect(meeting, "client-bbbb", "Bob") as (b, _), \
         connect(meeting, "client-cccc", "Carol") as (c, _):
        join(a); join(b); a.receive_json(); join(c); a.receive_json(); b.receive_json()
        b.send_json({"type": "meeting_ended"})  # ignored
        a.send_json({"type": "chat_message", "sender": "Mallory", "text": "x" * 5000})
        for ws in (b, c):
            msg = ws.receive_json()
            assert msg["type"] == "chat_message" and msg["sender"] == "Alice" and len(msg["text"]) == 2000
        a.send_json({"type": "chat_message", "to": "client-bbbb", "text": "psst"})
        got = b.receive_json()
        assert got["private"] is True and got["text"] == "psst"
        c.send_json({"type": "ping"})
        assert c.receive_json() == {"type": "pong"}  # Carol did not get the private message
        with connect(meeting, "client-dddd", "Dave") as (d, _):
            history = join(d)["chat_history"]
            assert [m["text"] for m in history] == ["x" * 2000]  # private messages are not in history


def test_chat_attachment_shape_is_validated(meeting, connect):
    with connect(meeting, "client-aaaa", "A") as (a, _), connect(meeting, "client-bbbb", "B") as (b, _):
        join(a); join(b); a.receive_json()
        a.send_json({"type": "chat_message", "text": "", "attachment": {"name": "x", "url": "https://evil.example/x", "size": 1}})
        a.send_json({"type": "chat_message", "text": "ok", "attachment": {"name": "f.txt", "url": "/api/meetings/1/files/abc", "size": 3}})
        msg = b.receive_json()
        assert msg["text"] == "ok" and msg["attachment"]["name"] == "f.txt"  # the bad one was dropped


def test_reactions_and_captions(meeting, connect):
    with connect(meeting, "client-aaaa", "A") as (a, _), connect(meeting, "client-bbbb", "B") as (b, _):
        join(a); join(b); a.receive_json()
        a.send_json({"type": "reaction", "emoji": "🎉"})
        assert b.receive_json() == {"type": "reaction", "client_id": "client-aaaa", "emoji": "🎉"}
        a.send_json({"type": "reaction", "emoji": "💣"})  # not in the allow-list
        a.send_json({"type": "caption", "text": "hello there", "final": True})
        assert b.receive_json() == {"type": "caption", "client_id": "client-aaaa", "sender": "A", "text": "hello there", "final": True}


def test_chat_flood_is_rate_limited(meeting, connect):
    with connect(meeting, "client-aaaa", "A") as (a, _), connect(meeting, "client-bbbb", "B") as (b, _):
        join(a); join(b); a.receive_json()
        for i in range(40):
            a.send_json({"type": "chat_message", "text": f"spam {i}"})
        a.send_json({"type": "ping"}); a.receive_json()
        received = 0
        b.send_json({"type": "ping"})
        while (m := b.receive_json())["type"] != "pong":
            received += 1
        assert 5 <= received <= 15  # burst allowance only, the rest dropped


def test_file_upload_requires_ticket_enforces_size_and_downloads_safely(client, meeting, db):
    p = crud.create_participant(db, meeting.id, schemas.ParticipantCreate(display_name="A"))
    ticket = make_ticket(meeting.meeting_id, p.id, "A", False)
    url = f"/api/meetings/{meeting.meeting_id}/files"
    assert client.post(url, files={"file": ("a.txt", b"hi")}).status_code == 401
    r = client.post(url, files={"file": ("../../evil name.html", b"<script>1</script>")}, headers={"X-Meeting-Ticket": ticket})
    assert r.status_code == 200
    body = r.json()
    assert body["size"] == 18 and "/" not in body["name"] and ".." not in body["name"]
    dl = client.get(body["url"])
    assert dl.status_code == 200 and dl.content == b"<script>1</script>"
    assert dl.headers["content-type"] == "application/octet-stream" and "attachment" in dl.headers["content-disposition"]
    assert client.get(f"/api/meetings/{meeting.meeting_id}/files/doesnotexist").status_code == 404
    import backend.files as files_mod
    big = b"0" * (files_mod.MAX_UPLOAD_BYTES + 1)
    assert client.post(url, files={"file": ("big.bin", big)}, headers={"X-Meeting-Ticket": ticket}).status_code == 413


def test_files_are_deleted_when_the_meeting_ends(client, meeting, host, db):
    import os
    from backend.files import meeting_dir
    p = crud.create_participant(db, meeting.id, schemas.ParticipantCreate(display_name="A"))
    ticket = make_ticket(meeting.meeting_id, p.id, "A", False)
    client.post(f"/api/meetings/{meeting.meeting_id}/files", files={"file": ("a.txt", b"hi")}, headers={"X-Meeting-Ticket": ticket})
    assert os.path.isdir(meeting_dir(meeting.meeting_id))
    app.dependency_overrides[get_current_user] = lambda: host
    client.patch(f"/api/meetings/{meeting.meeting_id}/end")
    assert not os.path.isdir(meeting_dir(meeting.meeting_id))


def test_join_rate_limit(client, meeting, monkeypatch):
    monkeypatch.delenv("DISABLE_RATE_LIMIT")
    codes = [client.post(f"/api/meetings/{meeting.meeting_id}/join", json={"display_name": "G"}).status_code for _ in range(35)]
    assert codes.count(429) >= 4


def test_existing_database_is_migrated_with_new_columns(tmp_path):
    import sqlalchemy as sa
    from backend import database
    engine = sa.create_engine(f"sqlite:///{tmp_path}/old.db")
    with engine.begin() as c:
        c.execute(sa.text("CREATE TABLE meetings (id INTEGER PRIMARY KEY, meeting_id VARCHAR)"))
        c.execute(sa.text("CREATE TABLE participants (id INTEGER PRIMARY KEY, meeting_id INTEGER)"))
    old_engine = database.engine
    database.engine = engine
    try:
        database.ensure_columns()
    finally:
        database.engine = old_engine
    cols = {c["name"] for c in sa.inspect(engine).get_columns("meetings")}
    assert {"passcode_hash", "waiting_room", "locked"} <= cols
    assert {"admitted", "is_cohost"} <= {c["name"] for c in sa.inspect(engine).get_columns("participants")}


def test_ice_servers_endpoint(client, monkeypatch):
    body = client.get("/api/ice-servers").json()
    assert body["hasTurn"] is False and body["iceServers"][0]["urls"]
    monkeypatch.setenv("TURN_URLS", "turn:turn.example.com:3478,turns:turn.example.com:5349")
    monkeypatch.setenv("TURN_USERNAME", "u")
    monkeypatch.setenv("TURN_CREDENTIAL", "p")
    body = client.get("/api/ice-servers").json()
    assert body["hasTurn"] is True and body["iceServers"][1]["username"] == "u"
    monkeypatch.setenv("TURN_SECRET", "s3cret")
    turn = client.get("/api/ice-servers").json()["iceServers"][1]
    assert turn["username"].isdigit() and turn["credential"]
