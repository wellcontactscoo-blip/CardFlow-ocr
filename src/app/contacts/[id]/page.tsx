"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Trash2,
  Phone,
  Mail,
  MessageSquare,
  Globe,
  MapPin,
  GraduationCap,
  Building2,
  Tag as TagIcon,
  Plus,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/EmptyState";
import {
  EmailActionModal,
  WhatsAppActionModal,
} from "@/components/contacts/CommunicationModals";
import { api } from "@/lib/api";
import { formatDateTime, normalizePhoneForTel } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type { Contact, Tag } from "@/types/database";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: showError } = useToast();

  const [contact, setContact] = useState<Contact | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [showProcessedCard, setShowProcessedCard] = useState(false);
  const [activeCardSide, setActiveCardSide] = useState<"front" | "back">("front");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Communication Modals
  const [waOpen, setWaOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cData, tRes] = await Promise.all([
        api.getContact(params.id),
        api.listTags(),
      ]);
      setContact(cData);
      setAllTags(tRes.items);
      setSelectedTagIds((cData.tags || []).map((t) => t.id));
    } catch (err) {
      showError(
        "Failed to load contact",
        err instanceof Error ? err.message : "Contact not found."
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.id, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = (key: keyof Contact, value: string) => {
    setContact((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    setIsSaving(true);
    try {
      const updated = await api.updateContact(contact.id, {
        full_name: contact.full_name,
        first_name: contact.first_name,
        last_name: contact.last_name,
        company_name: contact.company_name,
        designation: contact.designation,
        phone: contact.phone,
        alternate_phone: contact.alternate_phone,
        email: contact.email,
        website: contact.website,
        address: contact.address,
        city: contact.city,
        state: contact.state,
        postal_code: contact.postal_code,
        country: contact.country,
        education: contact.education,
        linkedin_url: contact.linkedin_url,
        notes: contact.notes,
        tag_ids: selectedTagIds,
      });
      setContact(updated);
      success("Contact updated", "All changes have been saved.");
    } catch (err) {
      showError(
        "Update failed",
        err instanceof Error ? err.message : "Could not save changes."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !newNoteText.trim()) return;
    setIsAddingNote(true);
    try {
      await api.addContactNote(contact.id, newNoteText.trim());
      setNewNoteText("");
      await loadData();
      success("Note added", "Activity note saved to contact timeline.");
    } catch (err) {
      showError(
        "Could not add note",
        err instanceof Error ? err.message : "Failed to save note."
      );
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!contact) return;
    try {
      await api.deleteContactNote(contact.id, noteId);
      await loadData();
      success("Note deleted", "Note removed from contact.");
    } catch (err) {
      showError(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete note."
      );
    }
  };

  const handleDeleteContact = async () => {
    if (!contact) return;
    setIsDeleting(true);
    try {
      await api.deleteContact(contact.id);
      success("Contact deleted", "The contact has been removed from your CRM.");
      router.push("/contacts");
    } catch (err) {
      showError(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete contact."
      );
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-14 w-80" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Skeleton className="lg:col-span-5 h-96" />
            <Skeleton className="lg:col-span-7 h-96" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!contact) {
    return (
      <AppShell>
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-8 text-center">
          <p className="text-sm font-semibold text-[#101F50]">
            Contact not found
          </p>
          <Link href="/contacts" className="inline-block mt-4">
            <Button variant="primary" size="sm">
              Back to Contacts
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const telHref = normalizePhoneForTel(
    contact.phone || contact.alternate_phone
  );
  const hasBackImage = Boolean(
    contact.back_original_image_url || contact.back_processed_image_url
  );
  const cardImgUrl =
    activeCardSide === "back" && hasBackImage
      ? showProcessedCard
        ? contact.back_processed_image_url || contact.back_original_image_url
        : contact.back_original_image_url || contact.back_processed_image_url
      : showProcessedCard
        ? contact.processed_image_url || contact.original_image_url
        : contact.original_image_url;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header Bar with Communication Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/contacts"
              className="p-2 rounded-xl bg-white border border-[#DDE4F0] text-[#202B42] hover:bg-[#F3F6FB]"
              aria-label="Back to Contacts"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[#101F50]">
                {contact.full_name || "Unnamed Contact"}
              </h1>
              <p className="text-xs text-[#5A6782] flex flex-wrap items-center gap-2 mt-0.5">
                {contact.designation && <span>{contact.designation}</span>}
                {contact.company_name && (
                  <span className="inline-flex items-center gap-1 font-medium text-[#202B42]">
                    <Building2 className="w-3.5 h-3.5 text-[#3478F6]" />
                    {contact.company_name}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(contact.phone || contact.alternate_phone) && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setWaOpen(true)}
                leftIcon={<MessageSquare className="w-4 h-4" />}
              >
                WhatsApp
              </Button>
            )}
            {contact.email && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEmailOpen(true)}
                leftIcon={<Mail className="w-4 h-4" />}
              >
                Email
              </Button>
            )}
            {telHref && (
              <a href={`tel:${telHref}`}>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Phone className="w-4 h-4 text-[#101F50]" />}
                >
                  Call {telHref}
                </Button>
              </a>
            )}
            <Button
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              onClick={handleDeleteContact}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Visiting Card Image, Metadata & Notes Timeline */}
          <div className="lg:col-span-5 space-y-6">
            {/* Original Visiting Card Image */}
            <div className="bg-white border border-[#DDE4F0] rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[#101F50]">
                    Visiting Card Image
                  </h2>
                  {hasBackImage && (
                    <div className="inline-flex items-center gap-1 bg-[#F3F6FB] p-0.5 rounded-lg border border-[#DDE4F0]">
                      <button
                        type="button"
                        onClick={() => setActiveCardSide("front")}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          activeCardSide === "front"
                            ? "bg-[#12B5EA] text-white"
                            : "text-[#5A6782] hover:text-[#101F50]"
                        }`}
                      >
                        Front
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCardSide("back")}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          activeCardSide === "back"
                            ? "bg-[#12B5EA] text-white"
                            : "text-[#5A6782] hover:text-[#101F50]"
                        }`}
                      >
                        Back
                      </button>
                    </div>
                  )}
                </div>
                {(contact.processed_image_url || contact.back_processed_image_url) && (
                  <button
                    type="button"
                    onClick={() => setShowProcessedCard((v) => !v)}
                    className="text-xs font-semibold text-[#3478F6] hover:underline cursor-pointer"
                  >
                    {showProcessedCard ? "Show Original" : "Show Enhanced"}
                  </button>
                )}
              </div>

              <div className="relative w-full aspect-[1.72/1] bg-[#F3F6FB] border-2 border-emerald-500/80 rounded-xl p-1.5 flex items-center justify-center overflow-hidden">
                {cardImgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardImgUrl}
                    alt={`Visiting card for ${contact.full_name || "contact"} (${activeCardSide})`}
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <p className="text-xs text-[#5A6782]">
                    No card image attached to this contact.
                  </p>
                )}
              </div>

              {/* Quick External Links & Metadata */}
              <div className="pt-2 space-y-1.5 text-xs text-[#5A6782] border-t border-[#DDE4F0]">
                {contact.website && (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-[#3478F6]" />
                      Website:
                    </span>
                    <a
                      href={
                        contact.website.startsWith("http")
                          ? contact.website
                          : `https://${contact.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#3478F6] hover:underline inline-flex items-center gap-1"
                    >
                      {contact.website}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {contact.linkedin_url && (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-[#3478F6]" />
                      LinkedIn:
                    </span>
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#3478F6] hover:underline truncate max-w-[200px]"
                    >
                      {contact.linkedin_url}
                    </a>
                  </div>
                )}

                {contact.education && (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-[#19C6B3]" />
                      Education:
                    </span>
                    <span className="font-medium text-[#202B42]">
                      {contact.education}
                    </span>
                  </div>
                )}

                {contact.address && (
                  <div className="flex items-start gap-1.5 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-[#3478F6] shrink-0 mt-0.5" />
                    <span className="text-[#202B42]">{contact.address}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-[#DDE4F0] space-y-1 text-[11px]">
                  {contact.scan_date && (
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Scan Date:
                      </span>
                      <span className="font-mono">
                        {formatDateTime(contact.scan_date)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Created Date:</span>
                    <span className="font-mono">
                      {formatDateTime(contact.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Updated Date:</span>
                    <span className="font-mono">
                      {formatDateTime(contact.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Notes Timeline */}
            <div className="bg-white border border-[#DDE4F0] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#101F50]">
                Contact Notes & Activity ({contact.contact_notes?.length || 0})
              </h2>

              <form onSubmit={handleAddNote} className="space-y-2.5">
                <textarea
                  rows={3}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add a follow-up note, meeting summary, or action item..."
                  aria-label="New contact note"
                  className="w-full rounded-xl border border-[#DDE4F0] bg-white p-3 text-xs text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    isLoading={isAddingNote}
                    disabled={!newNoteText.trim()}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Note
                  </Button>
                </div>
              </form>

              <div className="divide-y divide-[#DDE4F0]">
                {(contact.contact_notes || []).map((n) => (
                  <div
                    key={n.id}
                    className="py-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <p className="text-[#202B42] whitespace-pre-wrap">
                        {n.note}
                      </p>
                      <p className="text-[10px] font-mono text-[#5A6782]">
                        {formatDateTime(n.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n.id)}
                      aria-label="Delete note"
                      className="p-1 rounded text-[#5A6782] hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Editable Contact Details Form */}
          <form
            onSubmit={handleSaveChanges}
            className="lg:col-span-7 bg-white border border-[#DDE4F0] rounded-xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE4F0]">
              <div>
                <h2 className="text-base font-semibold text-[#101F50]">
                  Edit Contact Information
                </h2>
                <p className="text-xs text-[#5A6782]">
                  Modify any contact field or assign tags below.
                </p>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving}
                leftIcon={<Save className="w-3.5 h-3.5 text-[#19C6B3]" />}
              >
                Save Changes
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Full Name"
                  value={contact.full_name || ""}
                  onChange={(e) => updateField("full_name", e.target.value)}
                />
              </div>

              <Input
                label="First Name"
                value={contact.first_name || ""}
                onChange={(e) => updateField("first_name", e.target.value)}
              />

              <Input
                label="Last Name"
                value={contact.last_name || ""}
                onChange={(e) => updateField("last_name", e.target.value)}
              />

              <Input
                label="Company Name"
                value={contact.company_name || ""}
                onChange={(e) => updateField("company_name", e.target.value)}
              />

              <Input
                label="Designation"
                value={contact.designation || ""}
                onChange={(e) => updateField("designation", e.target.value)}
              />

              <Input
                label="Primary Phone"
                value={contact.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
              />

              <Input
                label="Alternate Phone"
                value={contact.alternate_phone || ""}
                onChange={(e) => updateField("alternate_phone", e.target.value)}
              />

              <Input
                label="Email Address"
                type="email"
                value={contact.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
              />

              <Input
                label="Website"
                value={contact.website || ""}
                onChange={(e) => updateField("website", e.target.value)}
              />

              <Input
                label="LinkedIn URL"
                value={contact.linkedin_url || ""}
                onChange={(e) => updateField("linkedin_url", e.target.value)}
              />

              <Input
                label="Education"
                value={contact.education || ""}
                onChange={(e) => updateField("education", e.target.value)}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Street / Full Address"
                  value={contact.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                />
              </div>

              <Input
                label="City"
                value={contact.city || ""}
                onChange={(e) => updateField("city", e.target.value)}
              />

              <Input
                label="State"
                value={contact.state || ""}
                onChange={(e) => updateField("state", e.target.value)}
              />

              <Input
                label="PIN / Postal Code"
                value={contact.postal_code || ""}
                onChange={(e) => updateField("postal_code", e.target.value)}
              />

              <Input
                label="Country"
                value={contact.country || ""}
                onChange={(e) => updateField("country", e.target.value)}
              />
            </div>

            {/* Tags Picker */}
            <div className="pt-4 border-t border-[#DDE4F0]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-[#202B42] flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5 text-[#3478F6]" />
                  <span>Tags</span>
                </label>
                <Link
                  href="/tags"
                  className="text-xs font-medium text-[#3478F6] hover:underline"
                >
                  Manage tags
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
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

            <div className="pt-4 border-t border-[#DDE4F0] flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                isLoading={isSaving}
                leftIcon={<Save className="w-4 h-4 text-[#19C6B3]" />}
              >
                Save Contact Changes
              </Button>
            </div>
          </form>
        </div>
      </div>

      <WhatsAppActionModal
        contact={contact}
        isOpen={waOpen}
        onClose={() => setWaOpen(false)}
      />

      <EmailActionModal
        contact={contact}
        isOpen={emailOpen}
        onClose={() => setEmailOpen(false)}
      />
    </AppShell>
  );
}

