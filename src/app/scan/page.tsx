"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Upload,
  RotateCw,
  ScanLine,
  Sparkles,
  FileImage,
  X,
  CheckCircle2,
  Crop,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

const SAMPLE_CARDS = [
  {
    label: "Corporate Card (Aarav Mehta)",
    path: "/sample-cards/card_01_aarav_mehta.jpg",
  },
  {
    label: "Dark Background Card (Dr. Priya Nair)",
    path: "/sample-cards/card_02_priya_nair_dark.jpg",
  },
  {
    label: "Two-Column Card (Rohan Kulkarni)",
    path: "/sample-cards/card_03_rohan_kulkarni_multicol.png",
  },
];

export default function SingleCardScannerPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [cropTight, setCropTight] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");

  // Live Camera Modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const handleFileChosen = (file: File) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type.toLowerCase())) {
      showError(
        "Unsupported file format",
        "Please upload a JPG, JPEG, PNG, or WEBP image."
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError("File too large", "Maximum allowed file size is 10 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRotation(0);
    setCropTight(false);
  };

  const handleLoadSampleCard = async (samplePath: string, label: string) => {
    try {
      const res = await fetch(samplePath);
      if (!res.ok) throw new Error("Sample card file not found.");
      const blob = await res.blob();
      const filename = samplePath.split("/").pop() || "sample_card.jpg";
      const file = new File([blob], filename, {
        type: blob.type || "image/jpeg",
      });
      handleFileChosen(file);
      success("Sample loaded", `Loaded ${label} for OCR scanning.`);
    } catch (err) {
      showError(
        "Could not load sample card",
        err instanceof Error ? err.message : "Failed to fetch sample image."
      );
    }
  };

  const startLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      setMediaStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      // Fallback to native file input with capture="environment"
      mobileCameraInputRef.current?.click();
    }
  };

  const stopLiveCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    setCameraOpen(false);
  };

  const captureFromVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1000;
    canvas.height = video.videoHeight || 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const capturedFile = new File([blob], `camera-capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          handleFileChosen(capturedFile);
          stopLiveCamera();
        }
      },
      "image/jpeg",
      0.94
    );
  };

  const applyClientCropIfRequested = async (file: File): Promise<File> => {
    if (!cropTight) return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const marginX = Math.round(img.width * 0.06);
        const marginY = Math.round(img.height * 0.06);
        const cropW = img.width - marginX * 2;
        const cropH = img.height - marginY * 2;
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, marginX, marginY, cropW, cropH, 0, 0, cropW, cropH);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.95
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmitScan = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setProcessingStep("Uploading original card to private bucket...");

    try {
      const preparedFile = await applyClientCropIfRequested(selectedFile);
      setTimeout(
        () =>
          setProcessingStep(
            "Enhancing card with OpenCV & running local PaddleOCR..."
          ),
        500
      );

      const scan = await api.uploadSingleCard(preparedFile, rotation);
      success(
        "OCR Extraction Complete",
        "Review and verify extracted contact details."
      );
      router.push(`/scans/${scan.id}/review`);
    } catch (err) {
      showError(
        "OCR Scan Failed",
        err instanceof Error ? err.message : "Could not process visiting card."
      );
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#101F50] tracking-tight">
            Scan Visiting Card
          </h1>
          <p className="text-xs text-[#5A6782] mt-0.5">
            Upload or capture a business card. OpenCV enhances image contrast
            and perspective before local PaddleOCR extracts contact fields.
          </p>
        </div>

        {/* Sample Cards Quick Bar */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#101F50]">
            <Sparkles className="w-4 h-4 text-[#19C6B3] shrink-0" />
            <span>Quick Test with Sample Cards:</span>
          </div>
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
            {SAMPLE_CARDS.map((s) => (
              <Button
                key={s.path}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto justify-center"
                onClick={() => handleLoadSampleCard(s.path, s.label)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {!selectedFile ? (
          /* Upload / Drag-and-Drop / Camera Zone */
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileChosen(f);
            }}
            className={`bg-white border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors ${
              isDragging
                ? "border-[#3478F6] bg-blue-50/40"
                : "border-[#DDE4F0] hover:border-[#3478F6]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
            <input
              ref={mobileCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />

            <div className="w-14 h-14 rounded-2xl bg-[#F3F6FB] text-[#3478F6] flex items-center justify-center mx-auto mb-4">
              <FileImage className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-[#101F50]">
              Drag and drop a visiting card image here
            </h2>
            <p className="text-xs text-[#5A6782] mt-1 max-w-md mx-auto">
              Supports JPG, JPEG, PNG, and WEBP up to 10 MB. Original card
              images are preserved in private storage.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 mt-6">
              <Button
                variant="primary"
                className="w-full sm:w-auto"
                onClick={() => fileInputRef.current?.click()}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Choose Card Image
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={startLiveCamera}
                leftIcon={<Camera className="w-4 h-4" />}
              >
                Capture with Camera
              </Button>
            </div>
          </div>
        ) : (
          /* Preview, Rotate, Crop & Submit Panel */
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DDE4F0]">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#101F50]">
                  Card Preview & Orientation
                </h2>
                <p className="text-xs text-[#5A6782] truncate">
                  {selectedFile.name} (
                  {(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                >
                  Rotate 90° ({rotation}°)
                </Button>
                <Button
                  variant={cropTight ? "secondary" : "outline"}
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => setCropTight((v) => !v)}
                  leftIcon={<Crop className="w-3.5 h-3.5" />}
                >
                  {cropTight ? "Trim Active" : "Trim Border"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  leftIcon={<X className="w-3.5 h-3.5" />}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="bg-[#F3F6FB] border border-[#DDE4F0] rounded-xl p-3 sm:p-6 flex items-center justify-center min-h-[220px] sm:min-h-[280px] overflow-hidden">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Visiting card preview"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${
                      cropTight ? 1.08 : 1
                    })`,
                  }}
                  className="max-h-60 sm:max-h-80 max-w-full w-auto object-contain rounded-lg shadow-sm transition-transform duration-200"
                />
              )}
            </div>

            {isProcessing && (
              <div
                role="status"
                className="p-3.5 sm:p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3"
              >
                <div className="w-5 h-5 border-2 border-[#3478F6] border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#101F50]">
                    Processing Visiting Card...
                  </p>
                  <p className="text-xs text-[#5A6782] mt-0.5">
                    {processingStep}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isProcessing}
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
              >
                Choose Another Image
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                isLoading={isProcessing}
                onClick={handleSubmitScan}
                leftIcon={
                  <ScanLine className="w-4 h-4 text-[#19C6B3]" />
                }
              >
                Run OCR & Extract Fields
              </Button>
            </div>
          </div>
        )}

        {/* Pipeline Assurance Card */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#101F50]">
                OpenCV Enhancement
              </p>
              <p className="text-[#5A6782] mt-0.5">
                Auto-deskew, perspective warp, CLAHE contrast, and dark-card
                handling.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#101F50]">
                Local PaddleOCR Engine
              </p>
              <p className="text-[#5A6782] mt-0.5">
                Extracts bounding boxes, reading order, and character confidence
                locally.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#101F50]">
                Zero Hallucinations
              </p>
              <p className="text-[#5A6782] mt-0.5">
                Missing fields remain null and uncertain fields are flagged for
                review.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Live WebRTC Camera Modal */}
      <Modal
        isOpen={cameraOpen}
        onClose={stopLiveCamera}
        title="Capture Visiting Card"
        description="Position the visiting card clearly inside the frame."
      >
        <div className="space-y-4">
          <div className="bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={stopLiveCamera}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={captureFromVideo}
              leftIcon={<Camera className="w-4 h-4 text-[#19C6B3]" />}
            >
              Take Photo
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

