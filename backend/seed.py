from .database import SessionLocal, engine
from . import models
from datetime import datetime, timedelta

def seed_db():
    models.Base.metadata.create_all(bind=engine)
    # For the Zoom clone, users are populated on-the-fly upon first login via Clerk (in auth.py).
    # We no longer pre-seed a default user to prevent bypasses and hardcoded identity.
    pass
    
    db = SessionLocal()
    
    if db.query(models.Meeting).count() == 0:
        import string, random
        def gen_id(): return "".join(random.choices(string.digits, k=9))
        
        now = datetime.utcnow()
        upcoming = [
            {"title": "Weekly Team Sync", "scheduled_at": now + timedelta(days=1), "status": "scheduled"},
            {"title": "Project Review", "scheduled_at": now + timedelta(days=2), "status": "scheduled"},
            {"title": "Design Discussion", "scheduled_at": now + timedelta(days=3), "status": "scheduled"},
        ]
        recent = [
            {"title": "Sprint Planning", "scheduled_at": now - timedelta(days=1), "status": "ended"},
            {"title": "Client Discussion", "scheduled_at": now - timedelta(days=2), "status": "ended"},
            {"title": "Demo Meeting", "scheduled_at": now - timedelta(days=3), "status": "ended"},
        ]
        
        for m in upcoming + recent:
            mid = gen_id()
            db_meeting = models.Meeting(
                meeting_id=mid,
                title=m["title"],
                host_id=default_user.id,
                host_name=default_user.name,
                scheduled_at=m["scheduled_at"],
                duration_minutes=60,
                join_url=f"/meeting/{mid}",
                status=m["status"],
                created_at=now - timedelta(days=5)
            )
            db.add(db_meeting)
        db.commit()
        print("Seeded meetings.")
    else:
        print("Meetings already seeded.")
        
    db.close()

if __name__ == "__main__":
    seed_db()
