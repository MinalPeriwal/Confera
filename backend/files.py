"""Meeting file sharing on local disk. Files live only as long as the meeting (deleted when it ends).

NOTE: on hosts with an ephemeral filesystem (Render free/starter without a disk) files disappear on
redeploy/restart. That is acceptable for in-meeting sharing; mount a disk and set UPLOAD_DIR to keep them.
"""
import os
import re
import shutil

UPLOAD_ROOT = os.getenv("UPLOAD_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
MAX_UPLOAD_BYTES = int(float(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024)


def meeting_dir(meeting_id: str) -> str:
    return os.path.join(UPLOAD_ROOT, re.sub(r"[^0-9A-Za-z_-]", "", meeting_id))


def safe_name(name: str) -> str:
    name = os.path.basename((name or "file").replace("\\", "/"))
    name = re.sub(r"[^\w.\- ()]", "_", name).strip(" .") or "file"
    return name[:120]


def delete_meeting_files(meeting_id: str) -> None:
    shutil.rmtree(meeting_dir(meeting_id), ignore_errors=True)
