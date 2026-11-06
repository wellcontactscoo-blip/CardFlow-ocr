"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Layers,
  UserPlus,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import {
  ConfidenceBadge,
  ScanStatusBadge,
} from "@/components/ui/ConfidenceBadge";
import { Skeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type { CardScan, ScanBatch } from "@/types/database";

export default function BatchDashboardPage() {
  const params = useParams<{ id: string }>();
  const { success, error: showError } = useToast();

  const [batch, setBatch] = useState<ScanBatch | null>(null);
  const [scans, setScans] = useState<CardScan[]>([]);
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [retryingScanId, setRetryingScanId] = useState<string | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const loadBatch = useCallback(async () => {
    try {
      const res = await api.getBatch(params.id);
      setBatch(res.batch);
      setScans(res.scans);
      setSelectedScanIds((prev) => {
        if (prev.length > 0) return prev;
        return res.scans
          .filter(
            (s) =>
              (s.status === "completed" || s.status === "review_required") &&
              !s.saved_contact_id
          )
          .map((s) => s.id);
      });
    } catch (err) {
      showError(
        "Failed to load batch",
        err instanceof Error ? err.message : "Batch not found."
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.id, showError]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  // Poll every 2 seconds while background workers are still processing scans
  useEffect(() => {
    if (!batch) return;
    if (batch.pending_count <= 0 && batch.status !== "processing") return;

    const timer = setInterval(() => {
      loadBatch();
    }, 2000);

    return () => clearInterval(timer);
  }, [batch, loadBatch]);

  const toggleSelectScan = (scanId: string) => {
    setSelectedScanIds((prev) =>
      prev.includes(scanId)
        ? prev.filter((id) => id !== scanId)
        : [...prev, scanId]
    );
  };

  const toggleSelectAllReady = () => {
    const readyIds = scans
      .filter(
        (s) =>
          (s.status === "completed" || s.status === "review_required") &&
          !s.saved_contact_id
      )
      .map((s) => s.id);

    if (selectedScanIds.length === readyIds.length) {
      setSelectedScanIds([]);
    } else {
      setSelectedScanIds(readyIds);
    }
  };

  const handleRetryFailedAll = async () => {
    if (!batch) return;
    setIsRetryingFailed(true);
    try {
      const res = await api.retryBatchFailed(batch.id);
      setBatch(res.batch);
      setScans(res.scans);
      success("Retrying failed scans", "Failed jobs have been re-queued.");
    } catch (err) {
      showError(
        "Retry failed",
        err instanceof Error ? err.message : "Could not retry failed scans."
      );
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleRetrySingle = async (scanId: string) => {
    setRetryingScanId(scanId);
    try {
      await api.retryScan(scanId);
      await loadBatch();
      success("Scan re-processed", "Card OCR completed.");
    } catch (err) {
      showError(
        "Retry failed",
        err instanceof Error ? err.message : "Could not retry scan."
      );
    } finally {
      setRetryingScanId(null);
    }
  };

  const handleBulkSaveContacts = async (saveAllReady: boolean) => {
    if (!batch) return;
    const idsToSave = saveAllReady ? undefined : selectedScanIds;
    if (!saveAllReady && selectedScanIds.length === 0) {
      showError("No scans selected", "Select at least one scan to save.");
      return;
    }

    setIsSavingBulk(true);
    try {
      const res = await api.bulkSaveBatchContacts(
        batch.id,
        idsToSave,
        skipDuplicates
      );
      success(
        "Contacts Saved",
        `Saved ${res.saved_count} contact(s) to your CRM.`
      );
      await loadBatch();
    } catch (err) {
      showError(
        "Bulk save failed",
        err instanceof Error ? err.message : "Could not save contacts."
      );
    } finally {
      setIsSavingBulk(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-14 w-full max-w-md" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </AppShell>
    );
  }

  if (!batch) {
    return (
      <AppShell>
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-8 text-center">
          <p className="text-sm font-semibold text-[#101F50]">Batch not found</p>
          <Link href="/bulk-scan" className="inline-block mt-4">
            <Button variant="primary" size="sm">
              Back to Bulk Scanner
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const progressPct =
    batch.total_images > 0
      ? Math.round(
          ((batch.completed_count + batch.failed_count) / batch.total_images) *
            100
        )
      : 0;

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <Link
              href="/bulk-scan"
              className="p-2 rounded-xl bg-white border border-[#DDE4F0] text-[#202B42] hover:bg-[#F3F6FB] shrink-0"
              aria-label="Back to Bulk Scanner"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-[#101F50] truncate">
                  {batch.batch_name}
                </h1>
                <ScanStatusBadge status={batch.status} />
              </div>
              <p className="text-xs text-[#5A6782] mt-0.5">
                Batch ID: #{batch.id.slice(0, 8)} | Progress: {progressPct}% (
                {batch.completed_count + batch.failed_count} of{" "}
                {batch.total_images} processed)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {batch.failed_count > 0 && (
              <Button
                variant="outline"
                size="sm"
                isLoading={isRetryingFailed}
                onClick={handleRetryFailedAll}
                leftIcon={<RefreshCw className="w-3.5 h-3.5 text-rose-600" />}
              >
                Retry {batch.failed_count} Failed
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              isLoading={isSavingBulk}
              disabled={selectedScanIds.length === 0}
              onClick={() => handleBulkSaveContacts(false)}
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Save Selected ({selectedScanIds.length})
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSavingBulk}
              onClick={() => handleBulkSaveContacts(true)}
              leftIcon={
                <CheckCircle2 className="w-3.5 h-3.5 text-[#19C6B3]" />
              }
            >
              Save All Extracted
            </Button>
          </div>
        </div>

        {/* Live Progress Bar when Processing */}
        {batch.pending_count > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#101F50]">
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-[#3478F6] border-t-transparent rounded-full animate-spin inline-block" />
                Background OCR workers processing batch...
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-blue-200">
              <div
                className="h-full bg-[#3478F6] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* 6 Required Batch Dashboard Metric Cards (Module 4) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">Total Images</span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#101F50] mt-1">
              {batch.total_images}
            </p>
          </div>
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">Completed Scans</span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-teal-700 mt-1">
              {batch.completed_count}
            </p>
          </div>
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">
              Processing Scans
            </span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#3478F6] mt-1">
              {batch.pending_count}
            </p>
          </div>
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">Failed Scans</span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-rose-600 mt-1">
              {batch.failed_count}
            </p>
          </div>
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">
              Contacts Extracted
            </span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#101F50] mt-1">
              {batch.contacts_extracted ?? batch.completed_count}
            </p>
          </div>
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4">
            <span className="text-xs text-[#5A6782] block">
              Potential Duplicates
            </span>
            <p className="text-xl sm:text-2xl font-bold font-mono text-amber-600 mt-1">
              {batch.potential_duplicates ?? 0}
            </p>
          </div>
        </div>

        {/* Bulk Review Controls */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllReady}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#101F50] hover:text-[#3478F6] cursor-pointer"
            >
              {selectedScanIds.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-[#3478F6]" />
              ) : (
                <Square className="w-4 h-4 text-[#5A6782]" />
              )}
              <span>Select All Ready</span>
            </button>
            <span className="text-xs text-[#5A6782]">
              ({selectedScanIds.length} selected)
            </span>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#202B42] cursor-pointer">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded border-[#DDE4F0]"
            />
            <span>Skip potential duplicates during bulk save</span>
          </label>
        </div>

        {/* Mobile Scan Cards (< md) */}
        <div className="md:hidden space-y-3">
          {scans.map((scan, idx) => {
            const ext = scan.extracted_data || {};
            const conf = scan.extraction_confidence || {};
            const isSaved = Boolean(scan.saved_contact_id);
            const isReady =
              scan.status === "completed" || scan.status === "review_required";
            const selected = selectedScanIds.includes(scan.id);
            const hasDup = scan.duplicates && scan.duplicates.length > 0;

            return (
              <div
                key={`mob-scan-${scan.id}`}
                className={`bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3 ${
                  isSaved ? "bg-teal-50/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      disabled={!isReady || isSaved}
                      checked={selected}
                      onChange={() => toggleSelectScan(scan.id)}
                      aria-label={`Select card #${idx + 1}`}
                      className="w-4 h-4 rounded border-[#DDE4F0] cursor-pointer disabled:opacity-40 shrink-0"
                    />
                    <div className="w-14 h-9 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] overflow-hidden flex items-center justify-center shrink-0">
                      {scan.original_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scan.original_image_url}
                          alt={`Card ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Layers className="w-4 h-4 text-[#5A6782]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#101F50] truncate">
                        {ext.full_name || `Card #${idx + 1}`}
                      </p>
                      <p className="text-xs text-[#5A6782] truncate">
                        {ext.company_name || ext.designation || "-"}
                      </p>
                    </div>
                  </div>
                  {isSaved ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Saved
                    </span>
                  ) : (
                    <ScanStatusBadge status={scan.status} />
                  )}
                </div>

                <div className="text-xs space-y-1 bg-[#F3F6FB] rounded-lg p-2.5 border border-[#DDE4F0]/70">
                  <p className="font-mono text-[#202B42] truncate">
                    {ext.phone || "-"}
                  </p>
                  <p className="text-[#5A6782] truncate">{ext.email || "-"}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {conf.full_name && (
                      <ConfidenceBadge detail={conf.full_name} compact />
                    )}
                    {hasDup && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-[#FFB52E] text-[10px] font-semibold text-amber-900">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Duplicate
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {scan.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={retryingScanId === scan.id}
                        onClick={() => handleRetrySingle(scan.id)}
                        leftIcon={<RefreshCw className="w-3 h-3" />}
                      >
                        Retry
                      </Button>
                    )}
                    {isSaved && scan.saved_contact_id ? (
                      <Link href={`/contacts/${scan.saved_contact_id}`}>
                        <Button variant="ghost" size="sm">
                          View Contact
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/scans/${scan.id}/review`}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Review
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Bulk Review Table (>= md) */}
        <div className="hidden md:block bg-white border border-[#DDE4F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F3F6FB] border-b border-[#DDE4F0] text-[11px] font-semibold text-[#5A6782] uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">Select</th>
                  <th className="py-3 px-4">Card</th>
                  <th className="py-3 px-4">Extracted Name & Title</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Phone & Email</th>
                  <th className="py-3 px-4">Confidence / Duplicates</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE4F0] text-xs">
                {scans.map((scan, idx) => {
                  const ext = scan.extracted_data || {};
                  const conf = scan.extraction_confidence || {};
                  const isSaved = Boolean(scan.saved_contact_id);
                  const isReady =
                    scan.status === "completed" ||
                    scan.status === "review_required";
                  const selected = selectedScanIds.includes(scan.id);
                  const hasDup =
                    scan.duplicates && scan.duplicates.length > 0;

                  return (
                    <tr
                      key={scan.id}
                      className={`hover:bg-[#F3F6FB]/60 transition-colors ${
                        isSaved ? "bg-teal-50/20" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          disabled={!isReady || isSaved}
                          checked={selected}
                          onChange={() => toggleSelectScan(scan.id)}
                          aria-label={`Select card #${idx + 1}`}
                          className="rounded border-[#DDE4F0] cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-16 h-10 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] overflow-hidden flex items-center justify-center">
                          {scan.original_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={scan.original_image_url}
                              alt={`Card ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Layers className="w-4 h-4 text-[#5A6782]" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#101F50]">
                          {ext.full_name || "Pending / Unclassified"}
                        </p>
                        <p className="text-[#5A6782]">
                          {ext.designation || "-"}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-medium text-[#202B42]">
                        {ext.company_name || "-"}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-[#202B42]">
                          {ext.phone || "-"}
                        </p>
                        <p className="text-[#5A6782] truncate max-w-[180px]">
                          {ext.email || "-"}
                        </p>
                      </td>
                      <td className="py-3 px-4 space-y-1">
                        {conf.full_name && (
                          <div>
                            <ConfidenceBadge
                              detail={conf.full_name}
                              compact
                            />
                          </div>
                        )}
                        {hasDup && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-[#FFB52E] text-[10px] font-semibold text-amber-900">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Possible Duplicate
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isSaved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Saved
                          </span>
                        ) : (
                          <ScanStatusBadge status={scan.status} />
                        )}
                        {scan.error_message && (
                          <p className="text-[10px] text-rose-600 mt-1 max-w-[160px] truncate">
                            {scan.error_message}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {scan.status === "failed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={retryingScanId === scan.id}
                              onClick={() => handleRetrySingle(scan.id)}
                              leftIcon={<RefreshCw className="w-3 h-3" />}
                            >
                              Retry
                            </Button>
                          )}
                          {isSaved && scan.saved_contact_id ? (
                            <Link href={`/contacts/${scan.saved_contact_id}`}>
                              <Button variant="ghost" size="sm">
                                View Contact
                              </Button>
                            </Link>
                          ) : (
                            <Link href={`/scans/${scan.id}/review`}>
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<Eye className="w-3 h-3" />}
                              >
                                Review & Edit
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
