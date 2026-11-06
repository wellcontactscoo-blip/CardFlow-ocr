# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# CardFlow – Smart Visiting Card Scanner & Contact CRM

**Version:** 1.0  
**Project Type:** Web Application / Mobile-first CRM  
**Primary Objective:** Convert physical and digital visiting cards into structured, searchable digital contacts using locally hosted OCR and ML.

---

# 1. Product Overview

## 1.1 Product Vision

Build a simple, modern and intelligent visiting card scanner that allows users to scan individual or multiple business cards, automatically extract information, organise contacts and initiate communication through WhatsApp, email and phone.

The product should provide an alternative to traditional visiting card scanning software, with particular emphasis on:

- Bulk visiting card scanning.
- Accurate text extraction without paid AI APIs.
- Automatic information classification.
- Contact management.
- Easy communication.
- Exporting contacts.

## 1.2 Core Problem

People collect numerous visiting cards during business meetings, conferences, networking events and client interactions.

Manually entering these details into a CRM is time-consuming.

The application should automate this process.

## 1.3 Target Users

1. Business owners.
2. Sales representatives.
3. Business development executives.
4. Networking professionals.
5. Marketing teams.
6. Recruitment professionals.
7. Small and medium-sized businesses.

---

# 2. Core Features and Requirements

## Module 1: Authentication

Implement authentication using Supabase Auth.

Requirements:

- Email and password registration.
- Login and logout.
- Forgot password.
- Password reset.
- Protected application routes.
- User profile.
- Persistent sessions.

Design the architecture to support multiple users and organisations in the future.

## Module 2: Dashboard

Create a dashboard containing:

**Statistics**
- Total contacts.
- Total scanned cards.
- Contacts added this week.
- Total companies.
- Pending scans.
- Failed scans.

**Quick Actions**
- Scan a visiting card.
- Upload multiple cards.
- View contacts.
- View scan history.
- Export contacts.

**Recent Activity**
- Recently scanned cards.
- Recently added contacts.
- Recently updated contacts.
- Failed OCR jobs requiring attention.

The dashboard should be responsive and mobile-first.

## Module 3: Visiting Card Scanner

This is the primary feature.

### Input methods

Support:

1. Capture image using mobile camera.
2. Upload an existing image.
3. Upload multiple images simultaneously.
4. Drag-and-drop images on desktop.

Supported image formats:
- JPG
- JPEG
- PNG
- WEBP

### Image processing

Use OpenCV to improve image quality before OCR.

Implement:

- Image resizing.
- Perspective correction.
- Automatic rotation detection.
- Grayscale conversion.
- Noise removal.
- Contrast enhancement.
- Sharpening.
- Thresholding where beneficial.
- Card boundary detection where feasible.

Preserve the original uploaded image.

Never overwrite the original with the processed image.

### Scanner workflow

1. User uploads or captures a visiting card.
2. Display image preview.
3. Allow image rotation and cropping.
4. Submit image for OCR processing.
5. Display processing status.
6. Extract text.
7. Classify extracted information.
8. Display structured information.
9. Allow manual editing.
10. Save contact.

Provide a clear loading and progress state.

## Module 4: Bulk Visiting Card Scanning

This is one of the most important differentiating features.

### Requirements

Users should be able to upload multiple individual visiting card images in one operation.

Initial limits:
- Maximum 50 images per batch.
- Configurable file size limit.
- Supported formats: JPG, JPEG, PNG and WEBP.

### Processing workflow

1. User selects multiple images.
2. Display image thumbnails.
3. Allow removing unwanted images.
4. User submits the batch.
5. Create a batch record in the database.
6. Create an individual scan record for every image.
7. Process images through background workers.
8. Display individual progress for each image.
9. Extract and structure contact details.
10. Detect potential duplicates.
11. Display all results in a review interface.
12. Allow users to save selected or all successful contacts.

### Batch dashboard

Display:

- Total images.
- Completed scans.
- Processing scans.
- Failed scans.
- Contacts extracted.
- Potential duplicates.

