# CardFlow: Visiting Card Scanner, OCR & Contact CRM

CardFlow is a production-quality visiting card scanning, local OCR extraction, and contact management CRM built with **Next.js (App Router, TypeScript, Tailwind CSS)**, **Supabase (PostgreSQL, Row Level Security, Private Storage Buckets)**, and a **Python FastAPI + OpenCV + PaddleOCR** backend.

---

## Core Capabilities

- **Zero External AI or Paid OCR APIs**: Runs 100% locally using OpenCV image preprocessing, cached PaddleOCR (`PP-OCRv5`), and a hybrid rule/regex/dictionary/spatial extraction engine.
- **Single-Card Scanning (`Upload -> Preprocess -> OCR -> Extract -> Review -> Save`)**:
  - Camera capture, file upload, and drag-and-drop (`JPG`, `JPEG`, `PNG`, `WEBP` up to 10 MB).
  - Pre-upload 90-degree rotation and edge-trim controls.
  - Side-by-side comparison of original card vs. OpenCV-preprocessed card and interactive raw OCR bounding-box inspector.
  - Separate **OCR Confidence** and **Classification Confidence** badges per field.
  - Non-hallucinating extraction: missing fields remain `null` and are never invented.
- **Bulk Scanning (Up to 50 Cards per Batch)**:
  - Non-blocking HTTP batch submission backed by a persistent background worker queue with configurable concurrency (`MAX_CONCURRENT_OCR_WORKERS`).
  - Automatic recovery of unfinished (`uploaded`, `queued`, `processing`) jobs on server restart.
  - Real-time batch progress metrics (`total`, `completed`, `pending`, `failed`), per-card retry, failed-batch retry, and idempotent bulk contact creation (`scan_id` uniqueness prevents duplicate contacts on retry).
- **Contact Management CRM**:
  - Full-text search across name, company, phone, email, city, designation, and notes.
  - Multi-filter support (custom tags, date ranges, sorting, pagination).
  - Pre-save duplicate detection (normalized E.164 phone match, case-insensitive email match, and Levenshtein fuzzy name + company similarity) with a side-by-side merge/comparison modal.
  - Custom colored tags and timestamped contact notes timeline.
- **Instant Communication & Export**:
  - **WhatsApp**: Opens `https://wa.me/<digits>?text=<encoded_template>` with customizable greeting templates (`{first_name}`, `{full_name}`, `{company}`, `{sender_name}`, `{sender_company}`).
  - **Email**: Opens `mailto:` with customizable subject and body templates.
  - **Call**: Direct `tel:` trigger with one-click copy fallback on desktop.
  - **CSV & Excel Export**: RFC 4180 CSV and UTF-8 BOM CSV export with formula-injection sanitization (`=`, `+`, `-`, `@`).

---

## Architecture & Directory Structure

