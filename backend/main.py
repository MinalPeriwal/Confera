from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import models
from .database import engine
from .routers import health, meetings, websockets
import os
from dotenv import load_dotenv

# Load .env from the backend directory specifically
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Zoom Clone API")

# Configure CORS
# Read ALLOWED_ORIGINS from env, fallback to localhost:3000
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(websockets.router, prefix="/ws/meetings", tags=["WebSockets"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Zoom Clone API"}
