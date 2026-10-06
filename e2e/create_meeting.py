"""Create a test meeting directly in the backend database.

Run from the repository root, with the same environment (DATABASE_URL, SECRET_KEY) the backend uses:
    backend/venv/Scripts/python e2e/create_meeting.py                  # prints the meeting id
    backend/venv/Scripts/python e2e/create_meeting.py --json --waiting-room --passcode abcd --host-name Alice

Creating meetings through the product requires a Clerk login; joining does not. With --json the output
also contains a *host-role join ticket* (minted with the server's own signing code) so the browser test
can act as the host without a Clerk session.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(ROOT, "backend", ".env"))

from backend import crud, models, schemas  # noqa: E402
from backend.database import SessionLocal, engine, ensure_columns  # noqa: E402
from backend.security import make_ticket  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--json", action="store_true")
parser.add_argument("--waiting-room", action="store_true")
parser.add_argument("--passcode")
parser.add_argument("--host-name", default="E2E Host")
args = parser.parse_args()

models.Base.metadata.create_all(bind=engine)
ensure_columns()
db = SessionLocal()
try:
    host = crud.get_user_by_clerk_id(db, "e2e_host") or crud.create_user(
        db, schemas.UserCreate(clerk_id="e2e_host", email=None, name="E2E Host")
    )
    meeting = crud.create_meeting(
        db,
        schemas.MeetingCreate(
            instant=True, host_name="E2E Host", title="E2E test meeting",
            waiting_room=args.waiting_room, passcode=args.passcode,
        ),
        host_id=host.id,
    )
    if not args.json:
        print(meeting.meeting_id)
    else:
        participant = crud.create_participant(
            db, meeting.id, schemas.ParticipantCreate(display_name=args.host_name, is_host=True), admitted=True
        )
        print(json.dumps({
            "meeting_id": meeting.meeting_id,
            "host_ticket": make_ticket(meeting.meeting_id, participant.id, args.host_name, True),
        }))
finally:
    db.close()
