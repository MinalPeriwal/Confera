from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import models
from .database import engine
from .routers import health, meetings, websockets
from dotenv import load_dotenv
import os

load_dotenv()

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Zoom Clone API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
