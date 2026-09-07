import React from "react";
import { NavLink } from "react-router-dom";

interface SidebarProps {
  delayedOrdersCount?: number;
  activeDriversCount?: number;
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  delayedOrdersCount = 0,
  activeDriversCount = 0,
  onNavigate,
}) => {
  const navItems = [
    { to: "/", label: "Dashboard", icon: "grid_view" },
    { to: "/orders", label: "Orders", icon: "inventory_2" },
    { to: "/drivers", label: "Drivers", icon: "local_shipping", badge: activeDriversCount > 0 ? `${activeDriversCount}` : undefined, badgeColor: "bg-primary/20 text-primary" },
    { to: "/optimization", label: "Route Optimization", icon: "alt_route" },
    { to: "/tracking", label: "Live Tracking", icon: "my_location" },
    { to: "/delays", label: "Delays & Alerts", icon: "warning_amber", badge: delayedOrdersCount > 0 ? `${delayedOrdersCount}` : undefined, badgeColor: "bg-error/20 text-error" },
    { to: "/analytics", label: "Logistics Analytics", icon: "insights" },
    { to: "/settings", label: "Settings & Policies", icon: "tune" },
  ];

  return (
    <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none">
      {/* Header / Logo */}
      <div>
        <div className="h-14 px-space-1-5 border-b border-outline-variant/30 flex items-center justify-between">
          <NavLink to="/" onClick={onNavigate} className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" fill="none" className="h-7 w-auto">
              <rect width="36" height="36" rx="6" fill="#1E293B" stroke="#3B82F6" strokeWidth="1.5"/>
              <path d="M10 26L18 10L26 26" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 10V26" stroke="#3B82F6" strokeWidth="2" strokeDasharray="2 2"/>
              <circle cx="18" cy="10" r="2.5" fill="#38BDF8"/>
              <circle cx="10" cy="26" r="2" fill="#10B981"/>
              <circle cx="26" cy="26" r="2" fill="#EF4444"/>
              <text x="46" y="24" fill="#F8FAFC" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700" fontSize="18" letterSpacing="0.5">Route<tspan fill="#3B82F6">IQ</tspan></text>
              <text x="122" y="16" fill="#94A3B8" fontFamily="monospace" fontSize="8" letterSpacing="0.5">OPS v2.4</text>
            </svg>
          </NavLink>
          <span className="font-mono-micro text-[9px] px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-bold">PROD</span>
        </div>

        {/* Navigation Items */}
        <nav className="p-space-1 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center justify-between px-space-1 py-2 rounded text-xs font-body-medium transition-colors ${
                  isActive
                    ? "bg-surface-container-high text-primary font-semibold border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`
              }
            >
              <div className="flex items-center gap-space-1">
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`font-mono-micro text-[10px] px-1.5 py-0.5 rounded font-bold ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="p-space-1 border-t border-outline-variant/30 bg-surface-container-low/40">
        <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-mono-micro text-[10px] text-outline uppercase">CORE SOLVER</span>
            <span className="font-mono-micro text-[10px] text-secondary flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> OR-Tools + OSRM
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-outline font-mono-micro">
            <span>DISPATCH MODE</span>
            <span className="text-on-surface">AUTOMATED</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
