import { describe, expect, it } from "vitest";
import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  escapeCsvCell,
  generateContactsCsv,
  normalizePhoneForTel,
  normalizePhoneForWhatsApp,
} from "../utils";
import type { Contact } from "@/types/database";

describe("CardFlow Communication & Export Utilities", () => {
  it("normalizes Indian and international phone numbers for WhatsApp (digits only, no + or spaces)", () => {
    expect(normalizePhoneForWhatsApp("+91 98765 43210")).toBe("919876543210");
    expect(normalizePhoneForWhatsApp("098765-43210")).toBe("919876543210");
    expect(normalizePhoneForWhatsApp("9876543210")).toBe("919876543210");
    expect(normalizePhoneForWhatsApp("+1 (415) 555-0199")).toBe("14155550199");
  });

  it("normalizes phone numbers for tel: links with leading plus", () => {
    expect(normalizePhoneForTel("98765 43210")).toBe("+919876543210");
    expect(normalizePhoneForTel("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("builds valid WhatsApp wa.me URLs with optional prefilled message", () => {
    expect(buildWhatsAppUrl("+91 98765 43210")).toBe(
      "https://wa.me/919876543210"
    );
    expect(buildWhatsAppUrl("9876543210", "Hello Aarav")).toBe(
      "https://wa.me/919876543210?text=Hello%20Aarav"
    );
  });

  it("builds valid mailto: URLs with subject and body", () => {
    const url = buildMailtoUrl(
      "aarav@mehtatech.in",
      "Following up",
      "Great meeting you"
    );
    expect(url).toContain("mailto:aarav@mehtatech.in?");
    expect(url).toContain("subject=Following%20up");
    expect(url).toContain("body=Great%20meeting%20you");
  });

  it("guards against spreadsheet formula injection in CSV export", () => {
    expect(escapeCsvCell("=CMD|' /C calc'!A0")).toBe("\"'=CMD|' /C calc'!A0\"");
    expect(escapeCsvCell("+919876543210")).toBe("\"'+919876543210\"");
    expect(escapeCsvCell("-100")).toBe("\"'-100\"");
    expect(escapeCsvCell("@SUM(1+1)")).toBe("\"'@SUM(1+1)\"");
    expect(escapeCsvCell('Mehta "Tech" Pvt Ltd')).toBe(
      '"Mehta ""Tech"" Pvt Ltd"'
    );
  });

  it("generates complete CSV and Excel BOM CSV with all 17 columns", () => {
    const mockContact: Contact = {
      id: "c1",
      user_id: "u1",
      organization_id: null,
      scan_id: null,
      full_name: "Aarav Mehta",
      first_name: "Aarav",
      last_name: "Mehta",
      company_name: "Mehta Technologies Pvt Ltd",
      designation: "CEO",
      phone: "+919876543210",
      alternate_phone: null,
      email: "aarav@mehtatech.in",
      website: "https://www.mehtatech.in",
      address: "402 M.G. Road",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560001",
      country: "India",
      education: "B.Tech",
      linkedin_url: "https://linkedin.com/in/aaravmehta",
      additional_information: {},
      notes: "=important note",
      created_at: "2026-11-05T10:00:00Z",
      updated_at: "2026-11-05T10:00:00Z",
      tags: [
        {
          id: "t1",
          user_id: "u1",
          organization_id: null,
          name: "Client",
          color: "#3478F6",
          created_at: "2026-11-05T10:00:00Z",
        },
      ],
    };

    const csv = generateContactsCsv([mockContact], true);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Aarav Mehta"');
    expect(csv).toContain('"Mehta Technologies Pvt Ltd"');
    expect(csv).toContain("\"'=important note\"");
    expect(csv).toContain('"Client"');
  });
});

