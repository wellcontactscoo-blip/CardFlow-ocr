import React from "react";
import type { ConfidenceLevel, FieldConfidenceDetail, ScanStatus, BatchStatus } from "@/types/database";

export function ConfidenceBadge({
  detail,
  compact = false,
}: {
  detail?: FieldConfidenceDetail;
  compact?: boolean;
}) {
  if (!detail) return null;

  const styles: Record<ConfidenceLevel, string> = {
    high: "bg-teal-50 text-teal-800 border-teal-200",
    medium: "bg-amber-50 text-amber-800 border-amber-300",
    low: "bg-rose-50 text-rose-800 border-rose-200",
  };

  const labels: Record<ConfidenceLevel, string> = {
    high: "High",
    medium: "Medium",
    low: "Low - Review",
  };

  const ocrPct = Math.round((detail.ocr_confidence || 0) * 100);
  const clsPct = Math.round((detail.classification_confidence || 0) * 100);

  return (
    <span
      title={`OCR Confidence: ${ocrPct}% | Field Classification Confidence: ${clsPct}%`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium border rounded-md ${
        styles[detail.level] || styles.low
      }`}
    >
      <span>{labels[detail.level]}</span>
      {!compact && (
        <span className="font-mono text-[10px] opacity-80">
          OCR {ocrPct}% / CLS {clsPct}%
        </span>
      )}
    </span>
  );
}

export function ScanStatusBadge({ status }: { status: ScanStatus | BatchStatus }) {
  const map: Record<string, { label: string; className: string }> = {
    uploaded: {
      label: "Uploaded",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
    pending: {
      label: "Pending",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
    queued: {
      label: "Queued",
      className: "bg-blue-50 text-[#3478F6] border-blue-200",
    },
    processing: {
      label: "Processing",
      className: "bg-blue-50 text-[#3478F6] border-blue-200 animate-pulse",
    },
    review_required: {
      label: "Review Required",
      className: "bg-amber-50 text-amber-800 border-[#FFB52E]",
    },
    partially_completed: {
      label: "Partially Completed",
      className: "bg-amber-50 text-amber-800 border-[#FFB52E]",
    },
    completed: {
      label: "Completed",
      className: "bg-teal-50 text-teal-800 border-teal-200",
    },
    failed: {
      label: "Failed",
      className: "bg-rose-50 text-rose-700 border-rose-200",
    },
  };

  const item = map[status] || {
    label: status,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${item.className}`}
    >
      {item.label}
    </span>
  );
}

