import { createBrowserSupabaseClient, isSupabaseConfigured } from "./supabase/client";
import type {
  CardScan,
  Contact,
  ContactNote,
  DashboardStats,
  DuplicateMatch,
  ExtractedContactFields,
  Organization,
  Profile,
  ScanBatch,
  Tag,
} from "@/types/database";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_OCR_API_URL || "https://cardflow-ocr.onrender.com"
)
  .replace(/[\r\n\s]+/g, "")
  .replace(/\/+$/, "");

function getCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)cardflow_access_token=([^;]*)/);
  return match && match[1] ? decodeURIComponent(match[1]).replace(/[\r\n\s]+/g, "") : null;
}

export function setAuthCookie(token: string) {
  if (typeof document === "undefined") return;
  const cleanToken = token.replace(/[\r\n\s]+/g, "");
  document.cookie = `cardflow_access_token=${encodeURIComponent(
    cleanToken
  )}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie =
    "cardflow_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
}

async function getAuthHeaders(isFormData = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const localToken = getCookieToken();
  if (localToken) {
    headers["Authorization"] = `Bearer ${localToken}`;
    return headers;
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token.replace(/[\r\n\s]+/g, "")}`;
        return headers;
      }
    } catch {
      // Fall back to cookie token if Supabase client fails
    }
  }

  return headers;
}

