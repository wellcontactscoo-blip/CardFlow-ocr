"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Tag as TagIcon, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type { Tag } from "@/types/database";

const PRESET_COLORS = [
  "#101F50",
  "#3478F6",
  "#19C6B3",
  "#FFB52E",
  "#E11D48",
  "#0D9488",
  "#4F46E5",
  "#D97706",
];

export default function TagsManagementPage() {
  const { success, error: showError } = useToast();

  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3478F6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3478F6");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      const res = await api.listTags();
      setTags(res.items);
    } catch (err) {
      showError(
        "Failed to load tags",
        err instanceof Error ? err.message : "Could not load tags."
      );
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await api.createTag({ name: name.trim(), color });
      setName("");
      await loadTags();
      success("Tag created", "New tag added to your workspace.");
    } catch (err) {
      showError(
        "Could not create tag",
        err instanceof Error ? err.message : "Failed to create tag."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEdit = async (tagId: string) => {
    if (!editName.trim()) return;
    try {
      await api.updateTag(tagId, { name: editName.trim(), color: editColor });
      setEditingId(null);
      await loadTags();
      success("Tag updated", "Tag changes saved.");
    } catch (err) {
      showError(
        "Update failed",
        err instanceof Error ? err.message : "Could not update tag."
      );
    }
  };

  const handleDelete = async (tag: Tag) => {
    try {
      await api.deleteTag(tag.id);
      await loadTags();
      success("Tag deleted", `Removed tag '${tag.name}'.`);
    } catch (err) {
      showError(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete tag."
      );
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#101F50] tracking-tight">
            Tags Management
          </h1>
          <p className="text-xs text-[#5A6782] mt-0.5">
            Create and organize color-coded tags to segment your visiting card
            contacts.
          </p>
        </div>

        {/* Create Tag Form */}
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#DDE4F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-end gap-4"
        >
          <div className="flex-1">
            <Input
              label="New Tag Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Investor, SaaS Summit, High Priority"
              required
            />
          </div>

          <div>
            <span className="text-xs font-semibold text-[#202B42] block mb-2">
              Tag Color
            </span>
            <div className="flex items-center gap-1.5 h-10">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select color ${c}`}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    color === c
                      ? "border-[#101F50] scale-115"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            isLoading={isCreating}
            leftIcon={<Plus className="w-4 h-4 text-[#19C6B3]" />}
          >
            Create Tag
          </Button>
        </form>

        {/* Tags List */}
        {isLoading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="w-6 h-6" />}
            title="No tags created yet"
            description="Add your first custom tag above to categorize contacts."
          />
        ) : (
          <div className="bg-white border border-[#DDE4F0] rounded-xl divide-y divide-[#DDE4F0]">
            {tags.map((tag) => {
              const isEditing = editingId === tag.id;
              return (
                <div
                  key={tag.id}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Edit tag name"
                        className="h-9 rounded-lg border border-[#DDE4F0] px-3 text-sm text-[#202B42]"
                      />
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-full border ${
                              editColor === c
                                ? "border-[#101F50] scale-110"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSaveEdit(tag.id)}
                        leftIcon={<Check className="w-3.5 h-3.5" />}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                        leftIcon={<X className="w-3.5 h-3.5" />}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm font-semibold text-[#101F50]">
                          {tag.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F3F6FB] border border-[#DDE4F0] text-xs font-mono text-[#5A6782]">
                          {tag.contact_count ?? 0} contacts
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Edit ${tag.name}`}
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditName(tag.name);
                            setEditColor(tag.color);
                          }}
                          className="p-2 rounded-lg text-[#5A6782] hover:text-[#101F50] hover:bg-[#F3F6FB] cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${tag.name}`}
                          onClick={() => handleDelete(tag)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

