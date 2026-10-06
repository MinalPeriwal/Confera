import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Use DATABASE_URL if available (production), else fallback to sqlite
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")

# Hosts hand out 'postgres://' or 'postgresql://' URLs. SQLAlchemy 2.1+ maps a bare 'postgresql://' to the
# newer psycopg (v3) driver, but we ship psycopg2 (requirements.txt), so name the driver explicitly.
for _prefix in ("postgres://", "postgresql://"):
    if SQLALCHEMY_DATABASE_URL.startswith(_prefix):
        SQLALCHEMY_DATABASE_URL = "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URL[len(_prefix):]
        break

# Only SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Columns added after the first release. `create_all` never alters existing tables, so add them here.
_ADDED_COLUMNS = {
    "meetings": [
        ("passcode_hash", "VARCHAR"),
        ("waiting_room", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("locked", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ],
    "participants": [
        ("admitted", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_cohost", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ],
}


def ensure_columns():
    """Tiny forward-only migration so existing databases keep working after an upgrade."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
