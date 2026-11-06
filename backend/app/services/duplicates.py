import re
from typing import Any
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from ..database import ContactModel
from .extractor import normalize_phone_number


def _clean_digits(phone: str | None) -> str:
    if not phone:
        return ""
    norm = normalize_phone_number(phone) or phone
    digits = re.sub(r"\D", "", norm)
    # Use last 10 digits for canonical comparison across +91 / 0 / 10-digit formats
    return digits[-10:] if len(digits) >= 10 else digits


def find_duplicate_contacts(
    db: Session,
    user_id: str,
    candidate: dict[str, Any],
    exclude_contact_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Compare candidate contact fields against all contacts owned by `user_id`
    using normalized phone, normalized email, fuzzy name (RapidFuzz), and company name.
    """
    existing_contacts = (
        db.query(ContactModel)
        .filter(ContactModel.user_id == user_id)
        .order_by(ContactModel.created_at.desc())
        .all()
    )

    cand_phones = {
        _clean_digits(candidate.get("phone")),
        _clean_digits(candidate.get("alternate_phone")),
    } - {""}
    cand_email = (candidate.get("email") or "").strip().lower()
    cand_name = (candidate.get("full_name") or "").strip().lower()
    cand_company = (candidate.get("company_name") or "").strip().lower()

    matches: list[dict[str, Any]] = []

    for contact in existing_contacts:
        if exclude_contact_id and contact.id == exclude_contact_id:
            continue

        reasons: list[str] = []
        score = 0.0

        ex_phones = {
            _clean_digits(contact.phone),
            _clean_digits(contact.alternate_phone),
        } - {""}
        ex_email = (contact.email or "").strip().lower()
        ex_name = (contact.full_name or "").strip().lower()
        ex_company = (contact.company_name or "").strip().lower()

        # 1. Exact normalized phone match
        if cand_phones and ex_phones and (cand_phones & ex_phones):
            reasons.append("Identical normalized phone number")
            score = max(score, 0.96)

        # 2. Exact normalized email match
        if cand_email and ex_email and cand_email == ex_email:
            reasons.append("Identical email address")
            score = max(score, 0.96)

        # 3. Fuzzy name + company similarity
        if cand_name and ex_name and len(cand_name) >= 3 and len(ex_name) >= 3:
            name_ratio = fuzz.token_sort_ratio(cand_name, ex_name) / 100.0
            if name_ratio >= 0.90:
                if cand_company and ex_company:
                    comp_ratio = fuzz.token_set_ratio(cand_company, ex_company) / 100.0
                    if comp_ratio >= 0.80:
                        reasons.append(
                            f"Similar full name ({int(name_ratio * 100)}%) and company ({int(comp_ratio * 100)}%)"
                        )
                        score = max(score, round((name_ratio + comp_ratio) / 2.0, 2))
                    else:
                        reasons.append(f"Very similar full name ({int(name_ratio * 100)}%)")
                        score = max(score, round(name_ratio * 0.85, 2))
                else:
                    reasons.append(f"Similar full name ({int(name_ratio * 100)}%)")
                    score = max(score, round(name_ratio * 0.85, 2))

        if reasons and score >= 0.72:
            matches.append(
                {
                    "contact_model": contact,
                    "match_reasons": reasons,
                    "similarity_score": round(score, 2),
                }
            )

    matches.sort(key=lambda m: m["similarity_score"], reverse=True)
    return matches

