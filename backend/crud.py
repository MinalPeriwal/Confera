from sqlalchemy.orm import Session
from . import models, schemas
import random
import string
from datetime import datetime, timezone

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_clerk_id(db: Session, clerk_id: str):
    return db.query(models.User).filter(models.User.clerk_id == clerk_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(clerk_id=user.clerk_id, email=user.email, name=user.name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def _generate_meeting_id(db: Session):
    while True:
        meeting_id = "".join(random.choices(string.digits, k=9))
        if not db.query(models.Meeting).filter(models.Meeting.meeting_id == meeting_id).first():
            return meeting_id

def create_meeting(db: Session, meeting: schemas.MeetingCreate, host_id: int):
    meeting_id = _generate_meeting_id(db)
    # Format the ID visually (e.g., 847 291 563) just for generation if needed, but we store the normalized value.
    # We will just store the 9 digits and frontend can format it.
    join_url = f"/meeting/{meeting_id}"
    
    status = "active" if meeting.instant else "scheduled"
    title = meeting.title if meeting.title else f"{meeting.host_name}'s Personal Meeting Room"
    
    db_meeting = models.Meeting(
        meeting_id=meeting_id,
        title=title,
        description=meeting.description,
        host_id=host_id,
        host_name=meeting.host_name,
        scheduled_at=meeting.scheduled_at,
        duration_minutes=meeting.duration_minutes,
        join_url=join_url,
        status=status
    )
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def get_meeting(db: Session, meeting_id: str):
    # Normalize meeting_id by removing spaces in case the client sends it formatted
    normalized_id = meeting_id.replace(" ", "")
    return db.query(models.Meeting).filter(models.Meeting.meeting_id == normalized_id).first()

def get_user_meetings(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Meeting).filter(models.Meeting.host_id == user_id).offset(skip).limit(limit).all()

def get_upcoming_meetings(db: Session, user_id: int):
    return db.query(models.Meeting).filter(
        models.Meeting.host_id == user_id,
        models.Meeting.status == "scheduled"
    ).order_by(models.Meeting.scheduled_at.asc()).all()

def get_recent_meetings(db: Session, user_id: int, limit: int = 10):
    return db.query(models.Meeting).filter(
        models.Meeting.host_id == user_id,
        models.Meeting.status.in_(["active", "ended"])
    ).order_by(models.Meeting.created_at.desc()).limit(limit).all()

def create_participant(db: Session, meeting_id: int, participant: schemas.ParticipantCreate):
    db_participant = models.Participant(
        meeting_id=meeting_id,
        display_name=participant.display_name,
        is_host=participant.is_host
    )
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

def leave_participant(db: Session, participant_id: int):
    db_participant = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
    if db_participant:
        db_participant.left_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_participant)
    return db_participant

def get_active_participants(db: Session, meeting_id: int):
    return db.query(models.Participant).filter(
        models.Participant.meeting_id == meeting_id,
        models.Participant.left_at.is_(None)
    ).all()

def remove_participant(db: Session, participant_id: int):
    db_participant = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
    if db_participant:
        db.delete(db_participant)
        db.commit()
    return db_participant

def mute_all_participants(db: Session, meeting_id: int):
    participants = db.query(models.Participant).filter(
        models.Participant.meeting_id == meeting_id,
        models.Participant.left_at.is_(None)
    ).all()
    for p in participants:
        p.is_muted = True
    db.commit()
    return participants
