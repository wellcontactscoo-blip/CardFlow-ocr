import json
import re
from pathlib import Path
from typing import Any

DICT_PATH = Path(__file__).resolve().parent.parent / "config_dictionaries.json"


def load_dictionaries() -> dict[str, Any]:
    with open(DICT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


EMAIL_REGEX = re.compile(
    r"([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10})", re.IGNORECASE
)

LINKEDIN_REGEX = re.compile(
    r"((?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/(?:in|company|pub)/[a-zA-Z0-9_\-/%]+)",
    re.IGNORECASE,
)

URL_REGEX = re.compile(
    r"\b((?:https?://|www\.)[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+|"
    r"[a-zA-Z0-9\-]{2,}\.(?:com|in|co\.in|org|net|io|ai|co|tech|biz|info|me|dev|app|edu|gov\.in)(?:/[^\s,]*)?)\b",
    re.IGNORECASE,
)

INDIAN_PIN_REGEX = re.compile(
    r"(?:pin(?:\s*code)?\s*[:\-]?\s*)?(?<!\d)([1-8]\d{2}\s?\d{3})(?!\d)",
    re.IGNORECASE,
)

# Phone candidates: supports +91, +1, +44, +971, +65, STD codes (080-...), 10-digit mobiles
PHONE_CANDIDATE_REGEX = re.compile(
    r"(?:(?:\+|00)\d{1,3}[\s.\-]?)?(?:\(?\d{2,5}\)?[\s.\-]?)?\d{3,5}[\s.\-]?\d{3,6}"
)

PHONE_LABEL_CLEAN = re.compile(
    r"^(?:mob(?:ile)?|cell|ph(?:one)?|tel(?:ephone)?|off(?:ice)?|work|direct|whatsapp|wa|call|m|t|p)\s*[:.\-]?\s*",
    re.IGNORECASE,
)

HONORIFIC_REGEX = re.compile(
    r"^(?:mr\.?|mrs\.?|ms\.?|miss|dr\.?|prof\.?|er\.?|ca|adv\.?|shri|smt\.?)\s+",
    re.IGNORECASE,
)

COMMON_GENERIC_EMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "yahoo.co.in",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "rediffmail.com",
    "protonmail.com",
    "live.com",
    "msn.com",
    "aol.com",
}


def normalize_phone_number(raw: str) -> str | None:
    """
    Validate and normalize an Indian or international phone number.
    Returns normalized international format (e.g. +919876543210) or None if invalid/PIN code.
    """
    cleaned = PHONE_LABEL_CLEAN.sub("", raw.strip())
    has_plus = "+" in cleaned
    digits = re.sub(r"\D", "", cleaned)

    # Reject 6-digit Indian PIN codes or short numbers
    if len(digits) < 10 or len(digits) > 15:
        return None

    # Reject years or sequential patterns
    if digits in {"0000000000", "1234567890"}:
        return None

    # 10-digit Indian mobile number starting with 6, 7, 8, or 9
    if len(digits) == 10:
        if digits[0] in {"6", "7", "8", "9"}:
            return f"+91{digits}"
        if has_plus:
            return f"+{digits}"
        # Could be 10-digit Indian landline with STD code (e.g. 8023456789) or US number
        return f"+91{digits}" if digits.startswith(("11", "22", "33", "40", "44", "79", "80")) else f"+1{digits}"

    # 11-digit starting with 0 (Indian mobile or STD landline with leading 0)
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"

    # 11-digit starting with 1 (US/Canada +1)
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"

    # 12-digit starting with 91 (Indian international format)
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"

    # 12-digit starting with 00 (international prefix)
    if digits.startswith("00") and len(digits) >= 12:
        return f"+{digits[2:]}"

    return f"+{digits}"


def _confidence_entry(
    ocr_conf: float,
    cls_conf: float,
    source_indices: list[int] | None = None,
) -> dict[str, Any]:
    ocr_c = round(min(max(float(ocr_conf), 0.0), 1.0), 4)
    cls_c = round(min(max(float(cls_conf), 0.0), 1.0), 4)
    overall = round(0.45 * ocr_c + 0.55 * cls_c, 4)
    if overall >= 0.80 and cls_c >= 0.75:
        level = "high"
    elif overall >= 0.55:
        level = "medium"
    else:
        level = "low"

    return {
        "ocr_confidence": ocr_c,
        "classification_confidence": cls_c,
        "overall_confidence": overall,
        "level": level,
        "needs_review": level != "high",
        "source_segments": source_indices or [],
    }


