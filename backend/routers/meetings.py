from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from .. import crud, models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()

@router.post("", response_model=schemas.Meeting, status_code=status.HTTP_201_CREATED)
def create_meeting(meeting: schemas.MeetingCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Use the frontend-provided host_name (which contains the real Clerk full name), 
    # unless it's missing or just "User", in which case fallback to DB name.
    final_host_name = meeting.host_name if meeting.host_name and meeting.host_name != "User" else current_user.name
    meeting_data = meeting.model_copy(update={"host_name": final_host_name})
    
    # Also update the user's name in the DB if it was previously just the clerk_id
    if current_user.name == current_user.clerk_id and final_host_name != current_user.clerk_id:
        current_user.name = final_host_name
        db.commit()

    return crud.create_meeting(db=db, meeting=meeting_data, host_id=current_user.id)

@router.get("", response_model=List[schemas.Meeting])
def read_meetings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.get_user_meetings(db=db, user_id=current_user.id, skip=skip, limit=limit)

@router.get("/upcoming", response_model=List[schemas.Meeting])
def read_upcoming_meetings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.get_upcoming_meetings(db=db, user_id=current_user.id)

@router.get("/recent", response_model=List[schemas.Meeting])
def read_recent_meetings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.get_recent_meetings(db=db, user_id=current_user.id)

@router.get("/{meeting_id}", response_model=schemas.Meeting)
def read_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

@router.post("/{meeting_id}/join", response_model=dict)
def join_meeting(meeting_id: str, participant: schemas.ParticipantCreate, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    db_participant = crud.create_participant(db=db, meeting_id=meeting.id, participant=participant)
    return {
        "meeting": schemas.Meeting.model_validate(meeting).model_dump(),
        "participant": schemas.Participant.model_validate(db_participant).model_dump(),
        "participant_id": db_participant.id,
        "meeting_id": meeting.meeting_id
    }

class LeaveMeetingRequest(BaseModel):
    participant_id: int

@router.post("/{meeting_id}/leave", response_model=schemas.Participant)
def leave_meeting(meeting_id: str, req: LeaveMeetingRequest, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    db_participant = crud.leave_participant(db, participant_id=req.participant_id)
    if not db_participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    return db_participant

@router.get("/{meeting_id}/participants", response_model=List[schemas.Participant])
def get_participants(meeting_id: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return crud.get_active_participants(db, meeting_id=meeting.id)

@router.delete("/{meeting_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant(meeting_id: str, participant_id: int, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    db_participant = crud.remove_participant(db, participant_id=participant_id)
    if not db_participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    return None

@router.post("/{meeting_id}/mute-all")
def mute_all_participants(meeting_id: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    participants = crud.mute_all_participants(db, meeting_id=meeting.id)
    return {"message": "All participants muted", "count": len(participants)}

from datetime import datetime, timezone

@router.patch("/{meeting_id}/end", response_model=schemas.Meeting)
def end_meeting(meeting_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end the meeting")
        
    if meeting.status != "ended":
        meeting.status = "ended"
        
        # Calculate actual duration elapsed since creation
        now = datetime.now(timezone.utc)
        created_at = meeting.created_at
        if created_at:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            
            diff = now - created_at
            actual_minutes = max(1, int(diff.total_seconds() / 60))
            meeting.duration_minutes = actual_minutes

        db.commit()
        db.refresh(meeting)
        
    return meeting

@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    meeting = crud.get_meeting(db, meeting_id=meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can delete the meeting")
    crud.delete_meeting(db, meeting_id=meeting_id)
    return None

