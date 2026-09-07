import React from "react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  badge?: string;
  badgeType?: "success" | "warning" | "danger" | "primary" | "neutral";
  sparklineColor?: string;
  breakdown?: { label: string; value: string | number; color?: string }[];
  progressBar?: { value: number; max?: number; color?: string };
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  sublabel,
  badge,
  badgeType = "neutral",
  sparklineColor = "#3B82F6",
  breakdown,
  progressBar,
  onClick,
}) => {
  const badgeClasses = {
    success: "bg-secondary/15 text-secondary",
    warning: "bg-tertiary/15 text-tertiary",
    danger: "bg-error/20 text-error animate-pulse",
    primary: "bg-primary/15 text-primary",
    neutral: "bg-surface-container-high text-outline",
  }[badgeType];

  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-low p-compact-sm rounded border border-outline-variant/20 flex flex-col justify-between hover:bg-surface-container transition-colors ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">{label}</span>
        {badge && (
          <span className={`font-mono-micro text-[10px] px-1 py-0.5 rounded font-bold ${badgeClasses}`}>
            {badge}
          </span>
        )}
      </div>

      <div className="my-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono-data-lg text-xl font-bold text-on-surface tracking-tight">{value}</span>
        {sublabel && <span className="font-mono-micro text-[11px] text-outline">{sublabel}</span>}

        {/* Tactical micro sparkline SVG */}
        <svg className="w-12 h-4 shrink-0" fill="none" viewBox="0 0 60 16">
          <path
            d="M1 12 L14 8 L26 13 L38 5 L48 9 L59 2"
            stroke={sparklineColor}
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {progressBar && (
        <div className="w-full bg-surface-container-lowest h-1.5 rounded overflow-hidden mt-1">
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, (progressBar.value / (progressBar.max || 100)) * 100))}%`,
              backgroundColor: progressBar.color || "#10B981",
            }}
          />
        </div>
      )}

      {breakdown && breakdown.length > 0 && (
        <div className="flex items-center justify-between text-on-surface-variant font-mono-micro text-[10px] pt-1 bg-surface-container-lowest/60 px-1.5 py-0.5 rounded border border-outline-variant/10 mt-1">
          {breakdown.map((item, idx) => (
            <span key={idx}>
              <b className={item.color || "text-on-surface"}>{item.value}</b> {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