Users should be able to retry failed scans.

Important: Batch upload means multiple separate card images. Do not assume that the system can automatically identify and separate dozens of cards from one photograph. Treat multi-card detection in a single photograph as a future feature.

## Module 5: OCR Engine

### Mandatory technology

Use PaddleOCR as the primary OCR engine.

Use OpenCV for preprocessing.

Optional: Benchmark Tesseract OCR and EasyOCR against PaddleOCR to determine whether an alternative or fallback provides measurable improvement.

### Restrictions

Do not integrate:
- OpenAI API.
- Gemini API.
- Claude API.
- Google Cloud Vision.
- AWS Textract.
- Paid third-party OCR APIs.
- Any external generative AI service.

The OCR and information extraction pipeline must run on infrastructure we control.

Download and install the necessary open-source model weights during deployment.

Do not depend on downloading model weights every time a scan is performed.

### OCR output

For each detected text segment, retain:

- Extracted text.
- Bounding box coordinates.
- OCR confidence score.
- Reading order where available.

Retain raw OCR output for debugging and quality evaluation.

### Language support

Initial priority:
- English.

Architecture should allow future support for:
- Hindi.
- Kannada.
- Other Indian languages.

Do not promise multilingual accuracy until the relevant OCR models have been benchmarked.

## Module 6: Information Extraction Engine

This module converts raw OCR text into structured contact information.

Do not use generative AI.

Use a hybrid approach consisting of:

- Regular expressions.
- Rule-based extraction.
- Spatial positioning.
- Text confidence scores.
- Keyword dictionaries.
- NLP and Named Entity Recognition.
- Contextual classification.

### Required fields

| Field | Extraction approach |
|---|---|
| Full name | NLP + spatial positioning |
| First name | Name parsing |
| Last name | Name parsing |
| Company name | Company keywords and classification |
| Designation | Job title dictionary |
| Phone number | Regex + phone validation |
| Alternate phone | Regex |
| Email | Email regex |
| Website | URL regex |
| Address | Address patterns |
| City | Location extraction |
| State | Location dictionary |
| PIN code | Indian PIN regex |
| Country | Location extraction |
| Education | Degree and institution keywords |
| LinkedIn | URL extraction |
| Other information | Unclassified OCR text |

### Extraction rules

**Phone number**
- Detect Indian and international numbers.
- Handle spaces, hyphens and country codes.
- Normalize phone numbers.
- Preserve original extracted values.

**Email**
- Validate email format.
- Preserve exact extracted email.

**Website**
- Detect URLs and domain names.
- Normalize URLs where possible.

**Company**
- Use terms such as Pvt Ltd, Private Limited, LLP, Limited, Inc, Technologies, Solutions and Enterprises as supporting signals.
- Use spatial and contextual information.

**Name**
- Use NER and spatial information.
- Prioritise prominent text near the top of the card.
- Avoid automatically treating the largest text as a person's name because it may be a company logo or brand.

**Designation**
- Maintain a configurable job title dictionary.
- Include common titles such as CEO, CTO, Founder, Director, Manager, Developer, Consultant and Engineer.

**Address**
- Detect PIN codes.
- Use Indian city and state dictionaries.
- Retain the complete extracted address.

### Critical accuracy rule

Never invent missing information.

If the visiting card does not contain education, designation or address, return null.

Do not automatically assume missing values.

If the system is uncertain about a field, mark it for human review.

## Module 7: Confidence and Verification

Every extracted field should have an associated confidence score wherever available.

Example:

- Name: High confidence.
- Company: High confidence.
- Phone: High confidence.
- Email: Medium confidence.
- Address: Low confidence.

Create a review interface where users can:

- Edit individual fields.
- Correct OCR mistakes.
- View the original card.
- Compare extracted information with the source image.
- Approve the contact.
- Reject the scan.

Do not confuse OCR confidence with field-classification confidence. Maintain them separately if possible.

