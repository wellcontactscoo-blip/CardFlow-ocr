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
  FlipHorizontal,
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

type CardSide = "front" | "back";

/**
 * Automatically crops a vertical camera image (height > width) to the central
 * horizontal visiting card area (1.72:1 green guide region) so top/bottom table
 * background is removed immediately.
 */
async function cropToHorizontalCardCanvas(
  file: File,
  forceTightCrop: boolean
): Promise<{ croppedFile: File; wasVerticalCropped: boolean }> {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const w = img.width;
      const h = img.height;

      // Case 1: Vertical phone camera photo (h > w) where card is horizontal in the center
      if (h > w * 1.05) {
        const marginX = Math.round(w * 0.04);
        const cropW = Math.max(100, w - marginX * 2);
        // Standard horizontal visiting card aspect ratio (~1.68:1)
        const cropH = Math.min(h, Math.round(cropW / 1.65));
        const cropX = marginX;
        const cropY = Math.max(0, Math.round((h - cropH) / 2));

        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ croppedFile: file, wasVerticalCropped: false });
          return;
        }
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ croppedFile: file, wasVerticalCropped: false });
              return;
            }
            resolve({
              croppedFile: new File([blob], file.name, { type: "image/jpeg" }),
              wasVerticalCropped: true,
            });
          },
          "image/jpeg",
          0.95
        );
        return;
      }

      // Case 2: Optional tight border trim on an already-horizontal card
      if (forceTightCrop) {
        const marginX = Math.round(w * 0.05);
        const marginY = Math.round(h * 0.05);
        const cropW = Math.max(100, w - marginX * 2);
        const cropH = Math.max(60, h - marginY * 2);
        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ croppedFile: file, wasVerticalCropped: false });
          return;
        }
        ctx.drawImage(img, marginX, marginY, cropW, cropH, 0, 0, cropW, cropH);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ croppedFile: file, wasVerticalCropped: false });
              return;
            }
            resolve({
              croppedFile: new File([blob], file.name, { type: "image/jpeg" }),
              wasVerticalCropped: false,
            });
          },
          "image/jpeg",
          0.95
        );
        return;
      }

      resolve({ croppedFile: file, wasVerticalCropped: false });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ croppedFile: file, wasVerticalCropped: false });
    };
    img.src = objUrl;
  });
}