const COLD_START_RETRY_STATUSES = new Set([502, 503, 504]);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isFormData = false
): Promise<T> {
  const authHeaders = await getAuthHeaders(isFormData);
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          ...authHeaders,
          ...(options.headers || {}),
        },
      });

      if (
        COLD_START_RETRY_STATUSES.has(response.status) &&
        attempt < maxAttempts
      ) {
        await sleep(attempt * 2000);
        continue;
      }

      if (!response.ok) {
        let errorDetail = `Request failed (${response.status})`;
        try {
          const errJson = await response.json();
          errorDetail = errJson.detail || errJson.message || errorDetail;
        } catch {
          // Ignore JSON parse error
        }
        throw new Error(errorDetail);
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Network request failed");
      const isNetworkError =
        lastError.name === "TypeError" ||
        lastError.message.toLowerCase().includes("fetch");
      if (isNetworkError && attempt < maxAttempts) {
        await sleep(attempt * 2000);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("Backend request failed");
}

export const api = {
  baseUrl: API_BASE_URL,

  async warmupBackend(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ping`, {
        method: "GET",
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Auth & Profile
  async register(payload: {
    email: string;
    password: string;
    full_name: string;
    organization_name?: string;
  }): Promise<{
    access_token: string;
    user: Profile;
    organization: Organization | null;
  }> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.signUp({
          email: payload.email,
          password: payload.password,
          options: {
            data: { full_name: payload.full_name },
          },
        });
        if (data.session?.access_token) {
          setAuthCookie(data.session.access_token);
        }
      } catch {
        // Proceed with primary backend registration
      }
    }
    const res = await request<{
      access_token: string;
      user: Profile;
      organization: Organization | null;
    }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAuthCookie(res.access_token);
    return res;
  },

  async login(payload: {
    email: string;
    password: string;
  }): Promise<{
    access_token: string;
    user: Profile;
    organization: Organization | null;
  }> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.signInWithPassword({
          email: payload.email,
          password: payload.password,
        });
        if (data.session?.access_token) {
          setAuthCookie(data.session.access_token);
        }
      } catch {
        // Proceed with primary backend login
      }
    }
    const res = await request<{
      access_token: string;
      user: Profile;
      organization: Organization | null;
    }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAuthCookie(res.access_token);
    return res;
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        // Ignore signOut errors
      }
    }
    clearAuthCookie();
  },

  async forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
    if (isSupabaseConfigured()) {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    }
    return request("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(payload: {
    email: string;
    reset_token: string;
    new_password: string;
  }): Promise<{ message: string }> {
    return request("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getMe(): Promise<{
    user: Profile;
    organization: Organization | null;
  }> {
    return request("/api/v1/auth/me");
  },

  async updateProfile(payload: {
    full_name?: string;
    organization_name?: string;
    current_password?: string;
    new_password?: string;
  }): Promise<{
    user: Profile;
    organization: Organization | null;
  }> {
    return request("/api/v1/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    return request("/api/v1/dashboard/stats");
  },

  // Single Card Scan (Front + optional Back of Card)
  async uploadSingleCard(
    file: File,
    rotationDegrees = 0,
    backFile?: File | null,
    backRotationDegrees = 0
  ): Promise<CardScan> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("rotation_degrees", String(rotationDegrees));
    if (backFile) {
      formData.append("back_file", backFile);
      formData.append("back_rotation_degrees", String(backRotationDegrees));
    }
    return request<CardScan>(
      "/api/v1/scans/single",
      {
        method: "POST",
        body: formData,
      },
      true
    );
  },

  async getScan(scanId: string): Promise<CardScan> {
    return request<CardScan>(`/api/v1/scans/${scanId}`);
  },

  async listScans(params?: {
    status?: string;
    batch_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: CardScan[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.batch_id) query.set("batch_id", params.batch_id);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request(`/api/v1/scans${qs ? `?${qs}` : ""}`);
  },

  async retryScan(scanId: string): Promise<CardScan> {
    return request<CardScan>(`/api/v1/scans/${scanId}/retry`, {
      method: "POST",
    });
  },

  async rejectScan(scanId: string): Promise<{ message: string }> {
    return request(`/api/v1/scans/${scanId}`, {
      method: "DELETE",
    });
  },

  async updateScanExtraction(
    scanId: string,
    extracted_data: Partial<ExtractedContactFields>
  ): Promise<CardScan> {
    return request<CardScan>(`/api/v1/scans/${scanId}`, {
      method: "PUT",
      body: JSON.stringify({ extracted_data }),
    });
  },

  // Bulk Scanning Batches
  async uploadBatch(
    files: File[],
    batchName: string
  ): Promise<{ batch: ScanBatch; scans: CardScan[] }> {
    const formData = new FormData();
    formData.append("batch_name", batchName);
    files.forEach((f) => formData.append("files", f));
    return request<{ batch: ScanBatch; scans: CardScan[] }>(
      "/api/v1/batches",
      {
        method: "POST",
        body: formData,
      },
      true
    );
  },

  async listBatches(): Promise<{ items: ScanBatch[]; total: number }> {
    return request("/api/v1/batches");
  },

  async getBatch(
    batchId: string
  ): Promise<{ batch: ScanBatch; scans: CardScan[] }> {
    return request(`/api/v1/batches/${batchId}`);
  },

  async retryBatchFailed(
    batchId: string
  ): Promise<{ batch: ScanBatch; scans: CardScan[] }> {
    return request(`/api/v1/batches/${batchId}/retry-failed`, {
      method: "POST",
    });
  },

  async bulkSaveBatchContacts(
    batchId: string,
    scanIds?: string[],
    skipDuplicates = false
  ): Promise<{ saved_count: number; contacts: Contact[] }> {
    return request(`/api/v1/batches/${batchId}/save-contacts`, {
      method: "POST",
      body: JSON.stringify({
        scan_ids: scanIds || null,
        skip_duplicates: skipDuplicates,
      }),
    });
  },

  // Contacts CRM & Duplicate Detection
  async checkDuplicates(
    fields: Partial<ExtractedContactFields>,
    excludeContactId?: string
  ): Promise<{ duplicates: DuplicateMatch[] }> {
    return request("/api/v1/contacts/check-duplicates", {
      method: "POST",
      body: JSON.stringify({
        ...fields,
        exclude_contact_id: excludeContactId || null,
      }),
    });
  },

  async createContact(payload: {
    scan_id?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    designation?: string | null;
    phone?: string | null;
    alternate_phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    education?: string | null;
    linkedin_url?: string | null;
    additional_information?: Record<string, unknown>;
    notes?: string | null;
    tag_ids?: string[];
    merge_into_contact_id?: string | null;
  }): Promise<Contact> {
    return request<Contact>("/api/v1/contacts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listContacts(params?: {
    search?: string;
    tag_id?: string;
    date_from?: string;
    date_to?: string;
    sort_by?: "name" | "created_at" | "updated_at" | "company";
    sort_dir?: "asc" | "desc";
    page?: number;
    page_size?: number;
  }): Promise<{
    items: Contact[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.tag_id) query.set("tag_id", params.tag_id);
    if (params?.date_from) query.set("date_from", params.date_from);
    if (params?.date_to) query.set("date_to", params.date_to);
    if (params?.sort_by) query.set("sort_by", params.sort_by);
    if (params?.sort_dir) query.set("sort_dir", params.sort_dir);
    if (params?.page) query.set("page", String(params.page));
    if (params?.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return request(`/api/v1/contacts${qs ? `?${qs}` : ""}`);
  },

  async getContact(contactId: string): Promise<Contact> {
    return request<Contact>(`/api/v1/contacts/${contactId}`);
  },

  async updateContact(
    contactId: string,
    payload: Partial<Contact> & { tag_ids?: string[] }
  ): Promise<Contact> {
    return request<Contact>(`/api/v1/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async deleteContact(contactId: string): Promise<{ message: string }> {
    return request(`/api/v1/contacts/${contactId}`, {
      method: "DELETE",
    });
  },

  // Contact Notes
  async addContactNote(
    contactId: string,
    note: string
  ): Promise<ContactNote> {
    return request<ContactNote>(`/api/v1/contacts/${contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  async deleteContactNote(
    contactId: string,
    noteId: string
  ): Promise<{ message: string }> {
    return request(`/api/v1/contacts/${contactId}/notes/${noteId}`, {
      method: "DELETE",
    });
  },

  // Tags
  async listTags(): Promise<{ items: Tag[] }> {
    return request("/api/v1/tags");
  },

  async createTag(payload: { name: string; color: string }): Promise<Tag> {
    return request<Tag>("/api/v1/tags", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateTag(
    tagId: string,
    payload: { name?: string; color?: string }
  ): Promise<Tag> {
    return request<Tag>(`/api/v1/tags/${tagId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async deleteTag(tagId: string): Promise<{ message: string }> {
    return request(`/api/v1/tags/${tagId}`, {
      method: "DELETE",
    });
  },
};

