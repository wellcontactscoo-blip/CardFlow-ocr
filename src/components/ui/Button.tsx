"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#101F50] text-white hover:bg-[#172B6E] focus-visible:ring-[#101F50]",
  secondary:
    "bg-[#3478F6] text-white hover:bg-[#2563EB] focus-visible:ring-[#3478F6]",
  accent:
    "bg-[#19C6B3] text-[#101F50] font-semibold hover:bg-[#15B09F] focus-visible:ring-[#19C6B3]",
  outline:
    "bg-white text-[#202B42] border border-[#DDE4F0] hover:bg-[#F3F6FB] focus-visible:ring-[#3478F6]",
  ghost:
    "bg-transparent text-[#202B42] hover:bg-[#E8EEF8] focus-visible:ring-[#3478F6]",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-55 disabled:pointer-events-none cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
}

