from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import models
from .database import engine, ensure_columns
from .routers import files, health, ice, meetings, websockets
from .routers.websockets import allowed_origins
import logging
import os
from dotenv import load_dotenv

# Load .env from the backend directory specifically
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)
models.Base.metadata.create_all(bind=engine)
ensure_columns()

app = FastAPI(title="Zoom Clone API")

# Configure CORS. ALLOWED_ORIGINS is a comma separated list of exact frontend origins,
# e.g. "https://app.example.com". ALLOWED_ORIGIN_REGEX optionally allows preview deployments.
origins = allowed_origins()
if not origins and not os.getenv("ALLOWED_ORIGIN_REGEX"):
    logging.getLogger("uvicorn.error").warning(
        "ALLOWED_ORIGINS is not set: browsers on other origins (your frontend) will be blocked by CORS."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(ice.router, prefix="/api")
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(files.router, prefix="/api/meetings", tags=["Files"])
app.include_router(websockets.router, prefix="/ws/meetings", tags=["WebSockets"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Zoom Clone API"}
