"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Layers,
  Upload,
  X,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScanStatusBadge } from "@/components/ui/ConfidenceBadge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import type { ScanBatch } from "@/types/database";

interface QueuedFileItem {
  id: string;
  file: File;
  previewUrl: string;
}

const SAMPLE_CARD_PATHS = [
  "/sample-cards/card_01_aarav_mehta.jpg",
  "/sample-cards/card_02_priya_nair_dark.jpg",
  "/sample-cards/card_03_rohan_kulkarni_multicol.png",
  "/sample-cards/card_04_ananya_reddy_minimal.jpg",
  "/sample-cards/card_05_vikram_singhania_advisory.jpg",
];

export default function BulkScannerPage() {
  const router = useRouter();
  const { success, error: showError, warning } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [batchName, setBatchName] = useState(
    `Networking Batch - ${new Date().toLocaleDateString("en-IN")}`
  );
  const [items, setItems] = useState<QueuedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentBatches, setRecentBatches] = useState<ScanBatch[]>([]);
  const [loadedBatches, setLoadedBatches] = useState(false);

  React.useEffect(() => {
    api
      .listBatches()
      .then((res) => {
        setRecentBatches(res.items.slice(0, 5));
        setLoadedBatches(true);
      })
      .catch(() => setLoadedBatches(true));
  }, []);

  const addFiles = (fileList: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const incoming = Array.from(fileList);
    const validNew: QueuedFileItem[] = [];

    for (const file of incoming) {
      if (items.length + validNew.length >= 50) {
        warning(
          "Batch limit reached",
          "Maximum 50 visiting card images are permitted per batch."
        );
        break;
      }
      if (!allowed.includes(file.type.toLowerCase())) {
        showError(
          "Skipped unsupported file",
          `${file.name} is not a JPG, JPEG, PNG, or WEBP image.`
        );
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        showError(
          "Skipped oversized file",
          `${file.name} exceeds the 10 MB file size limit.`
        );
        continue;
      }
      validNew.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (validNew.length > 0) {
      setItems((prev) => [...prev, ...validNew]);
    }
  };

  const removeFile = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
  };

  const handleLoadSampleBatch = async (count: number) => {
    try {
      const loadedFiles: File[] = [];
      for (let i = 0; i < count; i++) {
        const path = SAMPLE_CARD_PATHS[i % SAMPLE_CARD_PATHS.length]!;
        const res = await fetch(path);
        const blob = await res.blob();
        const ext = path.endsWith(".png") ? "png" : "jpg";
        loadedFiles.push(
          new File([blob], `batch_sample_card_${i + 1}.${ext}`, {
            type: blob.type || "image/jpeg",
          })
        );
      }
      addFiles(loadedFiles);
      success(
        "Sample Batch Loaded",
        `Added ${loadedFiles.length} visiting cards to the queue.`
      );
    } catch (err) {
      showError(
        "Failed to load sample batch",
        err instanceof Error ? err.message : "Could not load sample images."
      );
    }
  };

  const handleSubmitBatch = async () => {
    if (items.length === 0) {
      showError("No images selected", "Add at least one visiting card image.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.uploadBatch(
        items.map((i) => i.file),
        batchName.trim() || "Visiting Card Batch"
      );
      success(
        "Batch Queued for Processing",
        `Created batch with ${res.batch.total_images} card scan jobs.`
      );
      router.push(`/batches/${res.batch.id}`);
    } catch (err) {
      showError(
        "Batch Upload Failed",
        err instanceof Error ? err.message : "Could not submit batch."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#101F50] tracking-tight">
              Bulk Visiting Card Scanner
            </h1>
            <p className="text-xs text-[#5A6782] mt-0.5">
              Upload up to 50 individual visiting card images at once. Background
              workers process each card asynchronously.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => handleLoadSampleBatch(5)}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#19C6B3]" />}
            >
              Load 5 Sample Cards
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => handleLoadSampleBatch(10)}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#3478F6]" />}
            >
              Load 10 Sample Cards
            </Button>
          </div>
        </div>

        {/* Batch Configuration & Dropzone */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-6 space-y-5">
          <div className="max-w-md">
            <Input
              label="Batch Name"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Bengaluru Tech Expo 2026"
              required
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isDragging
                ? "border-[#3478F6] bg-blue-50/40"
                : "border-[#DDE4F0] bg-[#F3F6FB]/50 hover:border-[#3478F6]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="w-12 h-12 rounded-xl bg-white border border-[#DDE4F0] text-[#3478F6] flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <Layers className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[#101F50]">
              Select or drag multiple visiting card images ({items.length} / 50)
            </p>
            <p className="text-xs text-[#5A6782] mt-1">
              Supported formats: JPG, JPEG, PNG, WEBP (up to 10 MB per image,
              maximum 50 images per batch).
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Add Visiting Card Images
              </Button>
            </div>
          </div>

          {/* Thumbnail Grid Preview */}
          {items.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#101F50]">
                  Selected Card Images ({items.length})
                </h2>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Remove All
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto p-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group relative bg-[#F3F6FB] border border-[#DDE4F0] rounded-xl overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[16/10] bg-white flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-medium text-[#202B42] truncate">
                        #{idx + 1} {item.file.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeFile(item.id)}
                        className="p-1 rounded-md text-[#5A6782] hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#DDE4F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-[#5A6782]">
                  <AlertCircle className="w-4 h-4 text-[#3478F6] shrink-0" />
                  <span>
                    Each image gets an independent scan job processed by
                    background workers.
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  isLoading={isSubmitting}
                  onClick={handleSubmitBatch}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Start Batch OCR ({items.length} Cards)
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Recent Batch History */}
        {loadedBatches && recentBatches.length > 0 && (
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#101F50]">
              Recent Bulk Batches
            </h2>
            <div className="divide-y divide-[#DDE4F0]">
              {recentBatches.map((b) => (
                <div
                  key={b.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <Link
                      href={`/batches/${b.id}`}
                      className="text-sm font-semibold text-[#101F50] hover:text-[#3478F6]"
                    >
                      {b.batch_name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A6782] mt-0.5">
                      <span>Total: {b.total_images}</span>
                      <span className="inline-flex items-center gap-1 text-teal-700">
                        <CheckCircle2 className="w-3 h-3" /> {b.completed_count}{" "}
                        completed
                      </span>
                      {b.pending_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-[#3478F6]">
                          <Clock className="w-3 h-3" /> {b.pending_count}{" "}
                          processing
                        </span>
                      )}
                      <span>{formatDateTime(b.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ScanStatusBadge status={b.status} />
                    <Link href={`/batches/${b.id}`}>
                      <Button variant="outline" size="sm">
                        Open Batch Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

