import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
ENV_LOCAL_PATH = PROJECT_ROOT / ".env.local"

# Load .env.local automatically if present without overwriting existing environment variables
if ENV_LOCAL_PATH.exists():
    for raw_line in ENV_LOCAL_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = DATA_DIR / "storage"
ORIGINAL_BUCKET_DIR = STORAGE_DIR / "visiting-cards-original"
PROCESSED_BUCKET_DIR = STORAGE_DIR / "visiting-cards-processed"

DATA_DIR.mkdir(parents=True, exist_ok=True)
ORIGINAL_BUCKET_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_BUCKET_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
SUPABASE_ANON_KEY = (
    os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_PUBLISHABLE_KEY")
    or ""
)
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SECRET_KEY")
    or ""
)
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL") or ""

DB_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'cardflow.db').as_posix()}")

JWT_SECRET = os.getenv(
    "OCR_INTERNAL_SHARED_SECRET",
    "cardflow-local-dev-shared-secret-9f8a7b6c5d4e3f2a1b",
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = int(os.getenv("JWT_EXPIRY_SECONDS", "604800"))

SIGNED_URL_TTL_SECONDS = int(os.getenv("SIGNED_URL_TTL_SECONDS", "3600"))
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "50"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_CONCURRENT_OCR_WORKERS = int(os.getenv("MAX_CONCURRENT_OCR_WORKERS", "3"))
OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "en")
BACKEND_PUBLIC_URL = os.getenv("OCR_SERVICE_URL", "http://127.0.0.1:8000")

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