def _normalize_camelcase_name(text: str) -> str:
    """Split fused CamelCase tokens like 'AaravMehta' -> 'Aarav Mehta'."""
    return re.sub(r"([a-z]{2,})([A-Z][a-z]{2,})", r"\1 \2", text)


def _looks_like_person_name(
    text: str,
    dicts: dict[str, Any],
) -> tuple[bool, float]:
    """
    Evaluate whether a text segment looks like a human person's name
    without confusing company brands, titles, or addresses.
    """
    cleaned = re.sub(r"^(?:name\s*[:\-]\s*)", "", text.strip(), flags=re.I)
    cleaned = _normalize_camelcase_name(cleaned)
    no_honorific = HONORIFIC_REGEX.sub("", cleaned).strip()
    had_honorific = no_honorific != cleaned

    # Remove trailing degree suffixes after comma e.g. "Dr. Rajesh Sharma, MD"
    if "," in no_honorific:
        parts = [p.strip() for p in no_honorific.split(",") if p.strip()]
        if parts:
            no_honorific = parts[0]

    if not no_honorific or len(no_honorific) < 3 or len(no_honorific) > 42:
        return False, 0.0

    # Must not contain digits, @, www, or slashes
    if re.search(r"[\d@/\\|+]", no_honorific):
        return False, 0.0

    lower = no_honorific.lower()

    # Reject if it contains company suffixes or company keywords
    for suf in dicts["company_suffixes"]:
        if re.search(rf"\b{re.escape(suf)}\b", lower):
            return False, 0.0
    for kw in dicts["company_keywords"]:
        if re.search(rf"\b{re.escape(kw)}\b", lower):
            return False, 0.0

    # Reject if it matches a designation or address keyword or city/state
    for des in dicts["designations"]:
        if re.search(rf"\b{re.escape(des)}\b", lower):
            return False, 0.0
    for addr_kw in dicts["address_keywords"]:
        if re.search(rf"\b{re.escape(addr_kw)}\b", lower):
            return False, 0.0
    for city in dicts["cities"]:
        if lower == city.lower():
            return False, 0.0

    tokens = [t for t in re.split(r"[\s.]+", no_honorific) if t]
    if len(tokens) < 1 or len(tokens) > 4:
        return False, 0.0

    # Check that all tokens are alphabetic (allowing hyphens/apostrophes)
    if not all(re.match(r"^[A-Za-z'\-]+$", t) for t in tokens):
        return False, 0.0

    # Single-word all-caps at top of card is very often a brand/logo, not a full name
    if len(tokens) == 1 and not had_honorific:
        return False, 0.0

    # Ensure at least one token has >= 3 letters
    if not any(len(t) >= 3 for t in tokens):
        return False, 0.0

    score = 0.76
    if 2 <= len(tokens) <= 3:
        score += 0.12
    if had_honorific:
        score += 0.10
    # Title case check (e.g., "Aarav Mehta")
    if all(t[0].isupper() for t in tokens if len(t) > 1):
        score += 0.05

    return True, min(score, 0.96)


