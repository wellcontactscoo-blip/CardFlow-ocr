import json
import os
import sys
from pathlib import Path
import cv2
import numpy as np
from rapidfuzz.distance import Levenshtein

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.services.preprocessor import preprocess_card_image
from app.services.ocr_engine import OcrEngineService
from app.services.extractor import extract_contact_from_ocr

BENCHMARK_DIR = Path(__file__).resolve().parent
DATASET_DIR = BENCHMARK_DIR / "dataset"
DATASET_DIR.mkdir(parents=True, exist_ok=True)

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Rohan", "Karthik",
    "Vikram", "Siddharth", "Priya", "Ananya", "Diya", "Aadhya", "Kavya", "Meera",
    "Neha", "Pooja", "Shreya", "Nandini",
]
LAST_NAMES = [
    "Mehta", "Sharma", "Nair", "Kulkarni", "Reddy", "Singhania", "Iyer", "Patel",
    "Verma", "Joshi", "Rao", "Deshmukh", "Kapoor", "Malhotra", "Bhatia", "Menon",
    "Chatterjee", "Sen", "Agarwal", "Gupta",
]
COMPANIES = [
    ("MEHTA TECHNOLOGIES PVT LTD", "mehtatech.in"),
    ("VERDANT FINTECH SOLUTIONS LLP", "verdantfintech.com"),
    ("KULKARNI INFRASTRUCTURE LIMITED", "kulkarniinfra.co.in"),
    ("DECCAN BIOTECH LABS PRIVATE LIMITED", "deccanbiotech.in"),
    ("SINGHANIA CAPITAL PARTNERS INC", "singhaniacapital.com"),
    ("APEX CLOUD SYSTEMS PVT LTD", "apexcloud.in"),
    ("HORIZON DIGITAL VENTURES LLP", "horizondigital.com"),
    ("PRISM ANALYTICS SOLUTIONS LIMITED", "prismanalytics.io"),
    ("NEXUS HEALTHCARE DIAGNOSTICS PVT LTD", "nexushealth.in"),
    ("PINNACLE LOGISTICS ENTERPRISES LTD", "pinnaclelogistics.com"),
]
DESIGNATIONS = [
    "Chief Executive Officer",
    "Chief Technology Officer",
    "Managing Director",
    "Founder & CEO",
    "Vice President",
    "Senior Software Engineer",
    "Business Development Manager",
    "Product Manager",
    "Principal Consultant",
    "Senior Partner",
]
LOCATIONS = [
    ("402, Prestige Meridian, M.G. Road", "Bengaluru", "Karnataka", "560001"),
    ("Level 9, One BKC, Bandra Road", "Mumbai", "Maharashtra", "400051"),
    ("Plot 44, Hinjewadi Phase 2, Tech Park", "Pune", "Maharashtra", "411057"),
    ("Block C, Madhapur Main Road", "Hyderabad", "Telangana", "500081"),
    ("Suite 12, Connaught Place, Inner Circle", "New Delhi", "Delhi", "110001"),
    ("Tower B, Cyber City, Sector 24", "Gurugram", "Haryana", "122002"),
    ("No. 18, Anna Salai, Mount Road", "Chennai", "Tamil Nadu", "600002"),
    ("301, SG Highway, Prahlad Nagar", "Ahmedabad", "Gujarat", "380015"),
]
EDUCATIONS = [
    "B.Tech, MBA",
    "PhD, CFA",
    "M.Tech",
    "B.Com, FCA",
    "MBBS, MD",
    None,
    None,
    None,
]
FONTS = [
    cv2.FONT_HERSHEY_SIMPLEX,
    cv2.FONT_HERSHEY_DUPLEX,
    cv2.FONT_HERSHEY_COMPLEX,
]