Never silently save low-confidence information as verified data.

## Module 8: Contact Management CRM

Create a dedicated contacts section.

### Contact list

Display:

- Contact name.
- Company.
- Designation.
- Phone number.
- Email.
- Date added.
- Tags.

### Contact details page

Display:

- Full contact information.
- Original visiting card image.
- Editable information.
- Notes.
- Tags.
- Scan date.
- Created date.
- Updated date.

### Contact actions

**WhatsApp**

Open WhatsApp using a URL scheme such as:

https://wa.me/919876543210

Requirements:
- Normalize the number to international format.
- Do not include spaces or special characters.
- Support a prefilled message.
- Allow the user to edit the message before sending.
- Do not claim that messages have been sent automatically.

**Email**

Use a mailto link.

Support:
- Recipient.
- Subject.
- Prefilled message body.

**Call**

Use the telephone URL scheme:

tel:+919876543210

### Additional CRM capabilities

- Search by name.
- Search by company.
- Search by phone.
- Search by email.
- Filter by tags.
- Filter by date.
- Sort by name and date.
- Edit contacts.
- Delete contacts.
- Add notes.
- Add custom tags.

## Module 9: Duplicate Detection

Detect potential duplicate contacts.

Use:
- Normalized phone numbers.
- Normalized email addresses.
- Similar names.
- Company names.

Implement duplicate detection before saving contacts.

Do not automatically merge contacts.

Display possible duplicates and allow users to:
- Save as new.
- Update an existing contact.
- Review both records.

## Module 10: Bulk Export

Support CSV and Excel-compatible exports.

Export fields:

- Name.
- Company.
- Designation.
- Phone.
- Alternate phone.
- Email.
- Website.
- Address.
- City.
- State.
- PIN code.
- Education.
- LinkedIn.
- Tags.
- Notes.
- Date added.

Support:
- Export all contacts.
- Export selected contacts.
- Export filtered contacts.

Ensure CSV values are escaped correctly and guard against spreadsheet formula injection.

---

# 3. Technical Architecture

## 3.1 Frontend

Technology:
- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- Lucide icons.

Requirements:
- Responsive design.
- Mobile-first interface.
- Reusable components.
- Loading states.
- Empty states.
- Error states.
- Toast notifications.
- Form validation.
- Accessible interactions.

## 3.2 Backend

Use Python + FastAPI for the OCR service.

Responsibilities:
- Receive scan jobs.
- Access uploaded images.
- Preprocess images.
- Execute PaddleOCR.
- Execute extraction rules.
- Return structured information.
- Update scan statuses.
- Handle failed processing jobs.

Use background workers for bulk processing.

Recommended:
- Redis.
- Celery.

Avoid blocking HTTP requests while OCR processes large batches.

## 3.3 Database and Storage

Use Supabase for:

- PostgreSQL database.
- Authentication.
- File storage.
- Row Level Security.
- Database migrations.

Use private storage buckets.

Suggested buckets:

1. visiting-cards-original
2. visiting-cards-processed

All storage access must be protected.

## 3.4 Application architecture

Frontend (Next.js)
        |
        v
Supabase Auth + PostgreSQL + Storage
        |
        v
Backend API (FastAPI)
        |
        v
Background Queue (Redis + Celery)
        |
        v
OpenCV Image Processing
        |
        v
PaddleOCR
        |
        v
Information Extraction Engine
        |
        v
Supabase PostgreSQL

Use a secure service-to-service authentication mechanism between the frontend, backend and OCR workers.

Never expose Supabase service role credentials or OCR service credentials in frontend code.

---

# 4. Supabase Database Schema

Create proper SQL migrations.

Suggested tables:

## 4.1 profiles

- id (UUID, references auth.users)
- full_name
- email
- avatar_url
- created_at
- updated_at

## 4.2 organizations

Prepare the architecture for multiple organizations.

- id (UUID)
- name
- owner_id
- created_at
- updated_at

## 4.3 organization_members

