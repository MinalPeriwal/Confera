from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    clerk_id: str
    email: Optional[str] = None
    name: str

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ParticipantBase(BaseModel):
    display_name: str
    is_host: bool = False
    is_muted: bool = False
    camera_enabled: bool = False

class ParticipantCreate(BaseModel):
    display_name: str
    is_host: bool = False

    @field_validator('display_name')
    @classmethod
    def name_must_not_be_empty(cls, v: str):
        if not v or not v.strip():
            raise ValueError('Display name cannot be empty')
        return v

class Participant(ParticipantBase):
    id: int
    meeting_id: int
    joined_at: datetime
    left_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MeetingBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = Field(default=60, gt=0)
    host_name: str

class MeetingCreate(MeetingBase):
    instant: bool = False

    @model_validator(mode='after')
    def validate_meeting(self):
        if not self.instant:
            if not self.title or not self.title.strip():
                raise ValueError('Title is required for scheduled meetings')
            if not self.scheduled_at:
                raise ValueError('Scheduled time is required for scheduled meetings')
            scheduled = self.scheduled_at
            if scheduled.tzinfo is not None:
                from datetime import timezone
                now = datetime.now(timezone.utc)
            else:
                now = datetime.utcnow()
            if scheduled < now:
                raise ValueError('Scheduled meetings cannot be created in the past')
        return self

class Meeting(MeetingBase):
    id: int
    meeting_id: str
    host_id: int
    join_url: str
    status: str
    created_at: datetime
    participants: List[Participant] = []

    class Config:
        from_attributes = True
