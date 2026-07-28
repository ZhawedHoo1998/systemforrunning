from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.auth import get_current_user


router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
    dependencies=[Depends(get_current_user)],
    include_in_schema=False,
)
UPLOAD_DIR = (Path(__file__).resolve().parent.parent / "uploads").resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/{file_path:path}")
async def get_upload(file_path: str):
    requested_path = (UPLOAD_DIR / file_path).resolve()
    try:
        requested_path.relative_to(UPLOAD_DIR)
    except ValueError:
        raise HTTPException(status_code=404, detail="文件不存在")

    if not requested_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        requested_path,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
