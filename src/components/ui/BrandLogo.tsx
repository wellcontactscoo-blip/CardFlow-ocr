import React from "react";

interface BrandLogoProps {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  subtitle?: string;
}

/**
 * Renders the official Card Scanner'O' brand mark:
 * Cyan horizontal visiting card with 4 corner scanner brackets and center line,
 * paired with "Card" (#12B5EA) + "Scanner'O'" typography.
 */
export function BrandLogo({
  variant = "dark",
  size = "md",
  subtitle,
}: BrandLogoProps) {
  const iconDimensions =
    size === "sm"
      ? "w-9 h-6"
      : size === "lg"
      ? "w-12 h-8"
      : "w-10 h-7";

  const textSize =
    size === "sm"
      ? "text-base"
      : size === "lg"
      ? "text-xl"
      : "text-lg";

  const bracketStroke = variant === "dark" ? "#FFFFFF" : "#0B132B";

  return (
    <div className="inline-flex items-center gap-2.5 min-w-0 select-none">
      {/* Vector recreation of the uploaded Card Scanner'O' icon so it stays razor-sharp on dark & light headers */}
      <svg
        viewBox="0 0 64 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDimensions} shrink-0`}
        aria-hidden="true"
      >
        {/* Cyan horizontal card body */}
        <rect x="6" y="6" width="52" height="32" rx="2" fill="#12B5EA" />
        {/* Center horizontal scan line */}
        <line
          x1="18"
          y1="22"
          x2="46"
          y2="22"
          stroke="#0B132B"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {/* Top-Left corner bracket */}
        <path
          d="M10 15V5H20"
          stroke={bracketStroke}
          strokeWidth="3"
          strokeLinecap="square"
        />
        {/* Top-Right corner bracket */}
        <path
          d="M44 5H54V15"
          stroke={bracketStroke}
          strokeWidth="3"
          strokeLinecap="square"
        />
        {/* Bottom-Left corner bracket */}
        <path
          d="M10 29V39H20"
          stroke={bracketStroke}
          strokeWidth="3"
          strokeLinecap="square"
        />
        {/* Bottom-Right corner bracket */}
        <path
          d="M44 39H54V29"
          stroke={bracketStroke}
          strokeWidth="3"
          strokeLinecap="square"
        />
      </svg>

      <div className="min-w-0 leading-tight">
        <div className={`${textSize} font-extrabold tracking-tight truncate`}>
          <span className="text-[#12B5EA]">Card </span>
          <span className={variant === "dark" ? "text-white" : "text-[#0B132B]"}>
            Scanner&apos;O&apos;
          </span>
        </div>
        {subtitle && (
          <span
            className={`text-[10px] truncate block mt-0.5 ${
              variant === "dark" ? "text-slate-300" : "text-[#5A6782]"
            }`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
