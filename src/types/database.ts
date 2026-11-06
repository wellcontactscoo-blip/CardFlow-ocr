export type OrganizationRole = "owner" | "admin" | "member";

export type BatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partially_completed"
  | "failed";

export type ScanStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "review_required"
  | "completed"
  | "failed";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface OcrSegment {
  text: string;
  bbox: [number, number, number, number]; // [x_min, y_min, x_max, y_max]
  polygon: number[][]; // [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
  confidence: number; // 0.0 to 1.0 (PaddleOCR recognition confidence)
  reading_order: number;
}

export interface FieldConfidenceDetail {
  ocr_confidence: number; // Raw OCR recognition confidence (0.0 - 1.0)
  classification_confidence: number; // Field classification confidence (0.0 - 1.0)
  overall_confidence: number; // Combined confidence score (0.0 - 1.0)
  level: ConfidenceLevel;
  needs_review: boolean;
  source_segments?: number[]; // Reading order indices used
}

export type ExtractionConfidenceMap = Partial<
  Record<keyof ExtractedContactFields, FieldConfidenceDetail>
>;

export interface ExtractedContactFields {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  designation: string | null;
  phone: string | null;
  raw_phone?: string | null;
  alternate_phone: string | null;
  raw_alternate_phone?: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  education: string | null;
  linkedin_url: string | null;
  other_information: string[];
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
}

export interface ScanBatch {
  id: string;
  user_id: string;
  organization_id: string | null;
  batch_name: string;
  total_images: number;
  completed_count: number;
  failed_count: number;
  pending_count: number;
  status: BatchStatus;
  created_at: string;
  completed_at: string | null;
  contacts_extracted?: number;
  potential_duplicates?: number;
}

export interface CardScan {
  id: string;
  batch_id: string | null;
  user_id: string;
  organization_id: string | null;
  original_image_path: string;
  processed_image_path: string | null;
  original_image_url?: string | null; // Signed URL
  processed_image_url?: string | null; // Signed URL
  raw_ocr_text: string | null;
  ocr_output: OcrSegment[];
  extracted_data: ExtractedContactFields;
  extraction_confidence: ExtractionConfidenceMap;
  status: ScanStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  processed_at: string | null;
  saved_contact_id?: string | null;
  duplicates?: DuplicateMatch[];
}

export interface Tag {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  color: string;
  created_at: string;
  contact_count?: number;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  user_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  organization_id: string | null;
  scan_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  designation: string | null;
  phone: string | null;
  alternate_phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  education: string | null;
  linkedin_url: string | null;
  additional_information: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  contact_notes?: ContactNote[];
  original_image_url?: string | null;
  processed_image_url?: string | null;
  scan_date?: string | null;
}

export interface DuplicateMatch {
  contact: Contact;
  match_reasons: string[];
  similarity_score: number; // 0.0 to 1.0
}

export interface DashboardStats {
  total_contacts: number;
  total_scanned_cards: number;
  contacts_added_this_week: number;
  total_companies: number;
  pending_scans: number;
  failed_scans: number;
  recent_scans: CardScan[];
  recent_contacts: Contact[];
  recent_updated_contacts: Contact[];
  failed_jobs: CardScan[];
}

