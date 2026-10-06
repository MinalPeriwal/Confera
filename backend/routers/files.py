import os
import uuid

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from ..files import MAX_UPLOAD_BYTES, meeting_dir, safe_name
from ..security import rate_limit, read_ticket

router = APIRouter()


@router.post("/{meeting_id}/files")
async def upload_file(
    meeting_id: str,
    request: Request,
    file: UploadFile = File(...),
    x_meeting_ticket: str | None = Header(default=None),
):
    """Share a file with everyone in the meeting. Requires the join ticket (i.e. being a participant)."""
    meeting_id = meeting_id.replace(" ", "")
    if read_ticket(x_meeting_ticket, meeting_id) is None:
        raise HTTPException(status_code=401, detail="Join the meeting to share files")
    rate_limit(request, "upload", limit=20)

    file_id = uuid.uuid4().hex
    name = safe_name(file.filename or "file")
    folder = os.path.join(meeting_dir(meeting_id), file_id)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)

    size = 0
    try:
        with open(path, "wb") as out:
            while chunk := await file.read(1024 * 256):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"Files can be at most {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
                out.write(chunk)
    except HTTPException:
        _remove(folder)
        raise
    return {"id": file_id, "name": name, "size": size, "url": f"/api/meetings/{meeting_id}/files/{file_id}"}


@router.get("/{meeting_id}/files/{file_id}")
def download_file(meeting_id: str, file_id: str):
    folder = os.path.join(meeting_dir(meeting_id.replace(" ", "")), "".join(c for c in file_id if c.isalnum()))
    if not os.path.isdir(folder) or not os.listdir(folder):
        raise HTTPException(status_code=404, detail="File not found")
    name = os.listdir(folder)[0]
    return FileResponse(
        os.path.join(folder, name),
        filename=name,
        media_type="application/octet-stream",  # never rendered inline
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"},
    )


def _remove(folder: str) -> None:
    import shutil
    shutil.rmtree(folder, ignore_errors=True)
