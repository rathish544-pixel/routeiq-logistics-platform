import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useWebSocket } from "../../hooks/useWebSocket";
import { emitRefreshSignal } from "../../hooks/useRefreshSignal";
import { CreateOrderModal } from "../orders/CreateOrderModal";

interface AppLayoutProps {
  onRefreshAll?: () => void;
  isRefreshing?: boolean;
}

const ROUTE_TITLES: [RegExp, string][] = [
  [/^\/orders\/\d+$/, "Order Details"],
  [/^\/orders$/, "Orders Management"],
  [/^\/drivers\/\d+$/, "Driver Details"],
  [/^\/drivers$/, "Fleet Drivers"],
  [/^\/optimization\/routes\/\d+$/, "Route Details"],
  [/^\/optimization$/, "Route Optimization"],
  [/^\/tracking$/, "Live Tracking"],
  [/^\/delays$/, "Delays & At-Risk"],
  [/^\/analytics$/, "Logistics Analytics"],
  [/^\/settings$/, "Settings & Policies"],
];

/** Sync the browser tab title with the active operational view. */
function useDocumentTitle() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const match = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
    const section = match ? match[1] : "Operations Dashboard";
    document.title = `RouteIQ — ${section}`;
  }, [pathname]);
}

export const AppLayout: React.FC<AppLayoutProps> = ({ onRefreshAll, isRefreshing = false }) => {
  const { status: wsStatus } = useWebSocket();
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useDocumentTitle();

  const handleOrderCreated = () => {
    setIsCreateOrderOpen(false);
    emitRefreshSignal();
  };

  const handleNavigate = () => setIsSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-[#0A0D14] text-[#E1E2EC]">
      {/* Mobile sidebar drawer with backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <div className={`${isSidebarOpen ? "fixed z-50 inset-y-0 left-0" : "hidden"} lg:static lg:flex lg:z-auto`}>
        <Sidebar onNavigate={handleNavigate} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar
          wsStatus={wsStatus}
          onRefresh={onRefreshAll}
          isRefreshing={isRefreshing}
          onCreateOrder={() => setIsCreateOrderOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-space-1 lg:p-space-1-5">
          <Outlet />
        </main>
      </div>

      <CreateOrderModal
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
};