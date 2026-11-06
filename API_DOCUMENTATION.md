# CardFlow REST API Documentation

Base URL: `http://127.0.0.1:8000/api/v1`

All protected endpoints require an `Authorization: Bearer <access_token>` HTTP header. User ownership is enforced strictly from the verified JWT token; client-supplied `user_id` fields are ignored.

---

## 1. Health & Diagnostics

### `GET /api/v1/health`
Returns backend status, OpenCV and PaddleOCR versions, worker queue concurrency, and storage bucket availability.

**Response (`200 OK`)**:
```json
{
  "status": "healthy",
  "service": "cardflow-ocr-backend",
  "opencv_version": "4.10.0",
  "paddleocr_version": "3.1.0",
  "worker_concurrency": 3,
  "max_batch_size": 50,
  "max_file_size_mb": 10,
  "storage_buckets": {
    "visiting-cards-original": true,
    "visiting-cards-processed": true
  }
}
```

### `POST /api/v1/ocr/test`
Stateless diagnostic endpoint for testing the complete OpenCV preprocessing + local PaddleOCR + hybrid extraction pipeline on an uploaded visiting card image without saving database records.

- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `file` (required): Visiting card image (`JPG`, `JPEG`, `PNG`, `WEBP`, `<= 10 MB`).
  - `rotation_degrees` (optional, default `0`): Pre-OCR clockwise rotation (`0`, `90`, `180`, `270`).

**Response (`200 OK`)**:
```json
{
  "status": "completed",
  "preprocessing": {
    "original_shape": [560, 960],
    "processed_shape": [560, 960],
    "was_cropped": false,
    "deskew_angle": 0.0,
    "was_dark_inverted": false
  },
  "raw_ocr_text": "MEHTA TECHNOLOGIES PVT. LTD.\nAarav Mehta\nFounder & Chief Executive Officer\n...",
  "mean_ocr_confidence": 0.9912,
  "ocr_output": [
    {
      "text": "MEHTA TECHNOLOGIES PVT. LTD.",
      "bbox": [48, 42, 462, 68],
      "polygon": [[48, 42], [462, 42], [462, 68], [48, 68]],
      "confidence": 0.9941,
      "reading_order": 0
    }
  ],
  "extracted_data": {
    "full_name": "Aarav Mehta",
    "first_name": "Aarav",
    "last_name": "Mehta",
    "designation": "Founder & Chief Executive Officer",
    "company_name": "MEHTA TECHNOLOGIES PVT. LTD.",
    "phone": "+919876543210",
    "alternate_phone": "+918040928811",
    "email": "aarav@mehtatech.in",
    "website": "https://www.mehtatech.in",
    "address": "42 Residency Road, Ashok Nagar, Bengaluru, Karnataka - 560001, India",
    "city": "Bengaluru",
    "state": "Karnataka",
    "country": "India",
    "postal_code": "560001",
    "linkedin_url": "https://linkedin.com/in/aaravmehta",
    "department": null,
    "education": "B.Tech (IIT Bombay), MBA (ISB)"
  },
  "extraction_confidence": {
    "email": {
      "ocr_confidence": 0.995,
      "classification_confidence": 0.99,
      "combined_confidence": 0.993,
      "level": "high",
      "needs_review": false
    }
  },
  "needs_human_review": false
}
```

---

## 2. Authentication & Profile

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register a user profile and default organization (`email`, `password`, `full_name`, `organization_name`). |
| `POST` | `/api/v1/auth/login` | Authenticate with `email` and `password`; returns JWT `access_token`, `user`, and `organization`. |
| `POST` | `/api/v1/auth/forgot-password` | Generate a password reset token for a registered account. |
| `POST` | `/api/v1/auth/reset-password` | Reset account password using `email`, `reset_token`, and `new_password`. |
| `GET` | `/api/v1/auth/me` | Return the authenticated user profile and primary organization. |
| `PATCH` | `/api/v1/auth/profile` | Update user `full_name`, `organization_name`, or password. |

---

## 3. Private Storage & Sample Cards

### `GET /api/v1/storage/signed`
Serves an image from the private storage buckets (`visiting-cards-original` or `visiting-cards-processed`) only when the HMAC-SHA256 signature (`sig`) and expiration timestamp (`exp`) are valid. Returns `403 Forbidden` if expired or tampered.