def generate_100_benchmark_cards() -> list[dict]:
    manifest: list[dict] = []
    for i in range(100):
        fn = FIRST_NAMES[i % len(FIRST_NAMES)]
        ln = LAST_NAMES[(i * 3 + 1) % len(LAST_NAMES)]
        full_name = f"{fn} {ln}"
        comp_name, domain = COMPANIES[i % len(COMPANIES)]
        designation = DESIGNATIONS[(i * 2) % len(DESIGNATIONS)]
        street, city, state, pin = LOCATIONS[i % len(LOCATIONS)]
        edu = EDUCATIONS[i % len(EDUCATIONS)]

        phone_raw = f"+91 98{i:02d}5 {43210 + i:05d}"
        phone_norm = f"+9198{i:02d}5{43210 + i:05d}"
        email = f"{fn.lower()}.{ln.lower()}@{domain}"
        website = f"https://www.{domain}"
        linkedin = (
            f"https://linkedin.com/in/{fn.lower()}{ln.lower()}"
            if i % 3 != 0
            else None
        )

        is_dark = i % 5 == 1
        is_low_res = i % 7 == 2
        layout_style = ["standard", "two_column", "banner"][i % 3]
        font = FONTS[i % len(FONTS)]

        bg = (34, 24, 18) if is_dark else (252, 251, 249)
        fg = (245, 245, 245) if is_dark else (30, 25, 20)
        accent = (179, 198, 25) if is_dark else (220, 100, 30)

        w, h = (760, 440) if is_low_res else (1000, 580)
        scale = 0.76 if is_low_res else 1.0

        img = np.full((h, w, 3), bg, dtype=np.uint8)
        cv2.rectangle(img, (0, 0), (int(14 * scale), h), accent, -1)
        cv2.circle(
            img,
            (int(65 * scale), int(62 * scale)),
            int(20 * scale),
            accent,
            2,
        )

        cv2.putText(
            img,
            comp_name,
            (int(105 * scale), int(70 * scale)),
            font,
            0.80 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            full_name,
            (int(55 * scale), int(155 * scale)),
            font,
            1.05 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            designation,
            (int(55 * scale), int(202 * scale)),
            font,
            0.75 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )

        y = int(245 * scale)
        if edu:
            cv2.putText(
                img,
                edu,
                (int(55 * scale), y),
                font,
                0.68 * scale,
                fg,
                2,
                cv2.LINE_AA,
            )
            y += int(38 * scale)

        cv2.putText(
            img,
            f"Mob: {phone_raw}",
            (int(55 * scale), y),
            font,
            0.70 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        y += int(38 * scale)

        cv2.putText(
            img,
            f"Email: {email}",
            (int(55 * scale), y),
            font,
            0.68 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        y += int(38 * scale)

        cv2.putText(
            img,
            f"Web: www.{domain}",
            (int(55 * scale), y),
            font,
            0.66 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        y += int(38 * scale)

        if linkedin:
            cv2.putText(
                img,
                linkedin.replace("https://", ""),
                (int(55 * scale), y),
                font,
                0.64 * scale,
                fg,
                2,
                cv2.LINE_AA,
            )

        addr_full = f"{street}, {city}, {state} - {pin}, India"
        cv2.putText(
            img,
            street,
            (int(55 * scale), h - int(65 * scale)),
            font,
            0.64 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            f"{city}, {state} - {pin}, India",
            (int(55 * scale), h - int(28 * scale)),
            font,
            0.64 * scale,
            fg,
            2,
            cv2.LINE_AA,
        )

        fname = f"bench_card_{i+1:03d}.jpg"
        fpath = DATASET_DIR / fname
        cv2.imwrite(str(fpath), img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

        expected_lines = [
            comp_name,
            full_name,
            designation,
            *( [edu] if edu else [] ),
            f"Mob: {phone_raw}",
            f"Email: {email}",
            f"Web: www.{domain}",
            *( [linkedin.replace("https://", "")] if linkedin else [] ),
            street,
            f"{city}, {state} - {pin}, India",
        ]

        manifest.append(
            {
                "id": i + 1,
                "filename": fname,
                "category": {
                    "is_dark": is_dark,
                    "is_low_res": is_low_res,
                    "layout": layout_style,
                },
                "ground_truth_text": "\n".join(expected_lines),
                "ground_truth_fields": {
                    "full_name": full_name,
                    "company_name": comp_name,
                    "designation": designation,
                    "phone": phone_norm,
                    "email": email,
                    "website": website,
                    "linkedin_url": linkedin,
                    "education": edu,
                    "city": city,
                    "state": state,
                    "postal_code": pin,
                    "address": addr_full,
                },
            }
        )

    manifest_path = BENCHMARK_DIR / "ground_truth.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def evaluate_benchmark(sample_limit: int = 25) -> dict:
    """
    Generate all 100 varied benchmark cards and evaluate OCR CER and per-field
    Precision, Recall, F1, and Exact/Normalized Match accuracy.
    """
    manifest = generate_100_benchmark_cards()
    eval_subset = manifest[:sample_limit]

    fields_to_score = [
        "phone",
        "email",
        "full_name",
        "company_name",
        "designation",
        "address",
        "city",
        "state",
        "postal_code",
        "website",
        "linkedin_url",
        "education",
    ]

    stats = {
        f: {"tp": 0, "fp": 0, "fn": 0, "tn": 0} for f in fields_to_score
    }
    total_chars = 0
    total_char_edits = 0

    ocr_service = OcrEngineService.get_instance()

    for item in eval_subset:
        fpath = DATASET_DIR / item["filename"]
        raw_bytes = fpath.read_bytes()
        prep = preprocess_card_image(raw_bytes)
        ocr_out = ocr_service.run_ocr(prep.processed_image)
        ext_res = extract_contact_from_ocr(
            ocr_out["segments"], image_shape=prep.processed_shape
        )
        pred = ext_res["extracted_data"]
        gt = item["ground_truth_fields"]

        # CER calculation (normalized alphanumeric characters)
        gt_norm_str = "".join(
            c.lower() for c in item["ground_truth_text"] if c.isalnum()
        )
        ocr_norm_str = "".join(
            c.lower() for c in ocr_out["raw_ocr_text"] if c.isalnum()
        )
        total_chars += max(len(gt_norm_str), 1)
        total_char_edits += Levenshtein.distance(gt_norm_str, ocr_norm_str)

        for field in fields_to_score:
            gt_val = gt.get(field)
            pred_val = pred.get(field)

            if gt_val is None and pred_val is None:
                stats[field]["tn"] += 1
            elif gt_val is None and pred_val is not None:
                stats[field]["fp"] += 1
            elif gt_val is not None and pred_val is None:
                stats[field]["fn"] += 1
            else:
                # Compare normalized strings
                g_clean = "".join(
                    c.lower() for c in str(gt_val) if c.isalnum()
                )
                p_clean = "".join(
                    c.lower() for c in str(pred_val) if c.isalnum()
                )
                if field in ("phone", "email", "postal_code"):
                    is_match = g_clean == p_clean
                else:
                    dist = Levenshtein.normalized_similarity(g_clean, p_clean)
                    is_match = dist >= 0.85

                if is_match:
                    stats[field]["tp"] += 1
                else:
                    stats[field]["fp"] += 1
                    stats[field]["fn"] += 1

    cer = round((total_char_edits / max(total_chars, 1)) * 100.0, 2)
    field_metrics = {}
    for field, s in stats.items():
        tp, fp, fn, tn = s["tp"], s["fp"], s["fn"], s["tn"]
        precision = round((tp / (tp + fp)) * 100.0, 2) if (tp + fp) > 0 else 100.0
        recall = round((tp / (tp + fn)) * 100.0, 2) if (tp + fn) > 0 else 100.0
        f1 = (
            round((2 * precision * recall) / (precision + recall), 2)
            if (precision + recall) > 0
            else 0.0
        )
        accuracy = round(((tp + tn) / len(eval_subset)) * 100.0, 2)
        field_metrics[field] = {
            "accuracy_pct": accuracy,
            "precision_pct": precision,
            "recall_pct": recall,
            "f1_pct": f1,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
        }

    summary = {
        "dataset_total_cards_generated": len(manifest),
        "cards_evaluated_with_paddleocr": len(eval_subset),
        "ocr_character_error_rate_pct": cer,
        "field_metrics": field_metrics,
    }
    out_path = BENCHMARK_DIR / "benchmark_results.json"
    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    res = evaluate_benchmark(sample_limit=15)
    print(json.dumps(res, indent=2), flush=True)
