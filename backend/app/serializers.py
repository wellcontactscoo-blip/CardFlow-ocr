from datetime import datetime
from typing import Any
from sqlalchemy.orm import Session

from .database import (
    CardScanModel,
    ContactModel,
    ContactNoteModel,
    ContactTagModel,
    OrganizationModel,
    ProfileModel,
    ScanBatchModel,
    TagModel,
)
from .services.duplicates import find_duplicate_contacts
from .storage import create_signed_url


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


def serialize_profile(p: ProfileModel) -> dict[str, Any]:
    return {
        "id": p.id,
        "full_name": p.full_name,
        "email": p.email,
        "avatar_url": p.avatar_url,
        "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
    }


def serialize_organization(o: OrganizationModel | None) -> dict[str, Any] | None:
    if not o:
        return None
    return {
        "id": o.id,
        "name": o.name,
        "owner_id": o.owner_id,
        "created_at": iso(o.created_at),
        "updated_at": iso(o.updated_at),
    }


def serialize_tag(db: Session, t: TagModel) -> dict[str, Any]:
    count = (
        db.query(ContactTagModel)
        .filter(ContactTagModel.tag_id == t.id)
        .count()
    )
    return {
        "id": t.id,
        "user_id": t.user_id,
        "organization_id": t.organization_id,
        "name": t.name,
        "color": t.color,
        "created_at": iso(t.created_at),
        "contact_count": count,
    }


def serialize_note(n: ContactNoteModel) -> dict[str, Any]:
    return {
        "id": n.id,
        "contact_id": n.contact_id,
        "user_id": n.user_id,
        "note": n.note,
        "created_at": iso(n.created_at),
        "updated_at": iso(n.updated_at),
    }


def serialize_contact(
    db: Session,
    c: ContactModel,
    include_details: bool = True,
) -> dict[str, Any]:
    tag_rows = (
        db.query(TagModel)
        .join(ContactTagModel, ContactTagModel.tag_id == TagModel.id)
        .filter(ContactTagModel.contact_id == c.id)
        .order_by(TagModel.name.asc())
        .all()
    )
    tags = [
        {
            "id": t.id,
            "user_id": t.user_id,
            "organization_id": t.organization_id,
            "name": t.name,
            "color": t.color,
            "created_at": iso(t.created_at),
        }
        for t in tag_rows
    ]

    notes_list: list[dict[str, Any]] = []
    orig_url: str | None = None
    proc_url: str | None = None
    scan_date: str | None = None

    if include_details:
        note_rows = (
            db.query(ContactNoteModel)
            .filter(ContactNoteModel.contact_id == c.id)
            .order_by(ContactNoteModel.created_at.desc())
            .all()
        )
        notes_list = [serialize_note(n) for n in note_rows]

        if c.scan_id:
            scan = (
                db.query(CardScanModel)
                .filter(
                    CardScanModel.id == c.scan_id,
                    CardScanModel.user_id == c.user_id,
                )
                .first()
            )
            if scan:
                orig_url = create_signed_url(
                    "visiting-cards-original",
                    scan.original_image_path,
                    c.user_id,
                )
                proc_url = create_signed_url(
                    "visiting-cards-processed",
                    scan.processed_image_path,
                    c.user_id,
                )
                scan_date = iso(scan.created_at)

    return {
        "id": c.id,
        "user_id": c.user_id,
        "organization_id": c.organization_id,
        "scan_id": c.scan_id,
        "full_name": c.full_name,
        "first_name": c.first_name,
        "last_name": c.last_name,
        "company_name": c.company_name,
        "designation": c.designation,
        "phone": c.phone,
        "alternate_phone": c.alternate_phone,
        "email": c.email,
        "website": c.website,
        "address": c.address,
        "city": c.city,
        "state": c.state,
        "postal_code": c.postal_code,
        "country": c.country,
        "education": c.education,
        "linkedin_url": c.linkedin_url,
        "additional_information": c.additional_information or {},
        "notes": c.notes,
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
        "tags": tags,
        "contact_notes": notes_list,
        "original_image_url": orig_url,
        "processed_image_url": proc_url,
        "scan_date": scan_date,
    }


def serialize_scan(
    db: Session,
    s: CardScanModel,
    include_duplicates: bool = False,
) -> dict[str, Any]:
    saved_contact = (
        db.query(ContactModel)
        .filter(
            ContactModel.scan_id == s.id,
            ContactModel.user_id == s.user_id,
        )
        .first()
    )

    duplicates_out: list[dict[str, Any]] = []
    if include_duplicates and s.extracted_data:
        raw_dups = find_duplicate_contacts(
            db,
            s.user_id,
            s.extracted_data,
            exclude_contact_id=saved_contact.id if saved_contact else None,
        )
        duplicates_out = [
            {
                "contact": serialize_contact(
                    db, d["contact_model"], include_details=False
                ),
                "match_reasons": d["match_reasons"],
                "similarity_score": d["similarity_score"],
            }
            for d in raw_dups
        ]

    return {
        "id": s.id,
        "batch_id": s.batch_id,
        "user_id": s.user_id,
        "organization_id": s.organization_id,
        "original_image_path": s.original_image_path,
        "processed_image_path": s.processed_image_path,
        "original_image_url": create_signed_url(
            "visiting-cards-original", s.original_image_path, s.user_id
        ),
        "processed_image_url": create_signed_url(
            "visiting-cards-processed", s.processed_image_path, s.user_id
        ),
        "raw_ocr_text": s.raw_ocr_text,
        "ocr_output": s.ocr_output or [],
        "extracted_data": s.extracted_data or {},
        "extraction_confidence": s.extraction_confidence or {},
        "status": s.status,
        "error_message": s.error_message,
        "retry_count": s.retry_count,
        "created_at": iso(s.created_at),
        "processed_at": iso(s.processed_at),
        "saved_contact_id": saved_contact.id if saved_contact else None,
        "duplicates": duplicates_out,
    }


def serialize_batch(db: Session, b: ScanBatchModel) -> dict[str, Any]:
    scans = (
        db.query(CardScanModel)
        .filter(CardScanModel.batch_id == b.id, CardScanModel.user_id == b.user_id)
        .all()
    )
    contacts_extracted = sum(
        1
        for s in scans
        if s.extracted_data
        and (
            s.extracted_data.get("full_name")
            or s.extracted_data.get("phone")
            or s.extracted_data.get("email")
        )
    )
    dup_count = 0
    for s in scans:
        if s.extracted_data:
            dups = find_duplicate_contacts(db, b.user_id, s.extracted_data)
            if dups:
                dup_count += 1

    return {
        "id": b.id,
        "user_id": b.user_id,
        "organization_id": b.organization_id,
        "batch_name": b.batch_name,
        "total_images": b.total_images,
        "completed_count": b.completed_count,
        "failed_count": b.failed_count,
        "pending_count": b.pending_count,
        "status": b.status,
        "created_at": iso(b.created_at),
        "completed_at": iso(b.completed_at),
        "contacts_extracted": contacts_extracted,
        "potential_duplicates": dup_count,
    }

