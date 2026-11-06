# CardFlow – Phased Implementation Plan

## 1. Initial Workspace Inspection Findings

1. **Existing Project Directory**: `c:\Users\devil\Desktop\business-card-ocr` currently contains only `prd.md` (1,002 lines). No application code exists yet.
2. **Current Framework & Dependencies**: None initialized in the workspace yet.
   - **System Node.js**: `v22.18.0`, `npm 10.9.3`
   - **System Python**: Python `3.12.5` (`C:\Users\devil\AppData\Local\Programs\Python\Python312\python.exe`) with `paddleocr 3.1.0`, `paddlepaddle 3.1.0`, `opencv-python 4.10.0.84`, `fastapi 0.115.5`, `uvicorn 0.32.1`, `RapidFuzz 3.13.0`, `SQLAlchemy 2.0.35`, `psycopg2 2.9.10`, and `PyJWT 2.9.0` already installed.
   - **Supabase CLI**: `3.0.0` installed.
3. **Folder Structure**: Greenfield repository; we will structure it cleanly with:
   - Frontend Next.js App Router (`src/app`, `src/components`, `src/lib`, `src/types`)
   - Supabase configuration & SQL migrations (`supabase/config.toml`, `supabase/migrations/`)
   - Python FastAPI OCR & Extraction Service (`backend/app/`, `backend/tests/`, `backend/benchmark/`)
4. **Supabase Configuration Status**: Not yet initialized in the repository. No Supabase environment variables are currently set in the shell environment.
   - We will implement complete, canonical Supabase integration (`@supabase/supabase-js`, `@supabase/ssr`, SQL migrations, RLS policies, private storage buckets `visiting-cards-original` and `visiting-cards-processed`, and signed URL access) **plus** a seamless local Supabase-compatible persistence & private storage bridge backed by SQLite/PostgreSQL and signed URLs when cloud Supabase credentials are not yet provided in `.env.local`, ensuring 100% end-to-end functionality out of the box and in production.
5. **Existing Reusable Components**: None yet; we will build a modular design system in `src/components/ui/` and domain components in `src/components/`.
6. **Existing Environment Variables**: No `SUPABASE_*`, `NEXT_PUBLIC_*`, or `OCR_*` variables exist in the current environment. We will provide `.env.example` and `.env.local` with safe local defaults.
7. **Existing Documentation**: `prd.md` reviewed in full and treated as the single source of truth.

---

## 2. Design Read & UI/UX Direction

- **Design Read**: Reading this as a B2B SaaS & Mobile-first CRM application for business owners, sales executives, and networking professionals, with a calm, high-craft Linear/Apple-inspired minimalist visual language.
- **Dials**:
  - `DESIGN_VARIANCE: 5` (Clean, structured, predictable SaaS hierarchy with purposeful asymmetric splits on scanner & review screens)
  - `MOTION_INTENSITY: 4` (Restrained, functional transitions, progress indicators, and tactile button states respecting `prefers-reduced-motion`)
  - `VISUAL_DENSITY: 5` (Balanced daily-app density with generous whitespace, clear tabular data in CRM, and zero visual clutter)
- **Color Palette (from PRD)**:
  - Primary: `#101F50` (Deep Navy)
  - Secondary: `#3478F6` (Action Blue)
  - Accent: `#19C6B3` (Teal Accent)
  - Background: `#F3F6FB` (Soft Cool Surface)
  - Text: `#202B42` (Deep Slate Ink)
  - Surface / Card: `#FFFFFF` (Pure White with subtle border `#E2E8F0`)
  - Warning: `#FFB52E` (Amber Warning)

---

## 3. Phased Development Milestones

### Milestone 1: Foundation
- [x] Inspect workspace and create `IMPLEMENTATION_PLAN.md`.
- [x] Initialize Next.js (App Router, TypeScript strict mode, Tailwind CSS).
- [x] Create Supabase SQL migrations (`supabase/migrations/00001_initial_schema.sql`, `00002_rls_policies.sql`, `00003_storage_buckets.sql`) covering all 9 PRD tables (`profiles`, `organizations`, `organization_members`, `scan_batches`, `card_scans`, `contacts`, `tags`, `contact_tags`, `contact_notes`).
- [x] Implement Supabase client/server/middleware layer + local Supabase-compatible backend adapter with full RLS enforcement and signed URL private storage so the app runs end-to-end immediately and connects seamlessly to hosted Supabase when credentials are set.
- [x] Implement Authentication (Register, Login, Logout, Forgot Password, Password Reset, Protected Routes, User Profile, Organization Workspace).
- [x] Build Design System components (`Button`, `Input`, `Badge`, `Card`, `Modal`, `Toast`, `Skeleton`, `EmptyState`, `ConfidenceBadge`).
- [x] Build responsive Dashboard Shell (Desktop Sidebar + Mobile Bottom Navigation) and Dashboard page with live statistics, quick actions, and recent activity.

### Milestone 2: OCR Backend (Python + FastAPI + OpenCV + PaddleOCR)
- [x] Architect `backend/` FastAPI service using Python 3.12.
- [x] Implement OpenCV image preprocessing pipeline (`backend/app/services/preprocessor.py`):
  - Original image preservation (never overwritten)
  - Automatic orientation/rotation handling & perspective/card-boundary detection
  - Resizing, grayscale conversion, bilateral/Gaussian denoising, CLAHE contrast enhancement, unsharp masking (sharpening), and adaptive thresholding.
