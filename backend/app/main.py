import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")

import cv2
import paddleocr
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_user,
    get_user_primary_org,
    hash_password,
    verify_password,
)
from .config import (
    MAX_BATCH_SIZE,
    MAX_CONCURRENT_OCR_WORKERS,
    MAX_FILE_SIZE_MB,
    ORIGINAL_BUCKET_DIR,
    PROCESSED_BUCKET_DIR,
)
from .database import (
    CardScanModel,
    ContactModel,
    ContactNoteModel,
    ContactTagModel,
    OrganizationMemberModel,
    OrganizationModel,
    ProfileModel,
    ScanBatchModel,
    SessionLocal,
    TagModel,
    get_db,
    init_db,
    new_uuid,
)
from .serializers import (
    serialize_batch,
    serialize_contact,
    serialize_note,
    serialize_organization,
    serialize_profile,
    serialize_scan,
    serialize_tag,
)
from .services.duplicates import find_duplicate_contacts
from .services.extractor import (
    _split_first_last_name,
    extract_contact_from_ocr,
    normalize_phone_number,
)
from .services.ocr_engine import OcrEngineService
from .services.preprocessor import preprocess_card_image
from .services.queue_worker import (
    PersistentJobQueueManager,
    process_single_scan_job,
    recompute_batch_counts,
)
from .storage import (
    delete_scan_storage_files,
    get_bucket_file_path,
    read_and_validate_upload,
    save_to_private_bucket,
    verify_signed_url,
)


def seed_default_admin_account() -> None:
    """Ensure the default Admin account (admin@cardflow.app / Admin@123456) is always provisioned."""
    db = SessionLocal()
    try:
        admin_email = "admin@cardflow.app"
        existing = (
            db.query(ProfileModel)
            .filter(ProfileModel.email == admin_email)
            .first()
        )
        if existing:
            return

        admin_user = ProfileModel(
            id=new_uuid(),
            full_name="CardFlow Admin",
            email=admin_email,
            password_hash=hash_password("Admin@123456"),
        )
        db.add(admin_user)
        db.flush()

        org = OrganizationModel(
            id=new_uuid(),
            name="CardFlow Admin Workspace",
            owner_id=admin_user.id,
        )
        db.add(org)
        db.flush()

        db.add(
            OrganizationMemberModel(
                id=new_uuid(),
                organization_id=org.id,
                user_id=admin_user.id,
                role="owner",
            )
        )

        for t_name, t_color in [
            ("Client", "#3478F6"),
            ("Lead", "#19C6B3"),
            ("VIP", "#101F50"),
            ("Conference", "#FFB52E"),
        ]:
            db.add(
                TagModel(
                    id=new_uuid(),
                    user_id=admin_user.id,
                    organization_id=org.id,
                    name=t_name,
                    color=t_color,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_default_admin_account()
    PersistentJobQueueManager.get_instance().start()
    yield


app = FastAPI(
    title="CardFlow OCR & Contact CRM API",
    version="1.0.0",
    description="Local OpenCV + PaddleOCR + Hybrid Extraction & Contact Management Backend",
    lifespan=lifespan,
)

extra_origins = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3005",
        "http://127.0.0.1:3005",
        *extra_origins,
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request Schemas
# ============================================================================
EMAIL_PATTERN = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"


class RegisterRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)
    organization_name: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)


class ResetPasswordRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    reset_token: str
    new_password: str = Field(min_length=6)


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    organization_name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


class UpdateScanRequest(BaseModel):
    extracted_data: dict[str, Any]


class BulkSaveContactsRequest(BaseModel):
    scan_ids: list[str] | None = None
    skip_duplicates: bool = False


class CheckDuplicatesRequest(BaseModel):
    full_name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    email: str | None = None
    exclude_contact_id: str | None = None


class ContactCreateOrUpdateRequest(BaseModel):
    scan_id: str | None = None
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    designation: str | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    email: str | None = None
    website: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    education: str | None = None
    linkedin_url: str | None = None
    additional_information: dict[str, Any] | None = None
    notes: str | None = None
    tag_ids: list[str] | None = None
    merge_into_contact_id: str | None = None


class TagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(default="#3478F6")


class NoteRequest(BaseModel):
    note: str = Field(min_length=1)


