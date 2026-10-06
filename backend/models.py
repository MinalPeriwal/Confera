from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    clerk_id = Column(String, unique=True, index=True, nullable=True)  # Clerk `sub` claim
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    meetings = relationship("Meeting", back_populates="host")

class Meeting(Base):
    __tablename__ = "meetings"
    
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    description = Column(String, nullable=True)
    host_id = Column(Integer, ForeignKey("users.id"))
    host_name = Column(String)
    scheduled_at = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=60)
    join_url = Column(String)
    status = Column(String, default="scheduled")
    passcode_hash = Column(String, nullable=True)
    waiting_room = Column(Boolean, default=False, nullable=False, server_default="0")
    locked = Column(Boolean, default=False, nullable=False, server_default="0")
    created_at = Column(DateTime, server_default=func.now())

    host = relationship("User", back_populates="meetings")
    participants = relationship("Participant", back_populates="meeting", cascade="all, delete-orphan")

    @property
    def has_passcode(self):
        return bool(self.passcode_hash)

    @property
    def host_clerk_id(self):
        return self.host.clerk_id if self.host else None

class Participant(Base):
    __tablename__ = "participants"
    
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    display_name = Column(String)
    joined_at = Column(DateTime, server_default=func.now())
    left_at = Column(DateTime, nullable=True)
    is_host = Column(Boolean, default=False)
    is_muted = Column(Boolean, default=False)
    camera_enabled = Column(Boolean, default=False)
    admitted = Column(Boolean, default=False, nullable=False, server_default="0")
    is_cohost = Column(Boolean, default=False, nullable=False, server_default="0")

    meeting = relationship("Meeting", back_populates="participants")