export default function SingleCardScannerPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();

  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const frontMobileCameraRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const backMobileCameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Front of card state
  const [frontRawFile, setFrontRawFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [frontRotation, setFrontRotation] = useState<number>(0);
  const [frontGreenCrop, setFrontGreenCrop] = useState<boolean>(true);

  // Back of card state
  const [backRawFile, setBackRawFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [backRotation, setBackRotation] = useState<number>(0);
  const [backGreenCrop, setBackGreenCrop] = useState<boolean>(true);

  const [isDraggingFront, setIsDraggingFront] = useState(false);
  const [isDraggingBack, setIsDraggingBack] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");

  // Live Horizontal Camera Modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTargetSide, setCameraTargetSide] = useState<CardSide>("front");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const validateAndLoadFile = async (
    file: File,
    side: CardSide,
    autoCropGreenArea = true
  ) => {
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

    const processed = autoCropGreenArea
      ? (await cropToHorizontalCardCanvas(file, false)).croppedFile
      : file;

    if (side === "front") {
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      setFrontRawFile(file);
      setFrontFile(processed);
      setFrontPreviewUrl(URL.createObjectURL(processed));
      setFrontRotation(0);
      setFrontGreenCrop(autoCropGreenArea);
    } else {
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setBackRawFile(file);
      setBackFile(processed);
      setBackPreviewUrl(URL.createObjectURL(processed));
      setBackRotation(0);
      setBackGreenCrop(autoCropGreenArea);
    }
  };

  const toggleGreenAreaCrop = async (side: CardSide) => {
    if (side === "front" && frontRawFile) {
      const nextCrop = !frontGreenCrop;
      setFrontGreenCrop(nextCrop);
      const nextFile = nextCrop
        ? (await cropToHorizontalCardCanvas(frontRawFile, true)).croppedFile
        : frontRawFile;
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      setFrontFile(nextFile);
      setFrontPreviewUrl(URL.createObjectURL(nextFile));
    } else if (side === "back" && backRawFile) {
      const nextCrop = !backGreenCrop;
      setBackGreenCrop(nextCrop);
      const nextFile = nextCrop
        ? (await cropToHorizontalCardCanvas(backRawFile, true)).croppedFile
        : backRawFile;
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setBackFile(nextFile);
      setBackPreviewUrl(URL.createObjectURL(nextFile));
    }
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
      await validateAndLoadFile(file, "front", true);
      success("Sample loaded", `Loaded ${label} as Front of Card.`);
    } catch (err) {
      showError(
        "Could not load sample card",
        err instanceof Error ? err.message : "Failed to fetch sample image."
      );
    }
  };

  const startLiveCamera = async (side: CardSide) => {
    setCameraTargetSide(side);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
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
      // Fallback to native camera file input (which auto-crops to horizontal green frame on load)
      if (side === "front") {
        frontMobileCameraRef.current?.click();
      } else {
        backMobileCameraRef.current?.click();
      }
    }
  };

  const stopLiveCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    setCameraOpen(false);
  };

  /**
   * Captures ONLY the horizontal green visiting-card guide box (1.72 : 1 landscape ratio)
   * from the live camera stream, stripping away all top/bottom unwanted background space.
   */
  const captureFromVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    // Compute horizontal card crop region (88% of width, 1.72:1 landscape card aspect ratio)
    const targetAspect = 1.72;
    let cropW = Math.round(vw * 0.9);
    let cropH = Math.round(cropW / targetAspect);
    if (cropH > vh * 0.86) {
      cropH = Math.round(vh * 0.86);
      cropW = Math.round(cropH * targetAspect);
    }
    const cropX = Math.max(0, Math.round((vw - cropW) / 2));
    const cropY = Math.max(0, Math.round((vh - cropH) / 2));

    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    canvas.toBlob(
      async (blob) => {
        if (blob) {
          const capturedFile = new File(
            [blob],
            `${cameraTargetSide}-card-${Date.now()}.jpg`,
            { type: "image/jpeg" }
          );
          await validateAndLoadFile(capturedFile, cameraTargetSide, false);
          stopLiveCamera();
        }
      },
      "image/jpeg",
      0.95
    );
  };

  const handleSubmitScan = async () => {
    if (!frontFile) {
      showError(
        "Front of card required",
        "Please upload or capture the Front of the visiting card first."
      );
      return;
    }
    setIsProcessing(true);
    setProcessingStep(
      backFile
        ? "Uploading Front & Back card images to private bucket..."
        : "Uploading Front of card image to private bucket..."
    );

    try {
      setTimeout(
        () =>
          setProcessingStep(
            backFile
              ? "Cropping card regions & running local OCR on Front + Back..."
              : "Cropping card region & running local OCR..."
          ),
        450
      );

      const scan = await api.uploadSingleCard(
        frontFile,
        frontRotation,
        backFile,
        backRotation
      );
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
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
        {/* Compact Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#101F50] tracking-tight">
              Scan Visiting Card (Front &amp; Back)
            </h1>
            <p className="text-xs text-[#5A6782] mt-0.5">
              Horizontal card scanner automatically crops unwanted top/bottom
              space and extracts fields from Front &amp; optional Back of card.
            </p>
          </div>
        </div>

        {/* Sample Cards Quick Bar */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#101F50]">
            <Sparkles className="w-4 h-4 text-[#12B5EA] shrink-0" />
            <span>Quick Test with Sample Cards:</span>
          </div>
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-1.5">
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

        {/* Hidden File & Native Camera Inputs for Front & Back */}
        <input
          ref={frontFileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndLoadFile(f, "front", true);
            e.target.value = "";
          }}
        />
        <input
          ref={frontMobileCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndLoadFile(f, "front", true);
            e.target.value = "";
          }}
        />
        <input
          ref={backFileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndLoadFile(f, "back", true);
            e.target.value = "";
          }}
        />
        <input
          ref={backMobileCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndLoadFile(f, "back", true);
            e.target.value = "";
          }}
        />

        {/* Two-Slot Horizontal Card Grid: Front of Card + Back of Card */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SLOT 1: FRONT OF CARD IMAGE */}
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#DDE4F0]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-[#101F50] text-white text-[11px] font-bold uppercase tracking-wider shrink-0">
                  Front
                </span>
                <h2 className="text-sm font-bold text-[#101F50] truncate">
                  Front of Card Image *
                </h2>
              </div>
              {frontFile && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => setFrontRotation((r) => (r + 90) % 360)}
                    leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                  >
                    {frontRotation}°
                  </Button>
                  <Button
                    variant={frontGreenCrop ? "secondary" : "outline"}
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => toggleGreenAreaCrop("front")}
                    leftIcon={<Crop className="w-3.5 h-3.5" />}
                  >
                    {frontGreenCrop ? "Card Crop ON" : "Crop Card"}
                  </Button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setFrontRawFile(null);
                      setFrontFile(null);
                      setFrontPreviewUrl(null);
                    }}
                    className="p-1.5 rounded-lg text-[#5A6782] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    aria-label="Remove front card image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {!frontFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFront(true);
                }}
                onDragLeave={() => setIsDraggingFront(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFront(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) validateAndLoadFile(f, "front", true);
                }}
                className={`aspect-[1.72/1] border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors ${
                  isDraggingFront
                    ? "border-emerald-500 bg-emerald-50/40"
                    : "border-emerald-500/70 bg-emerald-50/20 hover:border-emerald-600"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                  <FileImage className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#101F50]">
                  Front of Card Image (Horizontal Frame)
                </p>
                <p className="text-[11px] text-[#5A6782] mt-0.5 max-w-xs">
                  Only the horizontal card area inside the green frame is kept.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3 w-full">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => startLiveCamera("front")}
                    leftIcon={<Camera className="w-3.5 h-3.5 text-[#12B5EA]" />}
                  >
                    Horizontal Camera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => frontFileInputRef.current?.click()}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                  >
                    Upload Front
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative aspect-[1.72/1] bg-[#0F172A] border-2 border-emerald-500 rounded-xl overflow-hidden flex items-center justify-center">
                  {frontPreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={frontPreviewUrl}
                      alt="Front of visiting card preview"
                      style={{ transform: `rotate(${frontRotation}deg)` }}
                      className="w-full h-full object-contain transition-transform duration-200"
                    />
                  )}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[10px] font-semibold">
                    Horizontal Card Area
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#5A6782]">
                  <span className="truncate">{frontFile.name}</span>
                  <button
                    type="button"
                    onClick={() => frontFileInputRef.current?.click()}
                    className="font-semibold text-[#3478F6] hover:underline cursor-pointer shrink-0"
                  >
                    Replace Front Image
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SLOT 2: BACK OF CARD IMAGE (OPTIONAL) */}
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#DDE4F0]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-[#12B5EA]/15 text-[#0984B3] text-[11px] font-bold uppercase tracking-wider shrink-0">
                  Back
                </span>
                <h2 className="text-sm font-bold text-[#101F50] truncate">
                  Back of Card Image{" "}
                  <span className="text-xs font-normal text-[#5A6782]">
                    (Optional)
                  </span>
                </h2>
              </div>
              {backFile && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => setBackRotation((r) => (r + 90) % 360)}
                    leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                  >
                    {backRotation}°
                  </Button>
                  <Button
                    variant={backGreenCrop ? "secondary" : "outline"}
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => toggleGreenAreaCrop("back")}
                    leftIcon={<Crop className="w-3.5 h-3.5" />}
                  >
                    {backGreenCrop ? "Card Crop ON" : "Crop Card"}
                  </Button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setBackRawFile(null);
                      setBackFile(null);
                      setBackPreviewUrl(null);
                    }}
                    className="p-1.5 rounded-lg text-[#5A6782] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    aria-label="Remove back card image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {!backFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingBack(true);
                }}
                onDragLeave={() => setIsDraggingBack(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingBack(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) validateAndLoadFile(f, "back", true);
                }}
                className={`aspect-[1.72/1] border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors ${
                  isDraggingBack
                    ? "border-emerald-500 bg-emerald-50/40"
                    : "border-[#DDE4F0] bg-[#F3F6FB]/50 hover:border-emerald-500"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#DDE4F0] text-[#3478F6] flex items-center justify-center mb-2">
                  <FlipHorizontal className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#101F50]">
                  Back of Card Image (Optional)
                </p>
                <p className="text-[11px] text-[#5A6782] mt-0.5 max-w-xs">
                  Add the reverse side if it contains address, email, branches,
                  or services.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3 w-full">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => startLiveCamera("back")}
                    leftIcon={<Camera className="w-3.5 h-3.5" />}
                  >
                    Horizontal Camera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => backFileInputRef.current?.click()}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                  >
                    Upload Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative aspect-[1.72/1] bg-[#0F172A] border-2 border-emerald-500 rounded-xl overflow-hidden flex items-center justify-center">
                  {backPreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={backPreviewUrl}
                      alt="Back of visiting card preview"
                      style={{ transform: `rotate(${backRotation}deg)` }}
                      className="w-full h-full object-contain transition-transform duration-200"
                    />
                  )}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[10px] font-semibold">
                    Back Card Area
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#5A6782]">
                  <span className="truncate">{backFile.name}</span>
                  <button
                    type="button"
                    onClick={() => backFileInputRef.current?.click()}
                    className="font-semibold text-[#3478F6] hover:underline cursor-pointer shrink-0"
                  >
                    Replace Back Image
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit / Processing Bar */}
        {frontFile && (
          <div className="bg-white border border-[#DDE4F0] rounded-xl p-4 space-y-3">
            {isProcessing && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3"
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

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="text-xs text-[#5A6782]">
                Ready to scan:{" "}
                <strong className="text-[#101F50]">Front of Card</strong>
                {backFile ? (
                  <>
                    {" "}
                    + <strong className="text-[#101F50]">Back of Card</strong>
                  </>
                ) : (
                  " (Single-sided)"
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isProcessing}
                  onClick={() => {
                    setFrontRawFile(null);
                    setFrontFile(null);
                    setFrontPreviewUrl(null);
                    setBackRawFile(null);
                    setBackFile(null);
                    setBackPreviewUrl(null);
                  }}
                >
                  Clear All
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  isLoading={isProcessing}
                  onClick={handleSubmitScan}
                  leftIcon={<ScanLine className="w-4 h-4 text-[#12B5EA]" />}
                >
                  Run OCR &amp; Extract Fields
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline Assurance Card */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#101F50]">
                Horizontal Card Auto-Crop
              </p>
              <p className="text-[#5A6782] mt-0.5">
                Automatically removes unwanted top/bottom table space and keeps
                only the horizontal card area.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#101F50]">
                Front &amp; Back Merging
              </p>
              <p className="text-[#5A6782] mt-0.5">
                Combines OCR fields from both sides of a visiting card into a
                single contact record.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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

      {/* Horizontal Green-Frame Camera Scanner Modal */}
      <Modal
        isOpen={cameraOpen}
        onClose={stopLiveCamera}
        title={`Capture ${
          cameraTargetSide === "front" ? "Front" : "Back"
        } of Visiting Card (Horizontal)`}
        description="Align the visiting card inside the horizontal green box. Only the area inside the green box will be captured."
      >
        <div className="space-y-4">
          <div className="relative bg-black rounded-xl overflow-hidden aspect-[1.72/1] flex items-center justify-center border-2 border-emerald-500 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Bright Green Horizontal Card Frame Overlay */}
            <div className="pointer-events-none absolute inset-3 border-2 border-emerald-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
                Keep Card Inside Green Frame
              </span>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={stopLiveCamera}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              onClick={captureFromVideo}
              leftIcon={<Camera className="w-4 h-4 text-[#12B5EA]" />}
            >
              Capture Horizontal Card
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