# ============================================================================
# 1. Health, Keep-Alive & Diagnostic OCR Endpoints (Milestone 2)
# ============================================================================
@app.get("/api/v1/ping")
def ping_keep_alive():
    """Ultra-lightweight endpoint for cron keep-alive pingers (Render / UptimeRobot / Vercel)."""
    return {
        "ok": True,
        "status": "awake",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": "cardflow-ocr-backend",
        "opencv_version": cv2.__version__,
        "paddleocr_version": paddleocr.__version__,
        "storage_buckets": {
            "visiting-cards-original": ORIGINAL_BUCKET_DIR.exists(),
            "visiting-cards-processed": PROCESSED_BUCKET_DIR.exists(),
        },
        "max_batch_size": MAX_BATCH_SIZE,
        "max_file_size_mb": MAX_FILE_SIZE_MB,
        "worker_concurrency": MAX_CONCURRENT_OCR_WORKERS,
    }


@app.post("/api/v1/ocr/test")
async def ocr_test_endpoint(
    file: UploadFile = File(...),
    rotation_degrees: int = Form(0),
):
    """
    Standalone OCR test endpoint for verifying OpenCV preprocessing, PaddleOCR text detection,
    bounding boxes, confidence scores, and hybrid structured field extraction on any visiting card.
    """
    raw_bytes, _ext = await read_and_validate_upload(file)
    prep = preprocess_card_image(raw_bytes, rotation_degrees=rotation_degrees)
    ocr_res = OcrEngineService.get_instance().run_ocr(prep.processed_image)
    extraction = extract_contact_from_ocr(
        ocr_res["segments"], image_shape=prep.processed_shape
    )

    return {
        "filename": file.filename,
        "preprocessing": {
            "original_shape": prep.original_shape,
            "processed_shape": prep.processed_shape,
            "steps_applied": prep.steps_applied,
            "card_boundary_detected": prep.card_boundary_detected,
            "is_dark_background": prep.is_dark_background,
            "deskew_angle": prep.deskew_angle,
        },
        "raw_ocr_text": ocr_res["raw_ocr_text"],
        "mean_ocr_confidence": ocr_res["mean_confidence"],
        "ocr_output": ocr_res["segments"],
        "extracted_data": extraction["extracted_data"],
        "extraction_confidence": extraction["extraction_confidence"],
        "needs_human_review": extraction["needs_human_review"],
    }