### `GET /api/v1/sample-cards` & `POST /api/v1/sample-cards/{filename}/scan`
Lists built-in realistic visiting card samples and allows one-click scanning of any sample card through the full OpenCV + PaddleOCR pipeline.

---

## 4. Single-Card Scanning & Review

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/scans/single` | Upload a single card image (`file`, `rotation_degrees`), save original to `visiting-cards-original`, run OpenCV preprocessing + PaddleOCR + hybrid extraction, save processed image to `visiting-cards-processed`, and return the `CardScan` record with signed image URLs. |
| `GET` | `/api/v1/scans` | List scans owned by the authenticated user (`limit`, `status`, `batch_id`). |
| `GET` | `/api/v1/scans/{scan_id}` | Fetch a single scan with signed image URLs, raw OCR segments, extracted fields, confidence breakdown, and linked contact (if already saved). |
| `PATCH` | `/api/v1/scans/{scan_id}` | Update extracted fields on a scan or mark status (`completed`, `review_required`, `failed`). |
| `POST` | `/api/v1/scans/{scan_id}/retry` | Re-run OpenCV preprocessing, PaddleOCR, and extraction on the stored original card image (supports optional `rotation_degrees`). |
| `DELETE` | `/api/v1/scans/{scan_id}` | Delete a scan record and remove its private storage files. |

---

## 5. Bulk Scanning & Batch Orchestration

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/batches` | Upload 1 to 50 card images (`files`, `batch_name`). Validates all files, stores originals in `visiting-cards-original`, creates `scan_batches` and `card_scans` records (`status = 'queued'`), enqueues all jobs in `PersistentJobQueueManager`, and returns immediately (`< 1s`). |
| `GET` | `/api/v1/batches` | List batches owned by the authenticated user. |
| `GET` | `/api/v1/batches/{batch_id}` | Return live batch metrics (`total_images`, `completed_count`, `failed_count`, `pending_count`, `status`) and all associated `CardScan` items. |
| `POST` | `/api/v1/batches/{batch_id}/retry-failed` | Re-enqueue all failed scans in the batch without re-processing completed scans. |
| `POST` | `/api/v1/batches/{batch_id}/bulk-save` | Idempotently create CRM contacts for all completed/reviewed scans in the batch (`skip_duplicates` flag supported; prevents duplicate contact creation via `scan_id` uniqueness check). |

---

## 6. Contacts CRM, Duplicates, Tags, Notes & Export

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/contacts/check-duplicates` | Check candidate contact fields (`full_name`, `company_name`, `phone`, `email`) against existing contacts using normalized phone, case-insensitive email, and RapidFuzz Levenshtein similarity. |
| `GET` | `/api/v1/contacts` | Paginated CRM query with `search`, `tag_id`, `date_from`, `date_to`, `favorites_only`, `sort_by`, and `sort_dir`. |
| `POST` | `/api/v1/contacts` | Create a new contact (or idempotently update if `scan_id` already has a linked contact), attach tags, and optionally create an initial note. |
| `GET` | `/api/v1/contacts/export/csv` | Export filtered contacts as standard CSV or Excel UTF-8 BOM CSV (`excel_bom=true`) with formula-injection protection. |
| `GET` | `/api/v1/contacts/{contact_id}` | Fetch contact details, signed card images, tags, and chronological notes. |
| `PATCH` | `/api/v1/contacts/{contact_id}` | Update contact fields, favorite status, or tag assignments. |
| `DELETE` | `/api/v1/contacts/{contact_id}` | Delete a contact and cascade-delete its tag links and notes. |
| `POST` | `/api/v1/contacts/{contact_id}/notes` | Add a note to a contact. |
| `DELETE` | `/api/v1/contacts/{contact_id}/notes/{note_id}` | Delete a contact note. |
| `GET` | `/api/v1/tags` | List custom tags owned by the user. |
| `POST` | `/api/v1/tags` | Create a custom colored tag (`name`, `color`). |
| `DELETE` | `/api/v1/tags/{tag_id}` | Delete a custom tag. |
| `GET` | `/api/v1/dashboard/stats` | Return real-time dashboard counts (`total_contacts`, `total_scans`, `scans_this_week`, `pending_review_count`, `failed_scans_count`), recent scans, and recent contacts. |