def _split_first_last_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    cleaned = HONORIFIC_REGEX.sub("", full_name.strip()).strip()
    if "," in cleaned:
        cleaned = cleaned.split(",")[0].strip()
    parts = [p for p in cleaned.split() if p]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def extract_contact_from_ocr(
    segments: list[dict[str, Any]],
    image_shape: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """
    Hybrid Rule-based + Regex + Spatial + Dictionary + Contextual Extraction Engine.
    Strictly preserves missing fields as None (never invents information) and computes
    separate OCR confidence and field-classification confidence scores.
    """
    dicts = load_dictionaries()
    card_h = float(image_shape[0]) if image_shape and image_shape[0] > 0 else 600.0

    extracted: dict[str, Any] = {
        "full_name": None,
        "first_name": None,
        "last_name": None,
        "company_name": None,
        "designation": None,
        "phone": None,
        "raw_phone": None,
        "alternate_phone": None,
        "raw_alternate_phone": None,
        "email": None,
        "website": None,
        "address": None,
        "city": None,
        "state": None,
        "postal_code": None,
        "country": None,
        "education": None,
        "linkedin_url": None,
        "other_information": [],
    }
    confidence: dict[str, dict[str, Any]] = {}
    consumed_segments: set[int] = set()

    # ------------------------------------------------------------------------
    # Pass 1: Deterministic Pattern Fields (Email, LinkedIn, Website, Phones, PIN)
    # ------------------------------------------------------------------------
    phones_found: list[tuple[str, str, float, int]] = []  # (normalized, raw, ocr_conf, idx)

    for seg in segments:
        idx = int(seg.get("reading_order", 0))
        text = str(seg.get("text", "")).strip()
        ocr_conf = float(seg.get("confidence", 0.85))
        if not text:
            continue

        # 1A. Email
        email_match = EMAIL_REGEX.search(text)
        if email_match and extracted["email"] is None:
            email_val = email_match.group(1).strip().lower()
            extracted["email"] = email_val
            confidence["email"] = _confidence_entry(ocr_conf, 0.98, [idx])
            consumed_segments.add(idx)

        # 1B. LinkedIn URL
        li_match = LINKEDIN_REGEX.search(text)
        if li_match and extracted["linkedin_url"] is None:
            raw_li = li_match.group(1).strip().rstrip(".,;/")
            if not raw_li.lower().startswith("http"):
                raw_li = f"https://{raw_li}"
            extracted["linkedin_url"] = raw_li
            confidence["linkedin_url"] = _confidence_entry(ocr_conf, 0.96, [idx])
            consumed_segments.add(idx)

        # 1C. Website URL (skip if it's an email line or linkedin)
        if not re.match(r"^\s*(?:e-?mail|mail)\s*[:\-]", text, re.I):
            text_without_email = EMAIL_REGEX.sub(" ", text)
            text_without_li = LINKEDIN_REGEX.sub(" ", text_without_email)
            for url_m in URL_REGEX.finditer(text_without_li):
                cand_url = url_m.group(1).strip().rstrip(".,;/")
                if "linkedin.com" in cand_url.lower():
                    continue
                if extracted["website"] is None:
                    norm_url = (
                        cand_url
                        if cand_url.lower().startswith(("http://", "https://"))
                        else f"https://{cand_url}"
                    )
                    extracted["website"] = norm_url
                    cls_score = 0.95 if cand_url.lower().startswith(("http", "www.")) else 0.88
                    confidence["website"] = _confidence_entry(ocr_conf, cls_score, [idx])
                    consumed_segments.add(idx)
                    break

        # 1D. Postal / PIN Code (check before phones so 6-digit PINs aren't confused)
        pin_match = INDIAN_PIN_REGEX.search(text)
        if pin_match and extracted["postal_code"] is None:
            pin_val = re.sub(r"\s+", "", pin_match.group(1))
            if len(pin_val) == 6:
                extracted["postal_code"] = pin_val
                confidence["postal_code"] = _confidence_entry(ocr_conf, 0.94, [idx])

        # 1E. Phone Numbers
        # Skip segments that look purely like Fax if labeled "Fax"
        if re.match(r"^\s*fax\b", text, re.I):
            continue
        for ph_m in PHONE_CANDIDATE_REGEX.finditer(text):
            raw_ph = ph_m.group(0).strip()
            norm_ph = normalize_phone_number(raw_ph)
            if norm_ph:
                if not any(existing[0] == norm_ph for existing in phones_found):
                    phones_found.append((norm_ph, raw_ph, ocr_conf, idx))
                    consumed_segments.add(idx)

    if phones_found:
        extracted["phone"] = phones_found[0][0]
        extracted["raw_phone"] = phones_found[0][1]
        confidence["phone"] = _confidence_entry(
            phones_found[0][2], 0.95, [phones_found[0][3]]
        )
        if len(phones_found) > 1:
            extracted["alternate_phone"] = phones_found[1][0]
            extracted["raw_alternate_phone"] = phones_found[1][1]
            confidence["alternate_phone"] = _confidence_entry(
                phones_found[1][2], 0.92, [phones_found[1][3]]
            )

    # ------------------------------------------------------------------------
    # Pass 2: Education, Designation (Job Title), and Location / Address
    # ------------------------------------------------------------------------
    designation_candidates: list[tuple[float, str, float, int]] = []
    address_segment_indices: list[int] = []
    address_lines: list[str] = []
    address_ocr_confs: list[float] = []

    for seg in segments:
        idx = int(seg.get("reading_order", 0))
        text = str(seg.get("text", "")).strip()
        ocr_conf = float(seg.get("confidence", 0.85))
        if not text:
            continue
        lower = text.lower()

        # 2A. Education detection
        if extracted["education"] is None:
            edu_hits = [
                kw
                for kw in dicts["education_keywords"]
                if re.search(rf"(?<![a-zA-Z]){re.escape(kw)}(?![a-zA-Z])", lower)
            ]
            if edu_hits:
                first_part = text.split(",", 1)[0].lower() if "," in text else ""
                first_part_has_edu = any(
                    re.search(rf"(?<![a-zA-Z]){re.escape(kw)}(?![a-zA-Z])", first_part)
                    for kw in dicts["education_keywords"]
                )
                if "," in text and not first_part_has_edu:
                    edu_part = text.split(",", 1)[1].strip()
                    extracted["education"] = edu_part
                    confidence["education"] = _confidence_entry(ocr_conf, 0.88, [idx])
                else:
                    extracted["education"] = text
                    confidence["education"] = _confidence_entry(ocr_conf, 0.92, [idx])
                    consumed_segments.add(idx)

        # 2B. Designation detection
        if idx not in consumed_segments and "@" not in text:
            matched_titles = [
                title
                for title in dicts["designations"]
                if re.search(rf"\b{re.escape(title)}\b", lower)
            ]
            if matched_titles and len(text) <= 65 and not re.search(r"\d{5,}", text):
                # Prefer longer/more specific title matches
                best_title = max(matched_titles, key=len)
                cls_score = 0.92 if len(best_title) >= 6 else 0.84
                designation_candidates.append((cls_score, text, ocr_conf, idx))

        # 2C. City & State detection
        for city_name, mapped_state in dicts["cities"].items():
            if re.search(rf"\b{re.escape(city_name)}\b", text, re.I):
                if extracted["city"] is None:
                    extracted["city"] = (
                        "Bengaluru" if city_name.lower() == "bangalore" else city_name
                    )
                    confidence["city"] = _confidence_entry(ocr_conf, 0.92, [idx])
                if extracted["state"] is None and mapped_state:
                    extracted["state"] = mapped_state
                    confidence["state"] = _confidence_entry(ocr_conf, 0.88, [idx])

        for state_name in dicts["indian_states"]:
            if re.search(rf"\b{re.escape(state_name)}\b", text, re.I):
                if extracted["state"] is None:
                    extracted["state"] = state_name
                    confidence["state"] = _confidence_entry(ocr_conf, 0.93, [idx])

        # 2D. Address line classification
        has_addr_kw = any(
            re.search(rf"\b{re.escape(kw)}\b\.?", lower)
            for kw in dicts["address_keywords"]
        )
        has_pin = bool(INDIAN_PIN_REGEX.search(text))
        has_city_or_state = any(
            re.search(rf"\b{re.escape(c)}\b", text, re.I) for c in dicts["cities"]
        ) or any(
            re.search(rf"\b{re.escape(s)}\b", text, re.I)
            for s in dicts["indian_states"]
        )
        has_comma_number = bool(re.search(r"(?:#\s*\d+|\b\d{1,4}\s*,)", text))

        if (has_addr_kw or has_pin or has_city_or_state or has_comma_number) and "@" not in text:
            # Make sure we don't classify a pure phone or email line as address
            if idx not in consumed_segments or has_pin or has_addr_kw:
                address_segment_indices.append(idx)
                address_lines.append(text)
                address_ocr_confs.append(ocr_conf)
                consumed_segments.add(idx)

    if designation_candidates:
        designation_candidates.sort(key=lambda x: x[0], reverse=True)
        best_cls, best_des_text, best_ocr_c, best_idx = designation_candidates[0]
        extracted["designation"] = best_des_text
        confidence["designation"] = _confidence_entry(
            best_ocr_c, best_cls, [best_idx]
        )
        consumed_segments.add(best_idx)

    if address_lines:
        full_addr = ", ".join(
            line.strip().rstrip(",") for line in address_lines if line.strip()
        )
        extracted["address"] = full_addr
        mean_addr_ocr = sum(address_ocr_confs) / len(address_ocr_confs)
        addr_cls = 0.88 if extracted["postal_code"] or extracted["city"] else 0.74
        confidence["address"] = _confidence_entry(
            mean_addr_ocr, addr_cls, address_segment_indices
        )

    # Country inference from explicit mention or confirmed Indian location/phone
    all_text_joined = " ".join(str(s.get("text", "")) for s in segments)
    if re.search(r"\bIndia\b", all_text_joined, re.I) or (
        extracted["state"] in dicts["indian_states"]
        or (extracted["postal_code"] and len(extracted["postal_code"]) == 6)
        or (extracted["phone"] and extracted["phone"].startswith("+91"))
    ):
        extracted["country"] = "India"
        confidence["country"] = _confidence_entry(0.95, 0.90, [])
    else:
        for country_cand in ["United States", "USA", "United Kingdom", "UK", "Singapore", "UAE", "Canada", "Australia", "Germany"]:
            if re.search(rf"\b{re.escape(country_cand)}\b", all_text_joined, re.I):
                extracted["country"] = country_cand
                confidence["country"] = _confidence_entry(0.92, 0.90, [])
                break

    # ------------------------------------------------------------------------
    # Pass 3: Company Name & Person Full Name (Spatial + Keyword + Domain Signals)
    # ------------------------------------------------------------------------
    # Extract domain stem hint from corporate email or website
    domain_stem: str | None = None
    if extracted["email"]:
        email_domain = extracted["email"].split("@")[-1].lower()
        if email_domain not in COMMON_GENERIC_EMAIL_DOMAINS:
            domain_stem = email_domain.split(".")[0]
    if not domain_stem and extracted["website"]:
        clean_host = re.sub(r"^https?://(?:www\.)?", "", extracted["website"].lower())
        domain_stem = clean_host.split(".")[0]

    company_candidates: list[tuple[float, str, float, int]] = []
    name_candidates: list[tuple[float, str, float, int]] = []

    designation_idx = (
        confidence["designation"]["source_segments"][0]
        if "designation" in confidence and confidence["designation"]["source_segments"]
        else None
    )

    for seg in segments:
        idx = int(seg.get("reading_order", 0))
        if idx in consumed_segments:
            continue

        text = str(seg.get("text", "")).strip()
        ocr_conf = float(seg.get("confidence", 0.85))
        bbox = seg.get("bbox", [0, 0, 100, 30])
        y_min = float(bbox[1]) if len(bbox) >= 4 else 0.0
        rel_y = y_min / max(card_h, 1.0)
        lower = text.lower()

        if len(text) < 2 or re.search(r"[@/\\]", text):
            continue

        # Evaluate Company Score
        comp_score = 0.0
        has_suffix = any(
            re.search(rf"\b{re.escape(suf)}\b", lower)
            for suf in dicts["company_suffixes"]
        )
        has_comp_kw = any(
            re.search(rf"\b{re.escape(kw)}\b", lower)
            for kw in dicts["company_keywords"]
        )
        matches_domain = bool(
            domain_stem
            and len(domain_stem) >= 3
            and domain_stem in re.sub(r"\s+", "", lower)
        )

        if has_suffix:
            comp_score = 0.95
        elif has_comp_kw and matches_domain:
            comp_score = 0.93
        elif has_comp_kw:
            comp_score = 0.86
        elif matches_domain and len(text) <= 45:
            comp_score = 0.84
        elif text.isupper() and 1 <= len(text.split()) <= 3 and rel_y <= 0.35:
            # Prominent all-caps brand/logo header near top of card
            comp_score = 0.72

        if comp_score > 0.0:
            company_candidates.append((comp_score, text, ocr_conf, idx))

        # Evaluate Person Name Score
        is_name, base_name_score = _looks_like_person_name(text, dicts)
        if is_name and not has_suffix and not has_comp_kw:
            name_score = base_name_score
            # Spatial boost: immediately above designation is the strongest signal on a business card
            if designation_idx is not None and idx == designation_idx - 1:
                name_score += 0.12
            elif rel_y <= 0.60:
                name_score += 0.05

            # Email local-part correlation boost
            if extracted["email"]:
                local_part = extracted["email"].split("@")[0].lower()
                name_tokens = [t.lower() for t in re.split(r"\W+", text) if len(t) >= 3]
                if any(tok in local_part for tok in name_tokens):
                    name_score += 0.10

            name_candidates.append((min(name_score, 0.98), text, ocr_conf, idx))

    if company_candidates:
        company_candidates.sort(key=lambda x: x[0], reverse=True)
        best_c_score, best_c_text, best_c_ocr, best_c_idx = company_candidates[0]
        extracted["company_name"] = best_c_text
        confidence["company_name"] = _confidence_entry(
            best_c_ocr, best_c_score, [best_c_idx]
        )
        consumed_segments.add(best_c_idx)

    # Filter name candidates to exclude any segment chosen as company_name
    name_candidates = [
        nc for nc in name_candidates if nc[3] not in consumed_segments
    ]
    if name_candidates:
        name_candidates.sort(key=lambda x: x[0], reverse=True)
        best_n_score, best_n_text, best_n_ocr, best_n_idx = name_candidates[0]
        # Clean comma suffix if education was attached on the same line
        raw_name_text = _normalize_camelcase_name(best_n_text)
        clean_full_name = (
            raw_name_text.split(",")[0].strip()
            if "," in raw_name_text
            else raw_name_text
        )
        extracted["full_name"] = clean_full_name
        first_n, last_n = _split_first_last_name(clean_full_name)
        extracted["first_name"] = first_n
        extracted["last_name"] = last_n
        confidence["full_name"] = _confidence_entry(
            best_n_ocr, best_n_score, [best_n_idx]
        )
        confidence["first_name"] = _confidence_entry(
            best_n_ocr, best_n_score, [best_n_idx]
        )
        if last_n:
            confidence["last_name"] = _confidence_entry(
                best_n_ocr, best_n_score, [best_n_idx]
            )
        consumed_segments.add(best_n_idx)

    # If company_name is still None and we have an remaining prominent header segment not used as name
    if extracted["company_name"] is None:
        for seg in segments:
            idx = int(seg.get("reading_order", 0))
            if idx in consumed_segments:
                continue
            text = str(seg.get("text", "")).strip()
            ocr_conf = float(seg.get("confidence", 0.85))
            if 3 <= len(text) <= 45 and not re.search(r"\d{4,}", text):
                extracted["company_name"] = text
                confidence["company_name"] = _confidence_entry(ocr_conf, 0.62, [idx])
                consumed_segments.add(idx)
                break

    # ------------------------------------------------------------------------
    # Pass 4: Collect Unclassified Segments into other_information
    # ------------------------------------------------------------------------
    other_info: list[str] = []
    for seg in segments:
        idx = int(seg.get("reading_order", 0))
        if idx not in consumed_segments:
            txt = str(seg.get("text", "")).strip()
            if txt:
                other_info.append(txt)
    extracted["other_information"] = other_info

    # Determine whether human review is required
    key_fields = ["full_name", "company_name", "phone", "email"]
    has_missing_identity = not (extracted["full_name"] or extracted["company_name"])
    has_missing_contact = not (extracted["phone"] or extracted["email"])
    has_low_confidence = any(
        confidence.get(k, {}).get("needs_review", False)
        for k in key_fields
        if extracted.get(k) is not None
    )

    needs_human_review = (
        has_missing_identity or has_missing_contact or has_low_confidence
    )

    return {
        "extracted_data": extracted,
        "extraction_confidence": confidence,
        "needs_human_review": needs_human_review,
    }