# ============================================================================
# 2. Authentication & Profile Endpoints (Milestone 1)
# ============================================================================
@app.post("/api/v1/auth/register")
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    existing = (
        db.query(ProfileModel).filter(ProfileModel.email == email_clean).first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email address already exists.",
        )

    user_id = new_uuid()
    user = ProfileModel(
        id=user_id,
        full_name=payload.full_name.strip(),
        email=email_clean,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    org_name = (
        payload.organization_name.strip()
        if payload.organization_name and payload.organization_name.strip()
        else f"{payload.full_name.strip()}'s Workspace"
    )
    org = OrganizationModel(
        id=new_uuid(),
        name=org_name,
        owner_id=user.id,
    )
    db.add(org)
    db.flush()

    member = OrganizationMemberModel(
        id=new_uuid(),
        organization_id=org.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)

    # Seed default helpful tags for new user workspace
    default_tags = [
        ("Client", "#3478F6"),
        ("Lead", "#19C6B3"),
        ("Vendor", "#101F50"),
        ("Conference", "#FFB52E"),
    ]
    for t_name, t_color in default_tags:
        db.add(
            TagModel(
                id=new_uuid(),
                user_id=user.id,
                organization_id=org.id,
                name=t_name,
                color=t_color,
            )
        )

    db.commit()
    db.refresh(user)
    db.refresh(org)

    token = create_access_token(user.id, user.email)
    return {
        "access_token": token,
        "user": serialize_profile(user),
        "organization": serialize_organization(org),
    }


@app.post("/api/v1/auth/login")
def login_user(payload: LoginRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    if email_clean == "admin@cardflow.app":
        seed_default_admin_account()
    user = (
        db.query(ProfileModel).filter(ProfileModel.email == email_clean).first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email address or password.",
        )

    org = get_user_primary_org(db, user.id)
    token = create_access_token(user.id, user.email)
    return {
        "access_token": token,
        "user": serialize_profile(user),
        "organization": serialize_organization(org),
    }


@app.post("/api/v1/auth/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest, db: Session = Depends(get_db)
):
    email_clean = payload.email.strip().lower()
    user = (
        db.query(ProfileModel).filter(ProfileModel.email == email_clean).first()
    )
    reset_token = None
    if user:
        reset_token = secrets.token_urlsafe(24)
        user.reset_token = reset_token
        db.commit()

    return {
        "message": "If that email is registered, a password reset token has been generated.",
        "reset_token": reset_token,
    }


@app.post("/api/v1/auth/reset-password")
def reset_password(
    payload: ResetPasswordRequest, db: Session = Depends(get_db)
):
    email_clean = payload.email.strip().lower()
    user = (
        db.query(ProfileModel).filter(ProfileModel.email == email_clean).first()
    )
    if (
        not user
        or not user.reset_token
        or user.reset_token != payload.reset_token.strip()
    ):
        raise HTTPException(
            status_code=400, detail="Invalid or expired password reset token."
        )

    user.password_hash = hash_password(payload.new_password)
    user.reset_token = None
    db.commit()
    return {"message": "Password has been reset successfully."}


@app.get("/api/v1/auth/me")
def get_me(
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = get_user_primary_org(db, current_user.id)
    return {
        "user": serialize_profile(current_user),
        "organization": serialize_organization(org),
    }


@app.put("/api/v1/auth/profile")
def update_profile(
    payload: UpdateProfileRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None and payload.full_name.strip():
        current_user.full_name = payload.full_name.strip()

    org = get_user_primary_org(db, current_user.id)
    if (
        org
        and payload.organization_name is not None
        and payload.organization_name.strip()
    ):
        org.name = payload.organization_name.strip()

    if payload.new_password:
        if len(payload.new_password) < 6:
            raise HTTPException(
                status_code=400,
                detail="New password must be at least 6 characters.",
            )
        if payload.current_password and not verify_password(
            payload.current_password, current_user.password_hash
        ):
            raise HTTPException(
                status_code=400, detail="Current password is incorrect."
            )
        current_user.password_hash = hash_password(payload.new_password)

    db.commit()
    db.refresh(current_user)
    if org:
        db.refresh(org)

    return {
        "user": serialize_profile(current_user),
        "organization": serialize_organization(org),
    }


# ============================================================================
# 3. Private Storage Signed URL Delivery
# ============================================================================
@app.get("/api/v1/storage/signed/{bucket_name}/{object_path:path}")
def serve_signed_storage_object(
    bucket_name: str,
    object_path: str,
    uid: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
):
    if not verify_signed_url(bucket_name, object_path, uid, exp, sig):
        raise HTTPException(
            status_code=403,
            detail="Access denied: invalid or expired signed storage URL.",
        )
    file_path = get_bucket_file_path(bucket_name, object_path)
    return FileResponse(file_path)


# ============================================================================
# 4. Dashboard Statistics (Module 2)
# ============================================================================
@app.get("/api/v1/dashboard/stats")
def get_dashboard_stats(
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user.id
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    total_contacts = (
        db.query(ContactModel).filter(ContactModel.user_id == uid).count()
    )
    total_scanned_cards = (
        db.query(CardScanModel).filter(CardScanModel.user_id == uid).count()
    )
    contacts_added_this_week = (
        db.query(ContactModel)
        .filter(
            ContactModel.user_id == uid,
            ContactModel.created_at >= seven_days_ago,
        )
        .count()
    )
    total_companies = (
        db.query(func.count(func.distinct(func.lower(ContactModel.company_name))))
        .filter(
            ContactModel.user_id == uid,
            ContactModel.company_name.isnot(None),
            ContactModel.company_name != "",
        )
        .scalar()
        or 0
    )
    pending_scans = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.user_id == uid,
            CardScanModel.status.in_(["uploaded", "queued", "processing"]),
        )
        .count()
    )
    failed_scans = (
        db.query(CardScanModel)
        .filter(CardScanModel.user_id == uid, CardScanModel.status == "failed")
        .count()
    )

    recent_scans = (
        db.query(CardScanModel)
        .filter(CardScanModel.user_id == uid)
        .order_by(CardScanModel.created_at.desc())
        .limit(6)
        .all()
    )
    recent_contacts = (
        db.query(ContactModel)
        .filter(ContactModel.user_id == uid)
        .order_by(ContactModel.created_at.desc())
        .limit(6)
        .all()
    )
    recent_updated = (
        db.query(ContactModel)
        .filter(ContactModel.user_id == uid)
        .order_by(ContactModel.updated_at.desc())
        .limit(5)
        .all()
    )
    failed_jobs = (
        db.query(CardScanModel)
        .filter(CardScanModel.user_id == uid, CardScanModel.status == "failed")
        .order_by(CardScanModel.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_contacts": total_contacts,
        "total_scanned_cards": total_scanned_cards,
        "contacts_added_this_week": contacts_added_this_week,
        "total_companies": total_companies,
        "pending_scans": pending_scans,
        "failed_scans": failed_scans,
        "recent_scans": [serialize_scan(db, s) for s in recent_scans],
        "recent_contacts": [
            serialize_contact(db, c, include_details=False)
            for c in recent_contacts
        ],
        "recent_updated_contacts": [
            serialize_contact(db, c, include_details=False)
            for c in recent_updated
        ],
        "failed_jobs": [serialize_scan(db, s) for s in failed_jobs],
    }


# ============================================================================
# 5. Single Card Scanning & Scan Management (Milestone 3)
# ============================================================================
@app.post("/api/v1/scans/single")
async def upload_and_scan_single_card(
    file: UploadFile = File(...),
    rotation_degrees: int = Form(0),
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_bytes, ext = await read_and_validate_upload(file)
    org = get_user_primary_org(db, current_user.id)
    scan_id = new_uuid()
    orig_rel_path = save_to_private_bucket(
        "visiting-cards-original",
        current_user.id,
        scan_id,
        f"original{ext}",
        raw_bytes,
    )

    scan = CardScanModel(
        id=scan_id,
        batch_id=None,
        user_id=current_user.id,
        organization_id=org.id if org else None,
        original_image_path=orig_rel_path,
        status="uploaded",
    )
    db.add(scan)
    db.commit()

    # Process single card scan immediately so user transitions directly to Extraction Review
    process_single_scan_job(scan_id, rotation_degrees=rotation_degrees)

    db.expire_all()
    updated_scan = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    if not updated_scan:
        raise HTTPException(status_code=404, detail="Scan record not found.")

    return serialize_scan(db, updated_scan, include_duplicates=True)


@app.get("/api/v1/scans")
def list_user_scans(
    status: str | None = Query(None),
    batch_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(CardScanModel).filter(CardScanModel.user_id == current_user.id)
    if status:
        q = q.filter(CardScanModel.status == status)
    if batch_id:
        q = q.filter(CardScanModel.batch_id == batch_id)

    total = q.count()
    items = (
        q.order_by(CardScanModel.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": [serialize_scan(db, s) for s in items],
        "total": total,
    }


@app.get("/api/v1/scans/{scan_id}")
def get_scan_details(
    scan_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return serialize_scan(db, scan, include_duplicates=True)


@app.put("/api/v1/scans/{scan_id}")
def update_scan_extracted_data(
    scan_id: str,
    payload: UpdateScanRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    merged = dict(scan.extracted_data or {})
    merged.update(payload.extracted_data)
    if merged.get("full_name") and not merged.get("first_name"):
        fn, ln = _split_first_last_name(merged.get("full_name"))
        merged["first_name"] = fn
        merged["last_name"] = ln
    scan.extracted_data = merged
    if scan.status == "review_required":
        scan.status = "completed"
    db.commit()
    db.refresh(scan)
    return serialize_scan(db, scan, include_duplicates=True)


@app.post("/api/v1/scans/{scan_id}/retry")
def retry_single_scan(
    scan_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retry a scan without creating a duplicate scan record.
    Increments retry_count and re-runs preprocessing, PaddleOCR, and extraction.
    """
    scan = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    scan.retry_count = (scan.retry_count or 0) + 1
    scan.status = "queued"
    scan.error_message = None
    db.commit()

    process_single_scan_job(scan.id)
    db.expire_all()
    refreshed = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    return serialize_scan(db, refreshed, include_duplicates=True)


@app.delete("/api/v1/scans/{scan_id}")
def delete_or_reject_scan(
    scan_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.id == scan_id,
            CardScanModel.user_id == current_user.id,
        )
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    batch_id = scan.batch_id
    delete_scan_storage_files(current_user.id, scan.id)
    db.delete(scan)
    db.commit()
    if batch_id:
        recompute_batch_counts(db, batch_id)

    return {"message": "Scan rejected and associated images deleted."}


# ============================================================================
# 6. Bulk Visiting Card Scanning (Milestone 4)
# ============================================================================
@app.post("/api/v1/batches")
async def create_bulk_scan_batch(
    files: list[UploadFile] = File(...),
    batch_name: str = Form("Visiting Card Batch"),
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(
            status_code=400, detail="Please select at least one card image."
        )
    if len(files) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_BATCH_SIZE} images allowed per batch (received {len(files)}).",
        )

    validated_uploads: list[tuple[str, bytes, str]] = []
    for f in files:
        raw_bytes, ext = await read_and_validate_upload(f)
        validated_uploads.append((f.filename or "card.jpg", raw_bytes, ext))

    org = get_user_primary_org(db, current_user.id)
    batch_id = new_uuid()
    batch = ScanBatchModel(
        id=batch_id,
        user_id=current_user.id,
        organization_id=org.id if org else None,
        batch_name=batch_name.strip() or "Visiting Card Batch",
        total_images=len(validated_uploads),
        completed_count=0,
        failed_count=0,
        pending_count=len(validated_uploads),
        status="processing",
    )
    db.add(batch)
    db.flush()

    created_scans: list[CardScanModel] = []
    for _orig_name, raw_bytes, ext in validated_uploads:
        scan_id = new_uuid()
        orig_rel_path = save_to_private_bucket(
            "visiting-cards-original",
            current_user.id,
            scan_id,
            f"original{ext}",
            raw_bytes,
        )
        scan = CardScanModel(
            id=scan_id,
            batch_id=batch.id,
            user_id=current_user.id,
            organization_id=org.id if org else None,
            original_image_path=orig_rel_path,
            status="queued",
        )
        db.add(scan)
        created_scans.append(scan)

    db.commit()

    # Enqueue all scans into persistent background worker pool without blocking HTTP response
    queue_mgr = PersistentJobQueueManager.get_instance()
    for s in created_scans:
        queue_mgr.enqueue_scan(s.id, rotation_degrees=0)

    return {
        "batch": serialize_batch(db, batch),
        "scans": [serialize_scan(db, s) for s in created_scans],
    }


@app.get("/api/v1/batches")
def list_batches(
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    batches = (
        db.query(ScanBatchModel)
        .filter(ScanBatchModel.user_id == current_user.id)
        .order_by(ScanBatchModel.created_at.desc())
        .all()
    )
    return {
        "items": [serialize_batch(db, b) for b in batches],
        "total": len(batches),
    }


@app.get("/api/v1/batches/{batch_id}")
def get_batch_details(
    batch_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    batch = (
        db.query(ScanBatchModel)
        .filter(
            ScanBatchModel.id == batch_id,
            ScanBatchModel.user_id == current_user.id,
        )
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found.")

    recompute_batch_counts(db, batch.id)
    db.refresh(batch)

    scans = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.batch_id == batch.id,
            CardScanModel.user_id == current_user.id,
        )
        .order_by(CardScanModel.created_at.asc())
        .all()
    )
    return {
        "batch": serialize_batch(db, batch),
        "scans": [
            serialize_scan(db, s, include_duplicates=True) for s in scans
        ],
    }


@app.post("/api/v1/batches/{batch_id}/retry-failed")
def retry_batch_failed_scans(
    batch_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    batch = (
        db.query(ScanBatchModel)
        .filter(
            ScanBatchModel.id == batch_id,
            ScanBatchModel.user_id == current_user.id,
        )
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found.")

    failed_scans = (
        db.query(CardScanModel)
        .filter(
            CardScanModel.batch_id == batch.id,
            CardScanModel.user_id == current_user.id,
            CardScanModel.status == "failed",
        )
        .all()
    )

    queue_mgr = PersistentJobQueueManager.get_instance()
    for s in failed_scans:
        s.retry_count = (s.retry_count or 0) + 1
        s.status = "queued"
        s.error_message = None
    db.commit()
    recompute_batch_counts(db, batch.id)

    for s in failed_scans:
        queue_mgr.enqueue_scan(s.id, rotation_degrees=0)

    return get_batch_details(batch_id, current_user, db)


@app.post("/api/v1/batches/{batch_id}/save-contacts")
def bulk_save_batch_contacts(
    batch_id: str,
    payload: BulkSaveContactsRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save selected or all successful scans in a batch as CRM contacts.
    Idempotent: prevents duplicate contact creation if a scan was already saved.
    """
    batch = (
        db.query(ScanBatchModel)
        .filter(
            ScanBatchModel.id == batch_id,
            ScanBatchModel.user_id == current_user.id,
        )
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found.")

    q = db.query(CardScanModel).filter(
        CardScanModel.batch_id == batch.id,
        CardScanModel.user_id == current_user.id,
        CardScanModel.status.in_(["completed", "review_required"]),
    )
    if payload.scan_ids:
        q = q.filter(CardScanModel.id.in_(payload.scan_ids))

    scans = q.all()
    saved_contacts: list[ContactModel] = []

    for scan in scans:
        # Prevent duplicate contact creation on retries / repeated clicks
        existing_for_scan = (
            db.query(ContactModel)
            .filter(
                ContactModel.scan_id == scan.id,
                ContactModel.user_id == current_user.id,
            )
            .first()
        )
        if existing_for_scan:
            saved_contacts.append(existing_for_scan)
            continue

        ext = scan.extracted_data or {}
        if not (
            ext.get("full_name")
            or ext.get("company_name")
            or ext.get("phone")
            or ext.get("email")
        ):
            continue

        if payload.skip_duplicates:
            dups = find_duplicate_contacts(db, current_user.id, ext)
            if dups:
                continue

        fn, ln = _split_first_last_name(ext.get("full_name"))
        contact = ContactModel(
            id=new_uuid(),
            user_id=current_user.id,
            organization_id=batch.organization_id,
            scan_id=scan.id,
            full_name=ext.get("full_name"),
            first_name=ext.get("first_name") or fn,
            last_name=ext.get("last_name") or ln,
            company_name=ext.get("company_name"),
            designation=ext.get("designation"),
            phone=normalize_phone_number(str(ext.get("phone") or ""))
            or ext.get("phone"),
            alternate_phone=normalize_phone_number(
                str(ext.get("alternate_phone") or "")
            )
            or ext.get("alternate_phone"),
            email=ext.get("email"),
            website=ext.get("website"),
            address=ext.get("address"),
            city=ext.get("city"),
            state=ext.get("state"),
            postal_code=ext.get("postal_code"),
            country=ext.get("country"),
            education=ext.get("education"),
            linkedin_url=ext.get("linkedin_url"),
            additional_information={
                "other_information": ext.get("other_information", [])
            },
        )
        db.add(contact)
        scan.status = "completed"
        saved_contacts.append(contact)

    db.commit()
    recompute_batch_counts(db, batch.id)

    return {
        "saved_count": len(saved_contacts),
        "contacts": [
            serialize_contact(db, c, include_details=False)
            for c in saved_contacts
        ],
    }


# ============================================================================
# 7. Contacts CRM, Duplicate Detection, Tags & Notes (Milestone 5)
# ============================================================================
@app.post("/api/v1/contacts/check-duplicates")
def check_contact_duplicates(
    payload: CheckDuplicatesRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    matches = find_duplicate_contacts(
        db,
        current_user.id,
        payload.model_dump(),
        exclude_contact_id=payload.exclude_contact_id,
    )
    return {
        "duplicates": [
            {
                "contact": serialize_contact(
                    db, m["contact_model"], include_details=False
                ),
                "match_reasons": m["match_reasons"],
                "similarity_score": m["similarity_score"],
            }
            for m in matches
        ]
    }


@app.post("/api/v1/contacts")
def create_or_merge_contact(
    payload: ContactCreateOrUpdateRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = get_user_primary_org(db, current_user.id)

    # If user chose "Update Existing Contact" during duplicate review
    if payload.merge_into_contact_id:
        target = (
            db.query(ContactModel)
            .filter(
                ContactModel.id == payload.merge_into_contact_id,
                ContactModel.user_id == current_user.id,
            )
            .first()
        )
        if not target:
            raise HTTPException(
                status_code=404, detail="Target contact for update not found."
            )
        contact = target
    elif payload.scan_id:
        # Prevent duplicate creation if scan_id already created a contact
        existing_scan_contact = (
            db.query(ContactModel)
            .filter(
                ContactModel.scan_id == payload.scan_id,
                ContactModel.user_id == current_user.id,
            )
            .first()
        )
        contact = existing_scan_contact or ContactModel(
            id=new_uuid(),
            user_id=current_user.id,
            organization_id=org.id if org else None,
            scan_id=payload.scan_id,
        )
        if not existing_scan_contact:
            db.add(contact)
    else:
        contact = ContactModel(
            id=new_uuid(),
            user_id=current_user.id,
            organization_id=org.id if org else None,
        )
        db.add(contact)

    fn, ln = _split_first_last_name(payload.full_name)
    contact.full_name = (
        payload.full_name.strip() if payload.full_name else contact.full_name
    )
    contact.first_name = (
        payload.first_name.strip()
        if payload.first_name
        else (fn or contact.first_name)
    )
    contact.last_name = (
        payload.last_name.strip()
        if payload.last_name
        else (ln or contact.last_name)
    )
    contact.company_name = (
        payload.company_name.strip()
        if payload.company_name is not None
        else contact.company_name
    )
    contact.designation = (
        payload.designation.strip()
        if payload.designation is not None
        else contact.designation
    )
    if payload.phone is not None:
        contact.phone = (
            normalize_phone_number(payload.phone) or payload.phone.strip() or None
        )
    if payload.alternate_phone is not None:
        contact.alternate_phone = (
            normalize_phone_number(payload.alternate_phone)
            or payload.alternate_phone.strip()
            or None
        )
    if payload.email is not None:
        contact.email = payload.email.strip().lower() or None
    if payload.website is not None:
        contact.website = payload.website.strip() or None
    if payload.address is not None:
        contact.address = payload.address.strip() or None
    if payload.city is not None:
        contact.city = payload.city.strip() or None
    if payload.state is not None:
        contact.state = payload.state.strip() or None
    if payload.postal_code is not None:
        contact.postal_code = payload.postal_code.strip() or None
    if payload.country is not None:
        contact.country = payload.country.strip() or None
    if payload.education is not None:
        contact.education = payload.education.strip() or None
    if payload.linkedin_url is not None:
        contact.linkedin_url = payload.linkedin_url.strip() or None
    if payload.additional_information is not None:
        contact.additional_information = payload.additional_information
    if payload.notes is not None:
        contact.notes = payload.notes.strip() or None
    if payload.scan_id:
        contact.scan_id = payload.scan_id
        scan = (
            db.query(CardScanModel)
            .filter(
                CardScanModel.id == payload.scan_id,
                CardScanModel.user_id == current_user.id,
            )
            .first()
        )
        if scan:
            scan.status = "completed"

    db.flush()

    if payload.tag_ids is not None:
        db.query(ContactTagModel).filter(
            ContactTagModel.contact_id == contact.id
        ).delete()
        valid_tags = (
            db.query(TagModel)
            .filter(
                TagModel.user_id == current_user.id,
                TagModel.id.in_(payload.tag_ids),
            )
            .all()
        )
        for t in valid_tags:
            db.add(ContactTagModel(contact_id=contact.id, tag_id=t.id))

    db.commit()
    db.refresh(contact)
    return serialize_contact(db, contact, include_details=True)


@app.get("/api/v1/contacts")
def list_contacts(
    search: str | None = Query(None),
    tag_id: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(ContactModel).filter(ContactModel.user_id == current_user.id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ContactModel.full_name.ilike(term),
                ContactModel.company_name.ilike(term),
                ContactModel.phone.ilike(term),
                ContactModel.alternate_phone.ilike(term),
                ContactModel.email.ilike(term),
                ContactModel.designation.ilike(term),
                ContactModel.city.ilike(term),
            )
        )

    if tag_id:
        q = q.join(
            ContactTagModel, ContactTagModel.contact_id == ContactModel.id
        ).filter(ContactTagModel.tag_id == tag_id)

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            q = q.filter(ContactModel.created_at >= dt_from)
        except ValueError:
            pass

    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to) + timedelta(days=1)
            q = q.filter(ContactModel.created_at < dt_to)
        except ValueError:
            pass

    sort_col_map = {
        "name": ContactModel.full_name,
        "company": ContactModel.company_name,
        "updated_at": ContactModel.updated_at,
        "created_at": ContactModel.created_at,
    }
    sort_col = sort_col_map.get(sort_by, ContactModel.created_at)
    if sort_dir.lower() == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            serialize_contact(db, c, include_details=True) for c in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/v1/contacts/{contact_id}")
def get_contact_details(
    contact_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = (
        db.query(ContactModel)
        .filter(
            ContactModel.id == contact_id,
            ContactModel.user_id == current_user.id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")
    return serialize_contact(db, contact, include_details=True)


@app.put("/api/v1/contacts/{contact_id}")
def update_contact(
    contact_id: str,
    payload: ContactCreateOrUpdateRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = (
        db.query(ContactModel)
        .filter(
            ContactModel.id == contact_id,
            ContactModel.user_id == current_user.id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    if payload.full_name is not None:
        contact.full_name = payload.full_name.strip() or None
        fn, ln = _split_first_last_name(contact.full_name)
        contact.first_name = (
            payload.first_name.strip() if payload.first_name else fn
        )
        contact.last_name = (
            payload.last_name.strip() if payload.last_name else ln
        )
    if payload.company_name is not None:
        contact.company_name = payload.company_name.strip() or None
    if payload.designation is not None:
        contact.designation = payload.designation.strip() or None
    if payload.phone is not None:
        contact.phone = (
            normalize_phone_number(payload.phone) or payload.phone.strip() or None
        )
    if payload.alternate_phone is not None:
        contact.alternate_phone = (
            normalize_phone_number(payload.alternate_phone)
            or payload.alternate_phone.strip()
            or None
        )
    if payload.email is not None:
        contact.email = payload.email.strip().lower() or None
    if payload.website is not None:
        contact.website = payload.website.strip() or None
    if payload.address is not None:
        contact.address = payload.address.strip() or None
    if payload.city is not None:
        contact.city = payload.city.strip() or None
    if payload.state is not None:
        contact.state = payload.state.strip() or None
    if payload.postal_code is not None:
        contact.postal_code = payload.postal_code.strip() or None
    if payload.country is not None:
        contact.country = payload.country.strip() or None
    if payload.education is not None:
        contact.education = payload.education.strip() or None
    if payload.linkedin_url is not None:
        contact.linkedin_url = payload.linkedin_url.strip() or None
    if payload.notes is not None:
        contact.notes = payload.notes.strip() or None

    if payload.tag_ids is not None:
        db.query(ContactTagModel).filter(
            ContactTagModel.contact_id == contact.id
        ).delete()
        valid_tags = (
            db.query(TagModel)
            .filter(
                TagModel.user_id == current_user.id,
                TagModel.id.in_(payload.tag_ids),
            )
            .all()
        )
        for t in valid_tags:
            db.add(ContactTagModel(contact_id=contact.id, tag_id=t.id))

    db.commit()
    db.refresh(contact)
    return serialize_contact(db, contact, include_details=True)


@app.delete("/api/v1/contacts/{contact_id}")
def delete_contact(
    contact_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = (
        db.query(ContactModel)
        .filter(
            ContactModel.id == contact_id,
            ContactModel.user_id == current_user.id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    db.delete(contact)
    db.commit()
    return {"message": "Contact deleted successfully."}


@app.post("/api/v1/contacts/{contact_id}/notes")
def add_contact_note(
    contact_id: str,
    payload: NoteRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = (
        db.query(ContactModel)
        .filter(
            ContactModel.id == contact_id,
            ContactModel.user_id == current_user.id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    note = ContactNoteModel(
        id=new_uuid(),
        contact_id=contact.id,
        user_id=current_user.id,
        note=payload.note.strip(),
    )
    contact.updated_at = datetime.now(timezone.utc)
    db.add(note)
    db.commit()
    db.refresh(note)
    return serialize_note(note)


@app.delete("/api/v1/contacts/{contact_id}/notes/{note_id}")
def delete_contact_note(
    contact_id: str,
    note_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = (
        db.query(ContactNoteModel)
        .filter(
            ContactNoteModel.id == note_id,
            ContactNoteModel.contact_id == contact_id,
            ContactNoteModel.user_id == current_user.id,
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    db.delete(note)
    db.commit()
    return {"message": "Note deleted."}


# ============================================================================
# 8. Tags Management
# ============================================================================
@app.get("/api/v1/tags")
def list_tags(
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tags = (
        db.query(TagModel)
        .filter(TagModel.user_id == current_user.id)
        .order_by(TagModel.name.asc())
        .all()
    )
    return {"items": [serialize_tag(db, t) for t in tags]}


@app.post("/api/v1/tags")
def create_tag(
    payload: TagRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = payload.name.strip()
    existing = (
        db.query(TagModel)
        .filter(
            TagModel.user_id == current_user.id,
            func.lower(TagModel.name) == clean_name.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail=f"Tag '{clean_name}' already exists."
        )

    org = get_user_primary_org(db, current_user.id)
    tag = TagModel(
        id=new_uuid(),
        user_id=current_user.id,
        organization_id=org.id if org else None,
        name=clean_name,
        color=payload.color.strip() or "#3478F6",
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return serialize_tag(db, tag)


@app.put("/api/v1/tags/{tag_id}")
def update_tag(
    tag_id: str,
    payload: TagRequest,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tag = (
        db.query(TagModel)
        .filter(
            TagModel.id == tag_id,
            TagModel.user_id == current_user.id,
        )
        .first()
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found.")

    tag.name = payload.name.strip()
    tag.color = payload.color.strip() or tag.color
    db.commit()
    db.refresh(tag)
    return serialize_tag(db, tag)


@app.delete("/api/v1/tags/{tag_id}")
def delete_tag(
    tag_id: str,
    current_user: ProfileModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tag = (
        db.query(TagModel)
        .filter(
            TagModel.id == tag_id,
            TagModel.user_id == current_user.id,
        )
        .first()
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found.")

    db.delete(tag)
    db.commit()
    return {"message": "Tag deleted."}