```text
business-card-ocr/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── login/                  # Sign-in page
│   │   ├── register/               # Account & organization registration
│   │   ├── forgot-password/        # Password reset token request
│   │   ├── reset-password/         # Password reset completion
│   │   ├── dashboard/              # Metrics, quick actions, recent scans & contacts
│   │   ├── scan/                   # Single-card scanner (camera, upload, rotate, crop)
│   │   ├── scans/[id]/review/      # Side-by-side extraction review & duplicate check
│   │   ├── bulk-scan/              # Multi-image batch uploader (up to 50 cards)
│   │   ├── batches/[id]/           # Live batch progress & bulk review/save
│   │   ├── contacts/               # CRM table, filters, communication & CSV export
│   │   ├── contacts/[id]/          # Contact detail, card preview, inline edit & notes
│   │   ├── history/                # Scan & batch audit history
│   │   ├── tags/                   # Custom colored tag management
│   │   └── settings/               # Profile, organization, password & OCR engine status
│   ├── components/                 # Reusable UI primitives, AppShell & modals
│   ├── context/                    # AuthContext & ToastContext
│   ├── lib/                        # API client, utilities, Vitest unit tests & Supabase SSR
│   └── types/                      # Strict TypeScript interfaces matching database schema
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI endpoints, RLS enforcement & error handling
│   │   ├── config.py               # Environment configuration & limits
│   │   ├── database.py             # SQLAlchemy models matching all 9 Supabase tables
│   │   ├── auth.py                 # JWT authentication & PBKDF2 password hashing
│   │   ├── storage.py              # Private buckets & HMAC-SHA256 signed URLs
│   │   ├── serializers.py          # JSON response serializers
│   │   ├── config_dictionaries.json# Configurable titles, suffixes, degrees & Indian PIN prefixes
│   │   └── services/
│   │       ├── preprocessor.py     # OpenCV boundary warp, deskew, LAB CLAHE & sharpening
│   │       ├── ocr_engine.py       # Thread-safe local PaddleOCR (PP-OCRv5) wrapper
│   │       ├── extractor.py        # Hybrid regex/dictionary/spatial extraction engine
│   │       ├── duplicates.py       # E.164 phone, email & RapidFuzz duplicate detector
│   │       └── queue_worker.py     # Persistent multi-worker background queue
│   ├── scripts/
│   │   └── generate_sample_cards.py# Deterministic realistic visiting card image generator
│   ├── tests/
│   │   └── test_cardflow_e2e.py    # Automated E2E, RLS, signed URL & 10/20/50 batch tests
│   └── benchmark/
│       └── run_benchmark.py        # 100-card benchmark dataset generator & evaluator
└── supabase/
    ├── config.toml                 # Supabase local CLI configuration
    └── migrations/                 # PostgreSQL schema, RLS policies & storage buckets
        ├── 00001_initial_schema.sql
        ├── 00002_rls_policies.sql
        └── 00003_storage_buckets.sql
```

---

## Quickstart Guide

### 1. Prerequisites
- **Node.js** `>= 20.x` and `npm`
- **Python** `3.12` with `paddlepaddle`, `paddleocr`, `opencv-python`, `fastapi`, `uvicorn`, `sqlalchemy`, `rapidfuzz`, and `pyjwt` installed.

### 2. Environment Variables
Copy `.env.example` to `.env.local` (already configured for local development):
```bash
cp .env.example .env.local
```

### 3. Start the Python OCR Backend
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Verify the backend health check at `http://127.0.0.1:8000/api/v1/health`.

### 4. Start the Next.js Frontend
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Running Automated Tests & Benchmark

- **Frontend Unit Tests (Vitest)**:
  ```bash
  npm test
  ```
- **TypeScript Strict Typecheck**:
  ```bash
  npx tsc --noEmit
  ```
- **Backend E2E, RLS Isolation, Private Storage & 10/20/50 Batch Tests**:
  ```bash
  python backend/tests/test_cardflow_e2e.py
  ```
- **100-Card OCR Benchmark Suite**:
  ```bash
  python backend/benchmark/run_benchmark.py
  ```

---

## Documentation Index

- [IMPLEMENTATION_PLAN.md](file:///c:/Users/devil/Desktop/business-card-ocr/IMPLEMENTATION_PLAN.md) - Phased milestone plan and architectural decisions.
- [ARCHITECTURE.md](file:///c:/Users/devil/Desktop/business-card-ocr/ARCHITECTURE.md) - System architecture, data flow, and security boundaries.
- [DATABASE_SCHEMA.md](file:///c:/Users/devil/Desktop/business-card-ocr/DATABASE_SCHEMA.md) - Complete ER diagram, 9 tables, indexes, and RLS policies.
- [OCR_PIPELINE.md](file:///c:/Users/devil/Desktop/business-card-ocr/OCR_PIPELINE.md) - OpenCV preprocessing stages, PaddleOCR configuration, and hybrid field extraction rules.
- [API_DOCUMENTATION.md](file:///c:/Users/devil/Desktop/business-card-ocr/API_DOCUMENTATION.md) - REST API specification for all endpoints.
- [TESTING.md](file:///c:/Users/devil/Desktop/business-card-ocr/TESTING.md) - Automated test suites and OCR benchmark accuracy metrics.
- [DEPLOYMENT.md](file:///c:/Users/devil/Desktop/business-card-ocr/DEPLOYMENT.md) - Production deployment guide for Supabase, FastAPI OCR worker, and Next.js.
- [RELEASE_READINESS.md](file:///c:/Users/devil/Desktop/business-card-ocr/RELEASE_READINESS.md) - Final verification checklist against all PRD requirements.

