import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

PROJECT_DIR = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(PROJECT_DIR, ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.database import engine, Base, migrate_material_scope
from backend.routers import ai, materials

Base.metadata.create_all(bind=engine)
migrate_material_scope()

app = FastAPI(title="Ruby Rain 香氛素材库 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(materials.router)
app.include_router(ai.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
