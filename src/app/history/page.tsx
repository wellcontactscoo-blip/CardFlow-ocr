"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  History,
  RefreshCw,
  Trash2,
  Eye,
  ScanLine,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ScanStatusBadge } from "@/components/ui/ConfidenceBadge";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type { CardScan, ScanBatch } from "@/types/database";

export default function ScanHistoryPage() {
  const { success, error: showError } = useToast();

  const [scans, setScans] = useState<CardScan[]>([]);
  const [batches, setBatches] = useState<ScanBatch[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [scansRes, batchesRes] = await Promise.all([
        api.listScans({ status: statusFilter || undefined, limit: 100 }),
        api.listBatches(),
      ]);
      setScans(scansRes.items);
      setBatches(batchesRes.items);
    } catch (err) {
      showError(
        "Failed to load history",
        err instanceof Error ? err.message : "Could not load scan history."
      );
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, showError]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRetry = async (scanId: string) => {
    setRetryingId(scanId);
    try {
      await api.retryScan(scanId);
      success("Scan re-processed", "OCR extraction updated.");
      await loadHistory();
    } catch (err) {
      showError(
        "Retry failed",
        err instanceof Error ? err.message : "Could not retry scan."
      );
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (scanId: string) => {
    try {
      await api.rejectScan(scanId);
      success("Scan deleted", "Scan record and images removed.");
      await loadHistory();
    } catch (err) {
      showError(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete scan."
      );
    }
  };

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#101F50] tracking-tight">
              Scan History
            </h1>
            <p className="text-xs text-[#5A6782] mt-0.5">
              Inspect past single-card scans, bulk batches, and OCR processing
              statuses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter by scan status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 flex-1 sm:flex-none rounded-xl border border-[#DDE4F0] bg-white px-3 text-xs font-medium text-[#202B42]"
            >
              <option value="">All Scan Statuses</option>
              <option value="completed">Completed</option>
              <option value="review_required">Review Required</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
            <Link href="/scan">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<ScanLine className="w-3.5 h-3.5 text-[#19C6B3]" />}
              >
                New Scan
              </Button>
            </Link>
          </div>
        </div>

        {/* Batches Summary Section */}
        {batches.length > 0 && (
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#101F50] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#3478F6]" />
                <span>Bulk Upload Batches ({batches.length})</span>
              </h2>
              <Link
                href="/bulk-scan"
                className="text-xs font-medium text-[#3478F6] hover:underline"
              >
                New Bulk Batch
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {batches.map((b) => (
                <Link
                  key={b.id}
                  href={`/batches/${b.id}`}
                  className="p-3.5 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] hover:border-[#3478F6] transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#101F50] truncate">
                      {b.batch_name}
                    </p>
                    <p className="text-[11px] text-[#5A6782] mt-0.5">
                      {b.completed_count}/{b.total_images} completed |{" "}
                      {formatDateTime(b.created_at)}
                    </p>
                  </div>
                  <ScanStatusBadge status={b.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Individual Card Scans (Mobile Cards + Desktop Table) */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 md:h-14" />
            <Skeleton className="h-24 md:h-14" />
            <Skeleton className="h-24 md:h-14" />
          </div>
        ) : scans.length === 0 ? (
          <EmptyState
            icon={<History className="w-6 h-6" />}
            title="No card scans found"
            description="Upload a visiting card to see your OCR history here."
            action={
              <Link href="/scan">
                <Button variant="primary" size="sm">
                  Scan Visiting Card
                </Button>
              </Link>
            }
          />
        ) : (
          <div>
            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-3">
              {scans.map((scan) => {
                const ext = scan.extracted_data || {};
                return (
                  <div
                    key={`mob-hist-${scan.id}`}
                    className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-14 h-9 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] overflow-hidden flex items-center justify-center shrink-0">
                          {scan.original_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={scan.original_image_url}
                              alt="Visiting card thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ScanLine className="w-4 h-4 text-[#5A6782]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[#101F50] truncate">
                            {ext.full_name || "Unclassified Name"}
                          </p>
                          <p className="text-xs text-[#5A6782] truncate">
                            {ext.company_name || "-"}
                          </p>
                        </div>
                      </div>
                      <ScanStatusBadge status={scan.status} />
                    </div>

                    <div className="text-xs space-y-1 bg-[#F3F6FB] rounded-lg p-2.5 border border-[#DDE4F0]/70">
                      <p className="font-mono text-[#202B42] truncate">
                        {ext.phone || "-"}
                      </p>
                      <p className="text-[#5A6782] truncate">
                        {ext.email || "-"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-mono text-[#5A6782]">
                        {formatDateTime(scan.created_at)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/scans/${scan.id}/review`}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Review
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={retryingId === scan.id}
                          onClick={() => handleRetry(scan.id)}
                          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          Retry
                        </Button>
                        <button
                          type="button"
                          aria-label="Delete scan"
                          onClick={() => handleDelete(scan.id)}
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block bg-white border border-[#DDE4F0] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F3F6FB] border-b border-[#DDE4F0] text-[11px] font-semibold text-[#5A6782] uppercase tracking-wider">
                      <th className="py-3 px-4">Card</th>
                      <th className="py-3 px-4">Extracted Name & Company</th>
                      <th className="py-3 px-4">Phone & Email</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Scanned At</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE4F0] text-xs">
                    {scans.map((scan) => {
                      const ext = scan.extracted_data || {};
                      return (
                        <tr
                          key={scan.id}
                          className="hover:bg-[#F3F6FB]/60 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="w-16 h-10 rounded-lg bg-[#F3F6FB] border border-[#DDE4F0] overflow-hidden flex items-center justify-center">
                              {scan.original_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={scan.original_image_url}
                                  alt="Visiting card thumbnail"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ScanLine className="w-4 h-4 text-[#5A6782]" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#101F50]">
                              {ext.full_name || "Unclassified Name"}
                            </p>
                            <p className="text-[#5A6782]">
                              {ext.company_name || "-"}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-mono text-[#202B42]">
                              {ext.phone || "-"}
                            </p>
                            <p className="text-[#5A6782]">{ext.email || "-"}</p>
                          </td>
                          <td className="py-3 px-4">
                            <ScanStatusBadge status={scan.status} />
                            {scan.retry_count > 0 && (
                              <span className="block text-[10px] text-[#5A6782] mt-0.5">
                                Retries: {scan.retry_count}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#5A6782]">
                            {formatDateTime(scan.created_at)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Link href={`/scans/${scan.id}/review`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={<Eye className="w-3.5 h-3.5" />}
                                >
                                  Review
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                isLoading={retryingId === scan.id}
                                onClick={() => handleRetry(scan.id)}
                                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                              >
                                Retry
                              </Button>
                              <button
                                type="button"
                                title="Delete scan"
                                aria-label="Delete scan"
                                onClick={() => handleDelete(scan.id)}
                                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        )}
      </div>
    </AppShell>
  );
}
