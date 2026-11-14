import type { ConfidenceLevel, Contact } from "@/types/database";

/**
 * Normalize an Indian or international phone number to E.164 digits only (no +, spaces, or hyphens)
 * suitable for https://wa.me/<number>
 */
export function normalizePhoneForWhatsApp(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/\D/g, "");
  // Handle 00 international prefix
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  // If 11 digits starting with 0 (Indian STD/mobile leading zero), strip 0 and prepend 91
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = "91" + digits.slice(1);
  }
  // If 10 digits starting with 6,7,8,9 (standard Indian mobile), prepend 91
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = "91" + digits;
  }
  return digits;
}

/**
 * Normalize phone number to international tel: format (+919876543210)
 */
export function normalizePhoneForTel(rawPhone: string | null | undefined): string {
  const digits = normalizePhoneForWhatsApp(rawPhone);
  if (!digits) return "";
  return `+${digits}`;
}

/**
 * Build WhatsApp URL with normalized phone and optional prefilled message
 */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return "";
  const baseUrl = `https://wa.me/${normalized}`;
  if (message && message.trim().length > 0) {
    return `${baseUrl}?text=${encodeURIComponent(message.trim())}`;
  }
  return baseUrl;
}

/**
 * Build mailto URL with subject and body
 */
export function buildMailtoUrl(
  email: string,
  subject?: string,
  body?: string
): string {
  if (!email) return "";
  const params = new URLSearchParams();
  if (subject && subject.trim()) params.set("subject", subject.trim());
  if (body && body.trim()) params.set("body", body.trim());
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `mailto:${email.trim()}?${query}` : `mailto:${email.trim()}`;
}

/**
 * Guard against spreadsheet formula injection (CSV Injection / DDE attacks)
 * and escape values per RFC 4180.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Formula injection prevention: if cell starts with =, +, -, @, Tab, or CR, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Convert an array of contacts into CSV or Excel-compatible UTF-8 BOM CSV
 */
export function generateContactsCsv(
  contacts: Contact[],
  includeExcelBom = false
): string {
  const headers = [
    "Name",
    "Company",
    "Designation",
    "Phone",
    "Alternate Phone",
    "Email",
    "Website",
    "Address",
    "City",
    "State",
    "PIN Code",
    "Country",
    "Education",
    "LinkedIn",
    "Tags",
    "Notes",
    "Date Added",
  ];

  const rows = contacts.map((c) => {
    const tagNames = (c.tags || []).map((t) => t.name).join(", ");
    const combinedNotes = [
      c.notes || "",
      ...(c.contact_notes || []).map((n) => n.note),
    ]
      .filter(Boolean)
      .join(" | ");

    return [
      c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" "),
      c.company_name,
      c.designation,
      c.phone,
      c.alternate_phone,
      c.email,
      c.website,
      c.address,
      c.city,
      c.state,
      c.postal_code,
      c.country,
      c.education,
      c.linkedin_url,
      tagNames,
      combinedNotes,
      c.created_at ? new Date(c.created_at).toISOString().split("T")[0] : "",
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  const csvBody = [headers.map(escapeCsvCell).join(","), ...rows].join("\r\n");
  return includeExcelBom ? `\uFEFF${csvBody}` : csvBody;
}

/**
 * Convert an array of contacts into Tab-Separated Values (TSV) for 1-click Google Sheets paste
 */
export function generateContactsTsv(contacts: Contact[]): string {
  const headers = [
    "Name",
    "Company",
    "Designation",
    "Phone",
    "Alternate Phone",
    "Email",
    "Website",
    "Address",
    "City",
    "State",
    "PIN Code",
    "Country",
    "Education",
    "LinkedIn",
    "Tags",
    "Notes",
    "Date Added",
  ];

  const sanitizeTsvCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    return String(val).replace(/[\t\r\n]+/g, " ").trim();
  };

  const rows = contacts.map((c) => {
    const tagNames = (c.tags || []).map((t) => t.name).join(", ");
    const combinedNotes = [
      c.notes || "",
      ...(c.contact_notes || []).map((n) => n.note),
    ]
      .filter(Boolean)
      .join(" | ");

    return [
      c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" "),
      c.company_name,
      c.designation,
      c.phone,
      c.alternate_phone,
      c.email,
      c.website,
      c.address,
      c.city,
      c.state,
      c.postal_code,
      c.country,
      c.education,
      c.linkedin_url,
      tagNames,
      combinedNotes,
      c.created_at ? new Date(c.created_at).toISOString().split("T")[0] : "",
    ]
      .map(sanitizeTsvCell)
      .join("\t");
  });

  return [headers.join("\t"), ...rows].join("\n");
}

/**
 * Generate a native Microsoft Excel XML Workbook (.xls) with styled header row
 */
export function generateContactsExcelXml(contacts: Contact[]): string {
  const headers = [
    "Name",
    "Company",
    "Designation",
    "Phone",
    "Alternate Phone",
    "Email",
    "Website",
    "Address",
    "City",
    "State",
    "PIN Code",
    "Country",
    "Education",
    "LinkedIn",
    "Tags",
    "Notes",
    "Date Added",
  ];

  const escXml = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const headerCells = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escXml(h)}</Data></Cell>`
    )
    .join("");

  const dataRows = contacts
    .map((c) => {
      const tagNames = (c.tags || []).map((t) => t.name).join(", ");
      const combinedNotes = [
        c.notes || "",
        ...(c.contact_notes || []).map((n) => n.note),
      ]
        .filter(Boolean)
        .join(" | ");

      const cells = [
        c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" "),
        c.company_name,
        c.designation,
        c.phone,
        c.alternate_phone,
        c.email,
        c.website,
        c.address,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.education,
        c.linkedin_url,
        tagNames,
        combinedNotes,
        c.created_at ? new Date(c.created_at).toISOString().split("T")[0] : "",
      ]
        .map(
          (val) =>
            `<Cell><Data ss:Type="String">${escXml(val)}</Data></Cell>`
        )
        .join("");

      return `<Row>${cells}</Row>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#101F50" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Contacts">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function formatConfidencePercentage(score: number | undefined): string {
  if (score === undefined || score === null || Number.isNaN(score)) return "N/A";
  return `${Math.round(score * 100)}%`;
}

export function getConfidenceLevel(score: number | undefined): ConfidenceLevel {
  if (score === undefined || score === null) return "low";
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function formatDateShort(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