- [x] Implement PaddleOCR engine wrapper (`backend/app/services/ocr_engine.py`):
  - Local model weight caching (no per-request downloads)
  - Text detection, bounding box coordinates, polygon extraction, reading-order sorting, and per-line OCR confidence scores.
  - Fallback/benchmark hooks for EasyOCR/Tesseract comparison.
- [x] Implement Hybrid Information Extraction Engine (`backend/app/services/extractor.py`):
  - Strict separation of OCR confidence vs. field-classification confidence
  - Zero generative AI / zero external paid APIs
  - Regex + rule-based + spatial layout + Indian/international phone normalization + email/URL/LinkedIn extraction + configurable job title dictionary + company legal suffix & spatial heuristics + Indian city/state/PIN code & education extraction
  - Strict adherence to "Never invent missing information" (`null` when absent, `review_required` when uncertain).
- [x] Implement `/api/v1/health` and `/api/v1/ocr/test` endpoints and verify against real generated/sample visiting card images.

### Milestone 3: Single-Card Workflow
- [x] Build Single Card Scanner (`/scan`) with camera capture, file upload, drag-and-drop, client-side rotation/crop controls, and format/size validation (JPG, JPEG, PNG, WEBP).
- [x] Connect upload → private storage (`visiting-cards-original` & `visiting-cards-processed`) → OpenCV preprocessing → PaddleOCR → Structured Extraction.
- [x] Build Interactive Extraction Review interface (`/scans/[id]/review` & inline review):
  - Side-by-side comparison of original/processed card image (with optional bounding box overlay toggle) and extracted fields
  - Per-field OCR & classification confidence indicators
  - Duplicate detection warning before saving
  - Manual field editing, Approve & Save Contact, or Reject Scan.

### Milestone 4: Bulk Visiting Card Scanning
- [x] Implement persistent background job queue (`backend/app/services/queue_worker.py`) supporting Redis/Celery when Redis is available and a persistent SQLite/PostgreSQL-backed async worker pool with configurable concurrency (`MAX_CONCURRENT_OCR_WORKERS`) so batches of up to 50 images never block HTTP requests and survive restarts.
- [x] Build Bulk Scanner interface (`/bulk-scan`):
  - Multi-image selection (up to 50 images), thumbnail grid preview, remove unwanted images, batch naming, and submission.
- [x] Build Batch Processing & Review Dashboard (`/batches/[id]`):
  - Real-time polling/streaming progress for total, completed, processing, and failed scans
  - Retry individual or all failed scans without creating duplicate records
  - Bulk review table & drawer with duplicate detection and "Save Selected" / "Save All Valid Contacts".
- [x] Test batch processing with 10, 20, and 50 card images.

### Milestone 5: Contact Management CRM, Duplicate Detection & Export
- [x] Build Contacts List (`/contacts`) with pagination, search (name, company, phone, email), tag filters, date filters, and sorting (name, date).
- [x] Build Contact Details & Edit pages (`/contacts/[id]`):
  - Signed URL display of original & processed visiting card images
  - Full editable contact fields, custom tags management, and timestamped contact notes (`contact_notes`).
- [x] Implement Duplicate Detection Engine (`/api/v1/contacts/check-duplicates`):
  - Normalized phone, normalized email, fuzzy name (`RapidFuzz`), and company matching
  - Pre-save comparison modal allowing "Save as New", "Update Existing Contact", or side-by-side review.
- [x] Implement Communication Actions:
  - WhatsApp action (`https://wa.me/<normalized_international_number>?text=...`) with editable prefilled message modal
  - Email action (`mailto:`) with editable subject and body
  - Call action (`tel:`) with normalized phone format.
- [x] Build Tags Management (`/tags`), Scan History (`/history`), and Settings (`/settings`) pages.
- [x] Implement Bulk Export (CSV & Excel-compatible UTF-8 BOM CSV) for all, selected, or filtered contacts with strict RFC 4180 escaping and spreadsheet formula-injection sanitization (`=`, `+`, `-`, `@` prefix escaping).

### Milestone 6: Testing, OCR Benchmark & Documentation
- [x] Create and run automated backend unit & integration tests (`pytest`) covering preprocessing, PaddleOCR, field extraction, duplicate detection, batch queue retries, CSV sanitization, and user isolation (RLS).
- [x] Generate/curate a benchmark dataset of 100+ varied synthetic & realistic visiting card images (corporate, dark/light backgrounds, multi-column, logos, low-res, English & Indian business cards) and run the OCR & field extraction evaluation script to report exact metrics (CER, phone/email exact match, name/company/designation/address precision & recall).
- [x] Verify end-to-end workflows in the browser.
- [x] Complete all 9 required documentation files (`README.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `DATABASE_SCHEMA.md`, `OCR_PIPELINE.md`, `API_DOCUMENTATION.md`, `TESTING.md`, `DEPLOYMENT.md`, `RELEASE_READINESS.md`).
