"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ScanLine,
  Layers,
  Building2,
  Clock,
  AlertTriangle,
  Download,
  History,
  ArrowRight,
  RefreshCw,
  CalendarPlus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ScanStatusBadge } from "@/components/ui/ConfidenceBadge";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import {
  formatDateShort,
  formatDateTime,
  generateContactsCsv,
} from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type { DashboardStats } from "@/types/database";

export default function DashboardPage() {
  const { success, error: showError } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      showError(
        "Failed to load dashboard",
        err instanceof Error ? err.message : "Could not connect to server."
      );
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRetryScan = async (scanId: string) => {
    setRetryingId(scanId);
    try {
      await api.retryScan(scanId);
      success("Scan re-queued", "The visiting card is being re-processed.");
      await loadDashboard();
    } catch (err) {
      showError(
        "Retry failed",
        err instanceof Error ? err.message : "Could not retry scan."
      );
    } finally {
      setRetryingId(null);
    }
  };

  const handleExportContacts = async () => {
    setIsExporting(true);
    try {
      const res = await api.listContacts({ page: 1, page_size: 1000 });
      if (res.items.length === 0) {
        showError("No contacts to export", "Scan and save a contact first.");
        return;
      }
      const csv = generateContactsCsv(res.items, true);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cardflow-contacts-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success(
        "Contacts exported",
        `Exported ${res.items.length} contacts to CSV.`
      );
    } catch (err) {
      showError(
        "Export failed",
        err instanceof Error ? err.message : "Could not export contacts."
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#101F50] tracking-tight">
              Workspace Overview
            </h1>
            <p className="text-xs text-[#5A6782] mt-0.5">
              Monitor visiting card scans, review pending extractions, and
              manage contacts.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5">
            <Link href="/scan" className="w-full sm:w-auto">
              <Button
                variant="primary"
                className="w-full sm:w-auto"
                leftIcon={<ScanLine className="w-4 h-4 text-[#19C6B3]" />}
              >
                Scan Visiting Card
              </Button>
            </Link>
            <Link href="/bulk-scan" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                leftIcon={<Layers className="w-4 h-4" />}
              >
                Upload Multiple Cards
              </Button>
            </Link>
          </div>
        </div>

        {/* 6 Required Statistics Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Total Contacts</span>
                <Users className="w-4 h-4 text-[#3478F6]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.total_contacts ?? 0}
              </p>
            </div>

            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Scanned Cards</span>
                <ScanLine className="w-4 h-4 text-[#19C6B3]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.total_scanned_cards ?? 0}
              </p>
            </div>

            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Added This Week</span>
                <CalendarPlus className="w-4 h-4 text-[#3478F6]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.contacts_added_this_week ?? 0}
              </p>
            </div>

            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Total Companies</span>
                <Building2 className="w-4 h-4 text-[#101F50]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.total_companies ?? 0}
              </p>
            </div>

            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Pending Scans</span>
                <Clock className="w-4 h-4 text-[#FFB52E]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.pending_scans ?? 0}
              </p>
            </div>

            <div className="bg-white border border-[#DDE4F0] rounded-xl p-4">
              <div className="flex items-center justify-between text-[#5A6782]">
                <span className="text-xs font-medium">Failed Scans</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#101F50] mt-2">
                {stats?.failed_scans ?? 0}
              </p>
            </div>
          </div>
        )}

        {/* Quick Actions Strip */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#101F50] uppercase tracking-wider">
            Quick Actions
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/scan">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ScanLine className="w-3.5 h-3.5 text-[#3478F6]" />}
              >
                Scan a Card
              </Button>
            </Link>
            <Link href="/bulk-scan">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Layers className="w-3.5 h-3.5 text-[#3478F6]" />}
              >
                Bulk Upload (Up to 50)
              </Button>
            </Link>
            <Link href="/contacts">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Users className="w-3.5 h-3.5 text-[#3478F6]" />}
              >
                View Contacts
              </Button>
            </Link>
            <Link href="/history">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<History className="w-3.5 h-3.5 text-[#3478F6]" />}
              >
                Scan History
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              isLoading={isExporting}
              onClick={handleExportContacts}
              leftIcon={<Download className="w-3.5 h-3.5 text-[#19C6B3]" />}
            >
              Export Contacts
            </Button>
          </div>
        </div>

        {/* Failed OCR Jobs Alert Section (if any) */}
        {stats && stats.failed_jobs.length > 0 && (
          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <h2 className="text-sm font-semibold">
                  Failed OCR Jobs Requiring Attention ({stats.failed_jobs.length})
                </h2>
              </div>
              <Link
                href="/history?status=failed"
                className="text-xs font-semibold text-rose-700 hover:underline"
              >
                View all failed jobs
              </Link>
            </div>
            <div className="divide-y divide-rose-200/60">
              {stats.failed_jobs.map((job) => (
                <div
                  key={job.id}
                  className="py-2.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#202B42] truncate">
                      Scan #{job.id.slice(0, 8)} -{" "}
                      {job.error_message || "OCR processing error"}
                    </p>
                    <p className="text-[11px] text-[#5A6782]">
                      Uploaded {formatDateTime(job.created_at)} | Retries:{" "}
                      {job.retry_count}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={retryingId === job.id}
                    onClick={() => handleRetryScan(job.id)}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Grid: Recently Scanned Cards + Recently Added & Updated Contacts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recently Scanned Cards */}
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE4F0]">
                <h2 className="text-sm font-semibold text-[#101F50]">
                  Recently Scanned Cards
                </h2>
                <Link
                  href="/history"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#3478F6] hover:underline"
                >
                  <span>All scans</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {isLoading ? (
                <div className="space-y-2.5 mt-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : !stats || stats.recent_scans.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    icon={<ScanLine className="w-5 h-5" />}
                    title="No scanned cards yet"
                    description="Upload a visiting card or start a bulk batch to extract contact details."
                    action={
                      <Link href="/scan">
                        <Button variant="primary" size="sm">
                          Scan First Card
                        </Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[#DDE4F0] mt-2">
                  {stats.recent_scans.map((scan) => {
                    const name =
                      scan.extracted_data?.full_name ||
                      scan.extracted_data?.company_name ||
                      `Card Scan #${scan.id.slice(0, 8)}`;
                    return (
                      <li
                        key={scan.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/scans/${scan.id}/review`}
                            className="text-sm font-semibold text-[#101F50] hover:text-[#3478F6] truncate block"
                          >
                            {name}
                          </Link>
                          <p className="text-xs text-[#5A6782] truncate">
                            {scan.extracted_data?.company_name ||
                              scan.extracted_data?.email ||
                              formatDateTime(scan.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ScanStatusBadge status={scan.status} />
                          <Link href={`/scans/${scan.id}/review`}>
                            <Button variant="ghost" size="sm">
                              Review
                            </Button>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Recently Added & Updated Contacts */}
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE4F0]">
                <h2 className="text-sm font-semibold text-[#101F50]">
                  Recently Added Contacts
                </h2>
                <Link
                  href="/contacts"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#3478F6] hover:underline"
                >
                  <span>All contacts</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {isLoading ? (
                <div className="space-y-2.5 mt-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : !stats || stats.recent_contacts.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#5A6782]">
                  No contacts saved yet. Approved card scans will appear here.
                </div>
              ) : (
                <ul className="divide-y divide-[#DDE4F0] mt-2">
                  {stats.recent_contacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="text-sm font-semibold text-[#101F50] hover:text-[#3478F6] truncate block"
                        >
                          {contact.full_name || "Unnamed Contact"}
                        </Link>
                        <p className="text-xs text-[#5A6782] truncate">
                          {[contact.designation, contact.company_name]
                            .filter(Boolean)
                            .join(" at ") ||
                            contact.email ||
                            contact.phone ||
                            "-"}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-[#5A6782] shrink-0">
                        {formatDateShort(contact.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recently Updated Contacts */}
            {stats && stats.recent_updated_contacts.length > 0 && (
              <div className="pt-3 border-t border-[#DDE4F0]">
                <h3 className="text-xs font-semibold text-[#5A6782] uppercase tracking-wider mb-2">
                  Recently Updated Contacts
                </h3>
                <ul className="divide-y divide-[#DDE4F0]">
                  {stats.recent_updated_contacts.slice(0, 3).map((contact) => (
                    <li
                      key={`upd-${contact.id}`}
                      className="py-2 flex items-center justify-between gap-3"
                    >
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="text-xs font-semibold text-[#202B42] hover:text-[#3478F6] truncate"
                      >
                        {contact.full_name || contact.company_name || "Contact"}
                      </Link>
                      <span className="text-[11px] font-mono text-[#5A6782]">
                        Updated {formatDateShort(contact.updated_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