- id (UUID)
- organization_id
- user_id
- role
- created_at

Roles:
- owner
- admin
- member

For the initial release, an individual user can own their own workspace.

## 4.4 scan_batches

- id (UUID)
- user_id
- organization_id (nullable)
- batch_name
- total_images
- completed_count
- failed_count
- pending_count
- status
- created_at
- completed_at

Statuses:
- pending
- processing
- completed
- partially_completed
- failed

## 4.5 card_scans

- id (UUID)
- batch_id (nullable)
- user_id
- organization_id (nullable)
- original_image_path
- processed_image_path
- raw_ocr_text
- ocr_output (JSONB)
- extracted_data (JSONB)
- extraction_confidence (JSONB)
- status
- error_message
- retry_count
- created_at
- processed_at

Statuses:
- uploaded
- queued
- processing
- review_required
- completed
- failed

## 4.6 contacts

- id (UUID)
- user_id
- organization_id (nullable)
- scan_id (nullable)
- full_name
- first_name
- last_name
- company_name
- designation
- phone
- alternate_phone
- email
- website
- address
- city
- state
- postal_code
- country
- education
- linkedin_url
- additional_information (JSONB)
- notes
- created_at
- updated_at

## 4.7 tags

- id (UUID)
- user_id
- organization_id (nullable)
- name
- color
- created_at

## 4.8 contact_tags

- contact_id
- tag_id

## 4.9 contact_notes

- id (UUID)
- contact_id
- user_id
- note
- created_at
- updated_at

### Database requirements

- Use UUID primary keys.
- Add foreign key constraints.
- Add appropriate indexes.
- Add created_at and updated_at timestamps.
- Implement Row Level Security.
- Ensure users cannot access another user's contacts.
- Ensure organisation members can only access data permitted by their role.
- Use secure storage policies.
- Use database transactions where required.

Do not rely on frontend filtering for data security.

---

# 5. UI/UX Design Requirements

## Design direction

Create a premium, minimal and professional SaaS interface.

Inspiration:
- Apple.
- Linear.
- Notion.
- Modern CRM applications.

### Design principles

- Clean typography.
- Minimal visual clutter.
- Generous whitespace.
- Consistent spacing.
- Subtle shadows.
- Rounded cards.
- Clear visual hierarchy.
- Simple navigation.
- Fast interactions.

### Suggested colour palette

| Purpose | Colour |
|---|---|
| Primary | #101F50 |
| Secondary | #3478F6 |
| Accent | #19C6B3 |
| Background | #F3F6FB |
| Text | #202B42 |
| White | #FFFFFF |
| Warning | #FFB52E |

Use colours consistently. Avoid excessive gradients and decorative effects.

### Main navigation

Sidebar on desktop:

1. Dashboard
2. Scan Cards
3. Bulk Scanner
4. Contacts
5. Scan History
6. Tags
7. Settings

On mobile, use a compact navigation pattern with easy access to scanning.

### Required screens

1. Login.
2. Registration.
3. Dashboard.
4. Single Card Scanner.
5. Bulk Upload.
6. Batch Processing.
7. Extraction Review.
8. Contacts List.
9. Contact Details.
10. Edit Contact.
11. Scan History.
12. Tags Management.
13. Settings.

Create a consistent design system and reusable components.

---

# 6. Non-Functional Requirements

## Performance

- Avoid blocking the UI during OCR.
- Use asynchronous background processing.
- Process bulk jobs with configurable concurrency.
- Show processing progress.
- Support pagination for large contact lists.
- Optimise uploaded images.
- Avoid unnecessary database queries.

## Security

- Supabase RLS on all user-owned records.
- Private storage buckets.
- Signed URLs for private images.
- No exposed service role keys.
- Secure backend authentication.
- Input validation.
- File type validation.
- File size restrictions.
- Protection against malicious file uploads.
- Rate limiting.
- Secure handling of contact information.

## Reliability

