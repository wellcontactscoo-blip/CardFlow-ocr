"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...item, id }]);
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, description?: string) =>
      toast({ type: "success", title, description }),
    [toast]
  );

  const error = useCallback(
    (title: string, description?: string) =>
      toast({ type: "error", title, description }),
    [toast]
  );

  const warning = useCallback(
    (title: string, description?: string) =>
      toast({ type: "warning", title, description }),
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((item) => {
          const iconMap = {
            success: <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />,
            error: <XCircle className="w-5 h-5 text-rose-600 shrink-0" />,
            warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
            info: <Info className="w-5 h-5 text-[#3478F6] shrink-0" />,
          };
          const borderMap = {
            success: "border-l-4 border-l-teal-600",
            error: "border-l-4 border-l-rose-600",
            warning: "border-l-4 border-l-[#FFB52E]",
            info: "border-l-4 border-l-[#3478F6]",
          };

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto bg-white border border-[#DDE4F0] ${borderMap[item.type]} rounded-xl p-3.5 shadow-lg flex items-start gap-3 transition-all`}
            >
              {iconMap[item.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#202B42]">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-[#5A6782] mt-0.5 break-words">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => removeToast(item.id)}
                className="text-[#5A6782] hover:text-[#202B42] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

