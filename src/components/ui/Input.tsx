"use client";

import React, { useId } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  rightElement?: React.ReactNode;
}

export function Input({
  label,
  helperText,
  error,
  rightElement,
  className = "",
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-[#202B42] tracking-tight"
        >
          {label}
          {props.required && <span className="text-rose-600 ml-0.5">*</span>}
        </label>
        {rightElement}
      </div>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `${inputId}-error`
            : helperText
            ? `${inputId}-helper`
            : undefined
        }
        className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm text-[#202B42] placeholder:text-[#7B88A1] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3478F6] focus:border-transparent disabled:bg-[#F3F6FB] disabled:text-[#5A6782] ${
          error ? "border-rose-500 focus:ring-rose-500" : "border-[#DDE4F0]"
        } ${className}`}
        {...props}
      />
      {helperText && !error && (
        <p id={`${inputId}-helper`} className="text-xs text-[#5A6782]">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-rose-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

