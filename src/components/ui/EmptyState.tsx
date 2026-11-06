import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center text-center py-12 px-6 bg-white border border-[#DDE4F0] rounded-xl"
    >
      <div className="w-12 h-12 rounded-xl bg-[#F3F6FB] text-[#3478F6] flex items-center justify-center mb-3.5">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[#101F50]">{title}</h3>
      <p className="text-sm text-[#5A6782] max-w-md mt-1 mb-5">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[#E4EBF5] rounded-xl ${className}`}
    />
  );
}

