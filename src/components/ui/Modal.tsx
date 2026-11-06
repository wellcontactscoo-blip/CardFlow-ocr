"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "max-w-lg",
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#101F50]/45 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border-t sm:border border-[#DDE4F0] rounded-t-2xl sm:rounded-xl shadow-xl w-full ${maxWidthClass} max-h-[90dvh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]`}
      >
        <div className="flex items-start justify-between gap-4 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#DDE4F0]">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-base font-semibold text-[#101F50] truncate"
            >
              {title}
            </h2>
            {description && (
              <p className="text-xs text-[#5A6782] mt-0.5">{description}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#5A6782] hover:text-[#202B42] hover:bg-[#F3F6FB] shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
