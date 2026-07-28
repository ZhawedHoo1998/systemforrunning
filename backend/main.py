import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

PROJECT_DIR = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(PROJECT_DIR, ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.database import (
    Base,
    engine,
    migrate_ai_materials_to_creations,
    migrate_material_ai_conversation,
    migrate_material_source_metadata,
    migrate_material_scope,
    migrate_multi_user_data,
)
from backend.routers import ai, creations, materials, users, xiaohongshu

Base.metadata.create_all(bind=engine)
migrate_material_scope()
migrate_material_ai_conversation()
migrate_material_source_metadata()
migrate_multi_user_data()
migrate_ai_materials_to_creations()

app = FastAPI(title="Ruby Rain 香氛素材库 API", version="1.0.0")

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(materials.router)
app.include_router(xiaohongshu.router)
app.include_router(creations.router)
app.include_router(ai.router)
app.include_router(users.auth_router)
app.include_router(users.users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
