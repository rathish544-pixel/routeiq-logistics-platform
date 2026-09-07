import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import type { WsConnectionStatus } from "../../hooks/useWebSocket";

interface TopBarProps {
  wsStatus?: WsConnectionStatus;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onCreateOrder?: () => void;
  onOpenSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wsStatus = "connected",
  onRefresh,
  isRefreshing = false,
  onCreateOrder,
  onOpenSidebar,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    navigate(`/orders?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="h-12 bg-surface-container-low border-b border-outline-variant/30 px-space-1-5 flex items-center justify-between gap-compact-sm z-20">
      {/* Mobile menu toggle */}
      {onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-1.5 -ml-1 text-outline hover:text-on-surface rounded transition-colors"
          title="Open navigation"
          aria-label="Open navigation"
        >
          <span className="material-symbols-outlined text-lg">menu</span>
        </button>
      )}

      {/* Left Sector Telemetry + Global Search */}
      <div className="flex items-center gap-space-1-5 flex-1 min-w-0">
        <div className="flex items-center gap-compact-xs shrink-0">
          <span className="font-mono-micro text-[10px] text-outline tracking-wider uppercase">SECTOR:</span>
          <div className="flex items-center gap-compact-2xs bg-surface-container-lowest px-compact-sm py-0.5 rounded border border-outline-variant/20">
            <span className="font-mono-data-dense text-xs text-primary font-semibold">NORTH-EAST METRO (SEC-04)</span>
            <span className="material-symbols-outlined text-xs text-outline">expand_more</span>
          </div>
        </div>

        {/* Global Search (Stitch: Search Orders (#ORD-), Drivers, Routes, or Geo-stops...) */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md hidden md:block">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-outline pointer-events-none">search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Orders (#ORD-), Drivers, Routes, or Geo-stops..."
            className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline-variant/60 font-mono-data-dense text-[11px] rounded pl-8 pr-3 py-1.5 border border-outline-variant/20 outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)] transition-shadow"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          )}
        </form>

        <div className="h-3 w-px bg-surface-container-highest hidden xl:block shrink-0"></div>

        {/* WebSocket Stream Indicator */}
        <div className="items-center gap-compact-2xs font-mono-micro text-[11px] hidden xl:flex shrink-0">
          {wsStatus === "connected" && (
            <>
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
              <span className="text-secondary font-medium">TELEMETRY STREAM LIVE</span>
            </>
          )}
          {wsStatus === "connecting" && (
            <>
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
              <span className="text-tertiary font-medium">CONNECTING TELEMETRY...</span>
            </>
          )}
          {wsStatus === "disconnected" && (
            <>
              <span className="w-2 h-2 rounded-full bg-error"></span>
              <span className="text-error font-medium">STREAM OFFLINE (RETRYING)</span>
            </>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-compact-sm shrink-0">
        <div className="hidden md:flex items-center gap-compact-xs bg-surface-container-lowest px-compact-xs py-1 rounded border border-outline-variant/20">
          <span className="font-mono-micro text-[10px] text-outline">AUTO-SYNC:</span>
          <span className="font-mono-data-dense text-xs text-on-surface">2.0s</span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="ml-1 bg-surface-container hover:bg-surface-bright active:bg-primary/20 text-on-surface px-compact-sm py-0.5 rounded font-mono-micro text-[10px] flex items-center gap-1 transition-colors disabled:opacity-50"
            title="Force Full Telemetry Resynchronization"
          >
            <span className={`material-symbols-outlined text-xs ${isRefreshing ? "animate-spin" : ""}`}>sync</span>
            <span>FORCE SYNC</span>
          </button>
        </div>

        {/* Stitch quick action: Create Order */}
        {onCreateOrder && (
          <button
            onClick={onCreateOrder}
            className="flex items-center gap-1 px-compact-sm py-1 bg-[#2563EB] hover:bg-[#3B82F6] active:bg-[#1D4ED8] text-white rounded font-body-medium text-xs font-semibold transition-colors"
            title="Ingest New Dispatch Order"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            <span className="hidden lg:inline">Create Order</span>
          </button>
        )}

        {/* User Identity Chip */}
        {user && (
          <div className="flex items-center gap-compact-xs bg-surface-container px-compact-sm py-1 rounded border border-outline-variant/20">
            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono-micro text-[10px] font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col text-left hidden md:block">
              <span className="font-mono-data-dense text-[11px] text-on-surface leading-none">{user.name}</span>
              <span className="font-mono-micro text-[9px] text-outline leading-tight">{user.role}</span>
            </div>
            <button
              onClick={() => logout()}
              className="text-outline hover:text-error ml-1 p-0.5 rounded transition-colors"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};