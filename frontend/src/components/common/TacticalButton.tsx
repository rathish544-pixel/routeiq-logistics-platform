import React from "react";

export interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: string;
  loading?: boolean;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-1.5 rounded font-body-medium transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-1.5 text-xs font-semibold",
    lg: "px-4 py-2 text-sm font-semibold",
  }[size];

  const variantClasses = {
    primary:
      "bg-[#2563EB] hover:bg-[#3B82F6] active:bg-[#1D4ED8] text-white shadow-sm border border-transparent focus:ring-2 focus:ring-[#3B82F6]/50",
    secondary:
      "bg-[#172033] hover:bg-[#1E293B] text-[#F8FAFC] border border-[#26354A] hover:border-[#3B82F6]/50",
    danger:
      "bg-[#EF4444]/15 hover:bg-[#EF4444] text-[#F87171] hover:text-white border border-[#EF4444]/40",
    ghost:
      "bg-transparent hover:bg-surface-container text-on-surface-variant hover:text-on-surface",
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-sm">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
