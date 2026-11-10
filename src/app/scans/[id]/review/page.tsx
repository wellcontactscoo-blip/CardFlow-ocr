"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Eye,
  FileText,
  UserCheck,
  GitMerge,
  Tag as TagIcon,
  MessageSquare,
  Mail,
  Phone,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  ConfidenceBadge,
  ScanStatusBadge,
} from "@/components/ui/ConfidenceBadge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/EmptyState";
import {
  EmailActionModal,
  WhatsAppActionModal,
} from "@/components/contacts/CommunicationModals";
import { api } from "@/lib/api";
import { normalizePhoneForTel } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type {
  CardScan,
  Contact,
  DuplicateMatch,
  ExtractedContactFields,
  Tag,
} from "@/types/database";

const EMPTY_FIELDS: ExtractedContactFields = {
  full_name: "",
  first_name: "",
  last_name: "",
  company_name: "",
  designation: "",
  phone: "",
  alternate_phone: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  education: "",
  linkedin_url: "",
  other_information: [],
};

export default function ScanExtractionReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: showError, warning } = useToast();

  const [scan, setScan] = useState<CardScan | null>(null);
  const [fields, setFields] = useState<ExtractedContactFields>(EMPTY_FIELDS);
  const [notes, setNotes] = useState("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showProcessedImage, setShowProcessedImage] = useState(false);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const loadScanData = useCallback(async () => {
    try {
      const [scanData, tagsRes] = await Promise.all([
        api.getScan(params.id),
        api.listTags(),
      ]);
      setScan(scanData);
      setAvailableTags(tagsRes.items);
      const ext = scanData.extracted_data || EMPTY_FIELDS;
      setFields({
        full_name: ext.full_name || "",
        first_name: ext.first_name || "",
        last_name: ext.last_name || "",
        company_name: ext.company_name || "",
        designation: ext.designation || "",
        phone: ext.phone || "",
        alternate_phone: ext.alternate_phone || "",
        email: ext.email || "",
        website: ext.website || "",
        address: ext.address || "",
        city: ext.city || "",
        state: ext.state || "",
        postal_code: ext.postal_code || "",
        country: ext.country || "",
        education: ext.education || "",
        linkedin_url: ext.linkedin_url || "",
        other_information: ext.other_information || [],
      });
      setDuplicates(scanData.duplicates || []);
    } catch (err) {
      showError(
        "Could not load scan",
        err instanceof Error ? err.message : "Scan not found."
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.id, showError]);

  useEffect(() => {
    loadScanData();
  }, [loadScanData]);

  const updateField = (key: keyof ExtractedContactFields, value: string) => {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "full_name") {
        const parts = value.trim().split(/\s+/).filter(Boolean);
        next.first_name = parts[0] || "";
        next.last_name = parts.slice(1).join(" ") || "";
      }
      return next;
    });
  };

  const handleCheckDuplicatesLive = async () => {
    try {
      const res = await api.checkDuplicates(fields);
      setDuplicates(res.duplicates);
      if (res.duplicates.length > 0) {
        warning(
          "Potential duplicate detected",
          `Found ${res.duplicates.length} matching contact(s) in your CRM.`
        );
      }
    } catch {
      // Ignore transient check failure
    }
  };

  const handleApproveAndSave = async (mergeIntoContactId?: string) => {
    if (!scan) return;
    setIsSaving(true);
    try {
      // Persist any manual edits to the scan record first
      await api.updateScanExtraction(scan.id, fields);

      const savedContact = await api.createContact({
        scan_id: scan.id,
        full_name: fields.full_name || null,
        first_name: fields.first_name || null,
        last_name: fields.last_name || null,
        company_name: fields.company_name || null,
        designation: fields.designation || null,
        phone: fields.phone || null,
        alternate_phone: fields.alternate_phone || null,
        email: fields.email || null,
        website: fields.website || null,
        address: fields.address || null,
        city: fields.city || null,
        state: fields.state || null,
        postal_code: fields.postal_code || null,
        country: fields.country || null,
        education: fields.education || null,
        linkedin_url: fields.linkedin_url || null,
        additional_information: {
          other_information: fields.other_information,
        },
        notes: notes.trim() || null,
        tag_ids: selectedTagIds,
        merge_into_contact_id: mergeIntoContactId || null,
      });

      success(
        mergeIntoContactId ? "Existing Contact Updated" : "Contact Saved",
        `${
          savedContact.full_name || savedContact.company_name || "Contact"
        } has been saved to your CRM.`
      );
      router.push(`/contacts/${savedContact.id}`);
    } catch (err) {
      showError(
        "Failed to save contact",
        err instanceof Error ? err.message : "Could not save contact."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryOcr = async () => {
    if (!scan) return;
    setIsRetrying(true);
    try {
      await api.retryScan(scan.id);
      await loadScanData();
      success("OCR Re-processed", "Extraction fields have been refreshed.");
    } catch (err) {
      showError(
        "Retry failed",
        err instanceof Error ? err.message : "Could not re-run OCR."
      );
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRejectScan = async () => {
    if (!scan) return;
    setIsRejecting(true);
    try {
      await api.rejectScan(scan.id);
      success("Scan rejected", "The scan and card images have been removed.");
      router.push("/scan");
    } catch (err) {
      showError(
        "Could not reject scan",
        err instanceof Error ? err.message : "Delete failed."
      );
      setIsRejecting(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-12 w-72" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Skeleton className="lg:col-span-5 h-[520px]" />
            <Skeleton className="lg:col-span-7 h-[520px]" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!scan) {
    return (
      <AppShell>
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-8 text-center">
          <p className="text-sm font-semibold text-[#101F50]">Scan not found</p>
          <Link href="/scan" className="inline-block mt-4">
            <Button variant="primary" size="sm">
              Back to Scanner
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const conf = scan.extraction_confidence || {};
  const displayedImageUrl = showProcessedImage
    ? scan.processed_image_url || scan.original_image_url
    : scan.original_image_url;
  const telHref = normalizePhoneForTel(fields.phone || fields.alternate_phone);
  const previewContact: Contact = {
    id: scan.id,
    user_id: scan.user_id,
    organization_id: scan.organization_id,
    scan_id: scan.id,
    full_name: fields.full_name || null,
    first_name: fields.first_name || null,
    last_name: fields.last_name || null,
    company_name: fields.company_name || null,
    designation: fields.designation || null,
    phone: fields.phone || null,
    alternate_phone: fields.alternate_phone || null,
    email: fields.email || null,
    website: fields.website || null,
    address: fields.address || null,
    city: fields.city || null,
    state: fields.state || null,
    postal_code: fields.postal_code || null,
    country: fields.country || null,
    education: fields.education || null,
    linkedin_url: fields.linkedin_url || null,
    additional_information: {},
    notes: notes || null,
    original_image_url: scan.original_image_url,
    processed_image_url: scan.processed_image_url,
    scan_date: scan.created_at,
    created_at: scan.created_at,
    updated_at: scan.created_at,
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={scan.batch_id ? `/batches/${scan.batch_id}` : "/scan"}
              className="p-2 rounded-xl bg-white border border-[#DDE4F0] text-[#202B42] hover:bg-[#F3F6FB]"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#101F50]">
                  Extraction Review & Verification
                </h1>
                <ScanStatusBadge status={scan.status} />
              </div>
              <p className="text-xs text-[#5A6782] mt-0.5">
                Compare extracted fields against the source card image. Edit any
                field before approving.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(fields.phone || fields.alternate_phone) && (
              <Button
                variant="accent"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setWaOpen(true)}
                leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
              >
                WhatsApp
              </Button>
            )}
            {fields.email && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setEmailOpen(true)}
                leftIcon={<Mail className="w-3.5 h-3.5" />}
              >
                Email
              </Button>
            )}
            {telHref && (
              <a href={`tel:${telHref}`} className="flex-1 sm:flex-none">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  leftIcon={<Phone className="w-3.5 h-3.5 text-[#101F50]" />}
                >
                  Call
                </Button>
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              isLoading={isRetrying}
              onClick={handleRetryOcr}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Re-run OCR
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1 sm:flex-none"
              isLoading={isRejecting}
              onClick={handleRejectScan}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Reject Scan
            </Button>
            <Button
              variant="primary"
              size="md"
              className="w-full sm:w-auto"
              isLoading={isSaving}
              onClick={() => handleApproveAndSave()}
              leftIcon={
                <CheckCircle2 className="w-4 h-4 text-[#19C6B3]" />
              }
            >
              Approve & Save Contact
            </Button>
          </div>
        </div>

        {/* Duplicate Warning Banner (Module 9) */}
        {duplicates.length > 0 && (
          <div className="bg-amber-50 border border-[#FFB52E] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-amber-950">
                  Potential Duplicate Contact Detected ({duplicates.length})
                </h2>
                <p className="text-xs text-amber-900 mt-0.5">
                  Matches existing contact{" "}
                  <strong>
                    {duplicates[0]?.contact.full_name ||
                      duplicates[0]?.contact.company_name}
                  </strong>{" "}
                  ({duplicates[0]?.match_reasons.join(", ")}). You can save as a
                  new contact, update the existing contact, or compare both.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareModalOpen(true)}
                leftIcon={<Eye className="w-3.5 h-3.5" />}
              >
                Review Both Records
              </Button>
              {duplicates[0] && (
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isSaving}
                  onClick={() =>
                    handleApproveAndSave(duplicates[0]!.contact.id)
                  }
                  leftIcon={<GitMerge className="w-3.5 h-3.5" />}
                >
                  Update Existing
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                isLoading={isSaving}
                onClick={() => handleApproveAndSave()}
                leftIcon={<UserCheck className="w-3.5 h-3.5" />}
              >
                Save as New
              </Button>
            </div>
          </div>
        )}

        {/* Main Split Interface: Source Image + OCR Segments (Left) vs Structured Form (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Card Image & Raw OCR Output */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#101F50]">
                  Source Visiting Card
                </h2>
                <div className="flex items-center gap-1.5 bg-[#F3F6FB] p-1 rounded-lg border border-[#DDE4F0]">
                  <button
                    type="button"
                    onClick={() => setShowProcessedImage(false)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      !showProcessedImage
                        ? "bg-[#101F50] text-white"
                        : "text-[#5A6782] hover:text-[#202B42]"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProcessedImage(true)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      showProcessedImage
                        ? "bg-[#101F50] text-white"
                        : "text-[#5A6782] hover:text-[#202B42]"
                    }`}
                  >
                    OpenCV Enhanced
                  </button>
                </div>
              </div>

              <div className="bg-[#F3F6FB] border border-[#DDE4F0] rounded-xl p-3 flex items-center justify-center min-h-[220px] overflow-hidden">
                {displayedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayedImageUrl}
                    alt="Scanned visiting card"
                    className="max-h-72 w-auto object-contain rounded-lg shadow-xs"
                  />
                ) : (
                  <p className="text-xs text-[#5A6782]">
                    Signed card image unavailable
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[#5A6782]">
                  Detected {scan.ocr_output?.length || 0} text segments
                </span>
                <button
                  type="button"
                  onClick={() => setShowRawOcr((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#3478F6] hover:underline cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {showRawOcr ? "Hide Raw OCR Segments" : "Inspect Raw OCR & BBoxes"}
                  </span>
                </button>
              </div>

              {showRawOcr && (
                <div className="pt-3 border-t border-[#DDE4F0] space-y-2 max-h-72 overflow-y-auto">
                  {scan.ocr_output && scan.ocr_output.length > 0 ? (
                    scan.ocr_output.map((seg, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] text-xs flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-[10px] text-[#5A6782] mr-1.5">
                            #{seg.reading_order}
                          </span>
                          <span className="font-medium text-[#202B42] break-words">
                            {seg.text}
                          </span>
                          <p className="font-mono text-[10px] text-[#5A6782] mt-0.5">
                            BBox: [{seg.bbox.join(", ")}]
                          </p>
                        </div>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#DDE4F0] text-[#101F50] shrink-0">
                          {Math.round(seg.confidence * 100)}%
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#5A6782]">
                      No OCR segments recorded.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Unclassified / Other OCR Text */}
            {fields.other_information && fields.other_information.length > 0 && (
              <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#101F50] uppercase tracking-wider">
                  Other Unclassified Card Text
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {fields.other_information.map((line, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] text-xs text-[#202B42]"
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Structured Contact Fields Form with Per-Field Confidence */}
          <div className="lg:col-span-7 bg-white border border-[#DDE4F0] rounded-xl p-6 space-y-6">
            <div className="pb-3 border-b border-[#DDE4F0] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#101F50]">
                  Structured Contact Information
                </h2>
                <p className="text-xs text-[#5A6782]">
                  Each badge shows OCR recognition confidence (OCR) and field
                  classification confidence (CLS).
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckDuplicatesLive}
              >
                Re-check Duplicates
              </Button>
            </div>

            {/* Identity & Company Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Full Name"
                  value={fields.full_name || ""}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  onBlur={handleCheckDuplicatesLive}
                  placeholder="Not detected on card"
                  rightElement={<ConfidenceBadge detail={conf.full_name} />}
                />
              </div>

              <Input
                label="First Name"
                value={fields.first_name || ""}
                onChange={(e) => updateField("first_name", e.target.value)}
                placeholder="First name"
                rightElement={
                  <ConfidenceBadge detail={conf.first_name} compact />
                }
              />

              <Input
                label="Last Name"
                value={fields.last_name || ""}
                onChange={(e) => updateField("last_name", e.target.value)}
                placeholder="Last name"
                rightElement={
                  <ConfidenceBadge detail={conf.last_name} compact />
                }
              />

              <Input
                label="Company Name"
                value={fields.company_name || ""}
                onChange={(e) => updateField("company_name", e.target.value)}
                onBlur={handleCheckDuplicatesLive}
                placeholder="Not detected on card"
                rightElement={<ConfidenceBadge detail={conf.company_name} />}
              />

              <Input
                label="Designation / Job Title"
                value={fields.designation || ""}
                onChange={(e) => updateField("designation", e.target.value)}
                placeholder="Not detected on card"
                rightElement={<ConfidenceBadge detail={conf.designation} />}
              />
            </div>

            {/* Contact Channels Section */}
            <div className="pt-4 border-t border-[#DDE4F0] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Primary Phone Number"
                value={fields.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                onBlur={handleCheckDuplicatesLive}
                placeholder="+91..."
                rightElement={<ConfidenceBadge detail={conf.phone} />}
              />

              <Input
                label="Alternate Phone Number"
                value={fields.alternate_phone || ""}
                onChange={(e) => updateField("alternate_phone", e.target.value)}
                placeholder="Optional alternate number"
                rightElement={<ConfidenceBadge detail={conf.alternate_phone} />}
              />

              <Input
                label="Email Address"
                type="email"
                value={fields.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
                onBlur={handleCheckDuplicatesLive}
                placeholder="Not detected on card"
                rightElement={<ConfidenceBadge detail={conf.email} />}
              />

              <Input
                label="Website"
                value={fields.website || ""}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://..."
                rightElement={<ConfidenceBadge detail={conf.website} />}
              />

              <Input
                label="LinkedIn URL"
                value={fields.linkedin_url || ""}
                onChange={(e) => updateField("linkedin_url", e.target.value)}
                placeholder="https://linkedin.com/in/..."
                rightElement={<ConfidenceBadge detail={conf.linkedin_url} />}
              />

              <Input
                label="Education / Qualifications"
                value={fields.education || ""}
                onChange={(e) => updateField("education", e.target.value)}
                placeholder="Null (not present unless on card)"
                rightElement={<ConfidenceBadge detail={conf.education} />}
              />
            </div>

            {/* Address & Location Section */}
            <div className="pt-4 border-t border-[#DDE4F0] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Full Address"
                  value={fields.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Street, building, area..."
                  rightElement={<ConfidenceBadge detail={conf.address} />}
                />
              </div>

              <Input
                label="City"
                value={fields.city || ""}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="City"
                rightElement={<ConfidenceBadge detail={conf.city} compact />}
              />

              <Input
                label="State"
                value={fields.state || ""}
                onChange={(e) => updateField("state", e.target.value)}
                placeholder="State"
                rightElement={<ConfidenceBadge detail={conf.state} compact />}
              />

              <Input
                label="PIN / Postal Code"
                value={fields.postal_code || ""}
                onChange={(e) => updateField("postal_code", e.target.value)}
                placeholder="6-digit PIN"
                rightElement={
                  <ConfidenceBadge detail={conf.postal_code} compact />
                }
              />

              <Input
                label="Country"
                value={fields.country || ""}
                onChange={(e) => updateField("country", e.target.value)}
                placeholder="Country"
                rightElement={<ConfidenceBadge detail={conf.country} compact />}
              />
            </div>

            {/* Tags & Notes */}
            <div className="pt-4 border-t border-[#DDE4F0] space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#202B42] flex items-center gap-1.5 mb-2">
                  <TagIcon className="w-3.5 h-3.5 text-[#3478F6]" />
                  <span>Assign CRM Tags</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          active
                            ? "bg-[#101F50] text-white border-[#101F50]"
                            : "bg-[#F3F6FB] text-[#202B42] border-[#DDE4F0] hover:border-[#3478F6]"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Input
                label="Initial Contact Note (Optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Met at Bengaluru Tech Summit..."
              />
            </div>

            <div className="pt-4 border-t border-[#DDE4F0] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleRejectScan}
                isLoading={isRejecting}
              >
                Reject Scan
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => handleApproveAndSave()}
                isLoading={isSaving}
                leftIcon={
                  <CheckCircle2 className="w-4 h-4 text-[#19C6B3]" />
                }
              >
                Approve & Save Contact
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Side-by-Side Comparison Modal */}
      <Modal
        isOpen={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Duplicate Contact Review"
        description="Compare extracted card details with your existing CRM record before deciding."
        maxWidthClass="max-w-2xl"
      >
        {duplicates[0] && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] space-y-2">
                <p className="font-bold text-[#101F50] uppercase tracking-wider">
                  New Scanned Card
                </p>
                <p>
                  <strong>Name:</strong> {fields.full_name || "-"}
                </p>
                <p>
                  <strong>Company:</strong> {fields.company_name || "-"}
                </p>
                <p>
                  <strong>Title:</strong> {fields.designation || "-"}
                </p>
                <p>
                  <strong>Phone:</strong> {fields.phone || "-"}
                </p>
                <p>
                  <strong>Email:</strong> {fields.email || "-"}
                </p>
                <p>
                  <strong>City:</strong> {fields.city || "-"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-[#FFB52E] space-y-2">
                <p className="font-bold text-amber-950 uppercase tracking-wider">
                  Existing CRM Record
                </p>
                <p>
                  <strong>Name:</strong>{" "}
                  {duplicates[0].contact.full_name || "-"}
                </p>
                <p>
                  <strong>Company:</strong>{" "}
                  {duplicates[0].contact.company_name || "-"}
                </p>
                <p>
                  <strong>Title:</strong>{" "}
                  {duplicates[0].contact.designation || "-"}
                </p>
                <p>
                  <strong>Phone:</strong> {duplicates[0].contact.phone || "-"}
                </p>
                <p>
                  <strong>Email:</strong> {duplicates[0].contact.email || "-"}
                </p>
                <p>
                  <strong>City:</strong> {duplicates[0].contact.city || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DDE4F0]">
              <Button
                variant="outline"
                onClick={() => setCompareModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                isLoading={isSaving}
                onClick={() => {
                  setCompareModalOpen(false);
                  handleApproveAndSave(duplicates[0]!.contact.id);
                }}
              >
                Update Existing Record
              </Button>
              <Button
                variant="primary"
                isLoading={isSaving}
                onClick={() => {
                  setCompareModalOpen(false);
                  handleApproveAndSave();
                }}
              >
                Save as Separate New Contact
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <WhatsAppActionModal
        contact={previewContact}
        isOpen={waOpen}
        onClose={() => setWaOpen(false)}
      />

      <EmailActionModal
        contact={previewContact}
        isOpen={emailOpen}
        onClose={() => setEmailOpen(false)}
      />
    </AppShell>
  );
}