- Failed scans must be retryable.
- Do not create duplicate records on retries.
- Maintain original card images.
- Persist job status.
- Handle worker crashes.
- Avoid losing batch progress.

## Privacy

- Visiting card images must not be sent to external AI services.
- Do not use external generative AI APIs.
- Provide contact and image deletion functionality.
- Delete associated storage files when appropriate.
- Do not log sensitive contact details unnecessarily.

---

# 7. Testing and Quality Assurance

## OCR testing

Create a benchmark dataset of at least 100–200 varied visiting card images.

Include:
- Standard corporate cards.
- Different fonts.
- Different layouts.
- Dark backgrounds.
- Light backgrounds.
- Multiple columns.
- Cards with logos.
- Low-resolution images.
- English and Indian business cards.

Measure:

1. OCR character error rate.
2. Exact-match phone extraction.
3. Exact-match email extraction.
4. Name extraction accuracy.
5. Company extraction accuracy.
6. Designation extraction accuracy.
7. Address extraction accuracy.
8. Field classification precision and recall.

Report results separately for each field.

Do not claim a specific accuracy percentage without benchmark evidence.

## Functional testing

Verify:

- Single-card upload.
- Camera capture.
- Multiple-card upload.
- Batch processing.
- Failed job retry.
- Contact creation.
- Contact editing.
- Duplicate detection.
- Search and filtering.
- WhatsApp navigation.
- Email navigation.
- Call navigation.
- CSV export.
- Excel-compatible export.
- Authentication.
- RLS isolation.
- Storage permissions.

## Acceptance criteria

The MVP is considered complete when:

1. Users can register and log in.
2. Users can upload individual visiting cards.
3. Users can upload a batch of up to 50 images.
4. Each image gets an independent processing job.
5. OCR extracts text locally.
6. Information extraction generates structured fields.
7. Users can manually correct extracted information.
8. Users can save contacts.
9. Users can search and manage contacts.
10. Users can open WhatsApp, email and call actions.
11. Users can export contacts.
12. Duplicate detection works.
13. Failed scans can be retried.
14. Database access is protected by RLS.
15. No paid external AI API is required.

---

# 8. Out of Scope for Version 1

Do not implement these features in the initial release:

- Automated WhatsApp campaigns.
- WhatsApp Business API integration.
- Automated email campaigns.
- AI-generated follow-up messages.
- Sales pipeline management.
- Lead scoring.
- Advanced analytics.
- Automatic separation of multiple physical cards in one photograph.
- Native Android or iOS applications.
- Subscription and payment system.

Keep the architecture extensible for these features.

---

# 9. Development Phases

## Phase 1 – Foundation

- Project setup.
- Supabase connection.
- Authentication.
- Database migrations.
- Storage configuration.
- Main dashboard.
- Design system.

## Phase 2 – OCR Engine

- FastAPI setup.
- OpenCV preprocessing.
- PaddleOCR integration.
- Text detection.
- Information extraction.
- Structured JSON output.
- Confidence scoring.

## Phase 3 – Single Card Scanning

- Camera capture.
- Image upload.
- Image preview.
- OCR processing.
- Extraction review.
- Contact saving.

## Phase 4 – Bulk Scanning

- Multi-image upload.
- Batch creation.
- Background queue.
- Processing status.
- Retry mechanism.
- Bulk review.
- Bulk contact creation.

## Phase 5 – CRM

- Contacts listing.
- Contact details.
- Editing.
- Search.
- Filtering.
- Tags.
- Duplicate detection.
- Notes.
- Communication actions.
- Export.

## Phase 6 – QA and Deployment

- OCR benchmark.
- Functional testing.
- Security testing.
- RLS verification.
- Responsive testing.
- Deployment.
- Documentation.

---

# 10. Final Product Objective

The final application should be a fully functional visiting card scanner and contact CRM, not a static UI demonstration.

The core product experience should be:

**Upload → Scan → Extract → Review → Save → Connect.**

The most important differentiators are bulk scanning, locally hosted OCR, structured contact extraction and simple contact management.

