import hashlib
import hmac
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote
from fastapi import HTTPException, UploadFile

from .config import (
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    BACKEND_PUBLIC_URL,
    JWT_SECRET,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    ORIGINAL_BUCKET_DIR,
    PROCESSED_BUCKET_DIR,
    SIGNED_URL_TTL_SECONDS,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)

BUCKETS = {
    "visiting-cards-original": ORIGINAL_BUCKET_DIR,
    "visiting-cards-processed": PROCESSED_BUCKET_DIR,
}


def validate_image_bytes(filename: str, content_type: str | None, data: bytes) -> str:
    """Validate file size, extension, MIME type, and image magic bytes."""
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds maximum allowed size of {MAX_FILE_SIZE_MB} MB.",
        )

    ext = Path(filename or "card.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats: JPG, JPEG, PNG, WEBP.",
        )

    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported MIME type '{content_type}'. Supported formats: JPG, JPEG, PNG, WEBP.",
        )

    # Check magic bytes to guard against disguised malicious uploads
    is_jpeg = data[:3] == b"\xff\xd8\xff"
    is_png = data[:8] == b"\x89PNG\r\n\x1a\n"
    is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"

    if not (is_jpeg or is_png or is_webp):
        raise HTTPException(
            status_code=400,
            detail="File content does not match a valid JPEG, PNG, or WEBP image.",
        )

    return ext


async def read_and_validate_upload(upload: UploadFile) -> tuple[bytes, str]:
    data = await upload.read()
    ext = validate_image_bytes(
        upload.filename or "card.jpg", upload.content_type, data
    )
    return data, ext


def _sync_to_supabase_storage_async(
    bucket_name: str, rel_path: str, data: bytes
) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return

    def _upload() -> None:
        try:
            ext = Path(rel_path).suffix.lower()
            mime = (
                "image/png"
                if ext == ".png"
                else "image/webp"
                if ext == ".webp"
                else "image/jpeg"
            )
            url = f"{SUPABASE_URL}/storage/v1/object/{bucket_name}/{quote(rel_path, safe='/')}"
            req = urllib.request.Request(
                url,
                data=data,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": mime,
                    "x-upsert": "true",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                _ = resp.read()
        except Exception:
            pass

    threading.Thread(target=_upload, daemon=True).start()


def save_to_private_bucket(
    bucket_name: str, user_id: str, scan_id: str, filename: str, data: bytes
) -> str:
    """Save file under <bucket>/<user_id>/<scan_id>/<filename> and sync to Supabase Storage."""
    if bucket_name not in BUCKETS:
        raise ValueError(f"Unknown storage bucket: {bucket_name}")

    safe_name = Path(filename).name
    rel_path = f"{user_id}/{scan_id}/{safe_name}"
    abs_path = BUCKETS[bucket_name] / user_id / scan_id / safe_name
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)

    _sync_to_supabase_storage_async(bucket_name, rel_path, data)
    return rel_path


def get_bucket_file_path(bucket_name: str, object_path: str) -> Path:
    if bucket_name not in BUCKETS:
        raise HTTPException(status_code=404, detail="Bucket not found.")
    base_dir = BUCKETS[bucket_name].resolve()
    target = (base_dir / object_path).resolve()
    # Prevent path traversal
    if not str(target).startswith(str(base_dir)):
        raise HTTPException(status_code=403, detail="Invalid storage object path.")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Storage object not found.")
    return target


def delete_scan_storage_files(user_id: str, scan_id: str) -> None:
    """Delete both original and processed image directories for a deleted scan or contact."""
    import shutil

    for bucket_dir in BUCKETS.values():
        scan_dir = (bucket_dir / user_id / scan_id).resolve()
        if str(scan_dir).startswith(str(bucket_dir.resolve())) and scan_dir.exists():
            shutil.rmtree(scan_dir, ignore_errors=True)


def create_signed_url(
    bucket_name: str,
    object_path: str | None,
    user_id: str,
    ttl_seconds: int = SIGNED_URL_TTL_SECONDS,
) -> str | None:
    """Generate an expiring HMAC-SHA256 signed URL scoped to the owning user."""
    if not object_path:
        return None
    # Enforce folder-scoped RLS ownership check (<user_id>/<scan_id>/<filename>)
    parts = object_path.split("/")
    if not parts or parts[0] != user_id:
        return None

    expires = int(time.time()) + ttl_seconds
    payload = f"{bucket_name}:{object_path}:{user_id}:{expires}"
    sig = hmac.new(
        JWT_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    encoded_path = quote(object_path, safe="/")
    return (
        f"{BACKEND_PUBLIC_URL}/api/v1/storage/signed/{bucket_name}/{encoded_path}"
        f"?uid={user_id}&exp={expires}&sig={sig}"
    )


def verify_signed_url(
    bucket_name: str, object_path: str, uid: str, exp: int, sig: str
) -> bool:
    if int(time.time()) > exp:
        return False
    parts = object_path.split("/")
    if not parts or parts[0] != uid:
        return False
    payload = f"{bucket_name}:{object_path}:{uid}:{exp}"
    expected = hmac.new(
        JWT_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)
