"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Download,
  Phone,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  Eye,
  ArrowUpDown,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Building2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import {
  EmailActionModal,
  WhatsAppActionModal,
} from "@/components/contacts/CommunicationModals";
import { api } from "@/lib/api";
import {
  formatDateShort,
  generateContactsCsv,
  normalizePhoneForTel,
} from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type { Contact, Tag } from "@/types/database";

export default function ContactsCrmPage() {
  const { success, error: showError } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Filters & Sorting
  const [search, setSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<
    "created_at" | "name" | "company" | "updated_at"
  >("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Bulk Selection for Export
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  // Communication Modals
  const [waContact, setWaContact] = useState<Contact | null>(null);
  const [emailContact, setEmailContact] = useState<Contact | null>(null);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [contactsRes, tagsRes] = await Promise.all([
        api.listContacts({
          search: search.trim() || undefined,
          tag_id: selectedTagId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: pageSize,
        }),
        api.listTags(),
      ]);
      setContacts(contactsRes.items);
      setTotal(contactsRes.total);
      setTags(tagsRes.items);
    } catch (err) {
      showError(
        "Failed to load contacts",
        err instanceof Error ? err.message : "Could not fetch CRM contacts."
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    search,
    selectedTagId,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    page,
    showError,
  ]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const toggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = contacts.map((c) => c.id);
    if (
      pageIds.length > 0 &&
      pageIds.every((id) => selectedContactIds.includes(id))
    ) {
      setSelectedContactIds((prev) =>
        prev.filter((id) => !pageIds.includes(id))
      );
    } else {
      setSelectedContactIds((prev) =>
        Array.from(new Set([...prev, ...pageIds]))
      );
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    try {
      await api.deleteContact(contact.id);
      setSelectedContactIds((prev) => prev.filter((id) => id !== contact.id));
      success(
        "Contact deleted",
        `${contact.full_name || "Contact"} has been removed.`
      );
      await loadContacts();
    } catch (err) {
      showError(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete contact."
      );
    }
  };

  const triggerCsvDownload = (
    itemsToExport: Contact[],
    filenamePrefix: string,
    excelCompatible: boolean
  ) => {
    if (itemsToExport.length === 0) {
      showError("No contacts to export", "No matching contacts found.");
      return;
    }
    const csv = generateContactsCsv(itemsToExport, excelCompatible);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenamePrefix}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    success(
      "Export complete",
      `Exported ${itemsToExport.length} contact(s) to ${
        excelCompatible ? "Excel-compatible CSV" : "CSV"
      }.`
    );
  };

  const handleExport = async (
    mode: "all" | "filtered" | "selected",
    excelCompatible = true
  ) => {
    try {
      if (mode === "selected") {
        const chosen = contacts.filter((c) =>
          selectedContactIds.includes(c.id)
        );
        triggerCsvDownload(
          chosen,
          "cardflow-selected-contacts",
          excelCompatible
        );
        return;
      }

      if (mode === "filtered") {
        const res = await api.listContacts({
          search: search.trim() || undefined,
          tag_id: selectedTagId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          page: 1,
          page_size: 1000,
        });
        triggerCsvDownload(
          res.items,
          "cardflow-filtered-contacts",
          excelCompatible
        );
        return;
      }

      const resAll = await api.listContacts({ page: 1, page_size: 1000 });
      triggerCsvDownload(
        resAll.items,
        "cardflow-all-contacts",
        excelCompatible
      );
    } catch (err) {
      showError(
        "Export failed",
        err instanceof Error ? err.message : "Could not export contacts."
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterCount =
    (selectedTagId ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-6">
        {/* Header & Export Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#101F50] tracking-tight">
              Contacts CRM ({total})
            </h1>
            <p className="text-xs text-[#5A6782] mt-0.5">
              Search, filter, tag, export, and connect via WhatsApp, Email, or
              Phone.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedContactIds.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport("selected", true)}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Export Selected ({selectedContactIds.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("filtered", false)}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("all", true)}
              leftIcon={<Download className="w-3.5 h-3.5 text-[#19C6B3]" />}
            >
              Excel CSV
            </Button>
            <Link href="/scan" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="sm"
                className="w-full sm:w-auto"
                leftIcon={<Plus className="w-3.5 h-3.5 text-[#19C6B3]" />}
              >
                Scan New Card
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile-First Search & Collapsible Filters */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#5A6782] absolute left-3 top-3" />
              <input
                id="crm-search"
                type="search"
                aria-label="Search contacts"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, company, phone, email..."
                className="h-10 w-full rounded-xl border border-[#DDE4F0] bg-white pl-9 pr-3 text-sm text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowMobileFilters((v) => !v)}
              aria-label="Toggle filter options"
              className="lg:hidden h-10 px-3 rounded-xl border border-[#DDE4F0] bg-[#F3F6FB] text-xs font-semibold text-[#101F50] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#3478F6]" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#3478F6] text-white text-[10px] inline-flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div
            className={`${
              showMobileFilters ? "grid" : "hidden lg:grid"
            } grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 lg:pt-0`}
          >
            <div>
              <label
                htmlFor="crm-tag-filter"
                className="text-xs font-semibold text-[#202B42] block mb-1"
              >
                Filter by Tag
              </label>
              <select
                id="crm-tag-filter"
                value={selectedTagId}
                onChange={(e) => {
                  setSelectedTagId(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-[#DDE4F0] bg-white px-3 text-sm text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
              >
                <option value="">All Tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="crm-date-from"
                className="text-xs font-semibold text-[#202B42] block mb-1"
              >
                Added From
              </label>
              <input
                id="crm-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-[#DDE4F0] bg-white px-3 text-xs text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
              />
            </div>

            <div>
              <label
                htmlFor="crm-date-to"
                className="text-xs font-semibold text-[#202B42] block mb-1"
              >
                Added To
              </label>
              <input
                id="crm-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-[#DDE4F0] bg-white px-3 text-xs text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
              />
            </div>

            <div className="flex items-end gap-1.5">
              <div className="flex-1">
                <label
                  htmlFor="crm-sort"
                  className="text-xs font-semibold text-[#202B42] block mb-1"
                >
                  Sort By
                </label>
                <select
                  id="crm-sort"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | "created_at"
                        | "name"
                        | "company"
                        | "updated_at"
                    )
                  }
                  className="h-10 w-full rounded-xl border border-[#DDE4F0] bg-white px-2.5 text-xs text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
                >
                  <option value="created_at">Date Added</option>
                  <option value="name">Name</option>
                  <option value="company">Company</option>
                  <option value="updated_at">Last Updated</option>
                </select>
              </div>
              <button
                type="button"
                title={`Sort direction: ${sortDir.toUpperCase()}`}
                aria-label="Toggle sort direction"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="h-10 px-3 rounded-xl border border-[#DDE4F0] bg-[#F3F6FB] hover:bg-[#E4EBF5] text-xs font-semibold text-[#101F50] flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="uppercase">{sortDir}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Contacts List (Mobile Cards + Desktop Table) */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 md:h-14" />
            <Skeleton className="h-24 md:h-14" />
            <Skeleton className="h-24 md:h-14" />
            <Skeleton className="h-24 md:h-14" />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No contacts match your criteria"
            description="Scan a visiting card or adjust your search and tag filters."
            action={
              <Link href="/scan">
                <Button variant="primary" size="sm">
                  Scan Visiting Card
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-3">
              {contacts.map((contact) => {
                const isSelected = selectedContactIds.includes(contact.id);
                const telHref = normalizePhoneForTel(
                  contact.phone || contact.alternate_phone
                );

                return (
                  <div
                    key={`mob-${contact.id}`}
                    className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectContact(contact.id)}
                          aria-label={`Select ${
                            contact.full_name || "contact"
                          }`}
                          className="mt-1 w-4 h-4 rounded border-[#DDE4F0] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="font-bold text-sm text-[#101F50] hover:text-[#3478F6] block truncate"
                          >
                            {contact.full_name || "Unnamed Contact"}
                          </Link>
                          {(contact.designation || contact.company_name) && (
                            <p className="text-xs text-[#5A6782] flex items-center gap-1 truncate mt-0.5">
                              <Building2 className="w-3 h-3 text-[#3478F6] shrink-0" />
                              <span className="truncate">
                                {[contact.designation, contact.company_name]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-[#5A6782] shrink-0">
                        {formatDateShort(contact.created_at)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1 text-xs bg-[#F3F6FB] rounded-lg p-2.5 border border-[#DDE4F0]/70">
                      {(contact.phone || contact.alternate_phone) && (
                        <p className="font-mono text-[#202B42] truncate">
                          {contact.phone || contact.alternate_phone}
                        </p>
                      )}
                      {contact.email && (
                        <p className="text-[#5A6782] truncate">
                          {contact.email}
                        </p>
                      )}
                      {contact.city && (
                        <p className="text-[11px] text-[#5A6782]">
                          {contact.city}
                          {contact.state ? `, ${contact.state}` : ""}
                        </p>
                      )}
                    </div>

                    {(contact.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(contact.tags || []).map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F3F6FB] border border-[#DDE4F0] text-[11px] font-medium text-[#202B42]"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Touch-Friendly Mobile Action Strip */}
                    <div className="pt-2 border-t border-[#DDE4F0] flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(contact.phone || contact.alternate_phone) && (
                          <button
                            type="button"
                            onClick={() => setWaContact(contact)}
                            className="h-9 px-3 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                        )}
                        {contact.email && (
                          <button
                            type="button"
                            onClick={() => setEmailContact(contact)}
                            className="h-9 px-3 rounded-lg bg-blue-50 text-[#3478F6] border border-blue-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email</span>
                          </button>
                        )}
                        {telHref && (
                          <a
                            href={`tel:${telHref}`}
                            className="h-9 px-3 rounded-lg bg-slate-100 text-[#101F50] border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Link
                          href={`/contacts/${contact.id}`}
                          aria-label="View contact"
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#DDE4F0] text-[#101F50] hover:bg-[#F3F6FB]"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          aria-label="Delete contact"
                          onClick={() => handleDeleteContact(contact)}
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

            {/* Tablet & Desktop Table View (>= md) */}
            <div className="hidden md:block bg-white border border-[#DDE4F0] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F3F6FB] border-b border-[#DDE4F0] text-[11px] font-semibold text-[#5A6782] uppercase tracking-wider">
                      <th className="py-3 px-4 w-10">
                        <button
                          type="button"
                          onClick={toggleSelectAllOnPage}
                          aria-label="Select all contacts on page"
                          className="cursor-pointer flex items-center"
                        >
                          {contacts.length > 0 &&
                          contacts.every((c) =>
                            selectedContactIds.includes(c.id)
                          ) ? (
                            <CheckSquare className="w-4 h-4 text-[#3478F6]" />
                          ) : (
                            <Square className="w-4 h-4 text-[#5A6782]" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Contact Name</th>
                      <th className="py-3 px-4">Company & Designation</th>
                      <th className="py-3 px-4">Phone & Email</th>
                      <th className="py-3 px-4">Tags</th>
                      <th className="py-3 px-4">Date Added</th>
                      <th className="py-3 px-4 text-right">
                        Connect & Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE4F0] text-xs">
                    {contacts.map((contact) => {
                      const isSelected = selectedContactIds.includes(contact.id);
                      const telHref = normalizePhoneForTel(
                        contact.phone || contact.alternate_phone
                      );

                      return (
                        <tr
                          key={contact.id}
                          className="hover:bg-[#F3F6FB]/60 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectContact(contact.id)}
                              aria-label={`Select ${
                                contact.full_name || "contact"
                              }`}
                              className="rounded border-[#DDE4F0] cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <Link
                              href={`/contacts/${contact.id}`}
                              className="font-semibold text-sm text-[#101F50] hover:text-[#3478F6] block"
                            >
                              {contact.full_name || "Unnamed Contact"}
                            </Link>
                            {contact.city && (
                              <span className="text-[11px] text-[#5A6782]">
                                {contact.city}
                                {contact.state ? `, ${contact.state}` : ""}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-medium text-[#202B42]">
                              {contact.company_name || "-"}
                            </p>
                            <p className="text-[#5A6782]">
                              {contact.designation || "-"}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-mono text-[#202B42]">
                              {contact.phone || contact.alternate_phone || "-"}
                            </p>
                            <p className="text-[#5A6782] truncate max-w-[200px]">
                              {contact.email || "-"}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(contact.tags || []).length === 0 ? (
                                <span className="text-[#5A6782]">-</span>
                              ) : (
                                (contact.tags || []).map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F3F6FB] border border-[#DDE4F0] text-[11px] font-medium text-[#202B42]"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: t.color }}
                                    />
                                    {t.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[#5A6782]">
                            {formatDateShort(contact.created_at)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              {(contact.phone || contact.alternate_phone) && (
                                <button
                                  type="button"
                                  title="Send WhatsApp message"
                                  aria-label="Send WhatsApp message"
                                  onClick={() => setWaContact(contact)}
                                  className="p-2 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {contact.email && (
                                <button
                                  type="button"
                                  title="Send Email"
                                  aria-label="Send Email"
                                  onClick={() => setEmailContact(contact)}
                                  className="p-2 rounded-lg bg-blue-50 text-[#3478F6] hover:bg-blue-100 border border-blue-200 cursor-pointer"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {telHref && (
                                <a
                                  href={`tel:${telHref}`}
                                  title={`Call ${telHref}`}
                                  aria-label={`Call ${telHref}`}
                                  className="p-2 rounded-lg bg-slate-100 text-[#101F50] hover:bg-slate-200 border border-slate-200"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                              )}

                              <Link
                                href={`/contacts/${contact.id}`}
                                title="View and edit contact details"
                                aria-label="View and edit contact details"
                                className="p-2 rounded-lg text-[#202B42] hover:bg-[#F3F6FB] border border-transparent hover:border-[#DDE4F0]"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Link>

                              <button
                                type="button"
                                title="Delete contact"
                                aria-label="Delete contact"
                                onClick={() => handleDeleteContact(contact)}
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

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="bg-white border border-[#DDE4F0] rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5A6782]">
                <span>
                  Page {page} of {totalPages} ({total} total contacts)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <WhatsAppActionModal
        contact={waContact}
        isOpen={Boolean(waContact)}
        onClose={() => setWaContact(null)}
      />

      <EmailActionModal
        contact={emailContact}
        isOpen={Boolean(emailContact)}
        onClose={() => setEmailContact(null)}
      />
    </AppShell>
  );
}
