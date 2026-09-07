import React from "react";

export interface StatusBadgeProps {
  status: string;
  type?: "order" | "driver" | "sla" | "general";
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "sm" }) => {
  const norm = (status || "").toLowerCase().trim();

  let colorClasses = "bg-surface-container-high text-outline border-outline-variant/30";
  let dotColor = "bg-outline";
  let label = status;

  if (norm === "on_time" || norm === "delivered" || norm === "available" || norm === "on-time" || norm === "on_schedule") {
    colorClasses = "bg-[#10B981]/15 text-[#34D399] border-[#10B981]/30";
    dotColor = "bg-[#34D399]";
    label = norm === "on_time" ? "On-Time" : norm === "on_schedule" ? "On-Schedule" : status;
  } else if (norm === "at_risk" || norm === "at-risk" || norm === "delayed_warning" || norm === "pending") {
    colorClasses = "bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30";
    dotColor = "bg-[#FBBF24]";
    label = norm === "at_risk" ? "At-Risk" : norm === "pending" ? "Pending" : status;
  } else if (norm === "delayed" || norm === "critical" || norm === "late" || norm === "cancelled" || norm === "offline") {
    colorClasses = "bg-[#EF4444]/15 text-[#F87171] border-[#EF4444]/40";
    dotColor = "bg-[#F87171]";
    label = norm === "delayed" ? "Delayed" : status;
  } else if (norm === "in_transit" || norm === "assigned" || norm === "planned" || norm === "active") {
    colorClasses = "bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30";
    dotColor = "bg-[#60A5FA]";
    label = norm === "in_transit" ? "In-Transit" : norm === "planned" ? "Planned Route" : status;
  }

  const px = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <span className={`inline-flex items-center gap-1 font-mono-micro font-semibold rounded border uppercase tracking-wider ${px} ${colorClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
      <span>{label}</span>
    </span>
  );
};
