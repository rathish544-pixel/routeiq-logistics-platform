import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { driversApi } from "../api/drivers";
import type { Driver } from "../types";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, EmptyState, ErrorState } from "../components/common/States";
import { CreateDriverModal } from "../components/drivers/CreateDriverModal";
import { useRefreshSignal } from "../hooks/useRefreshSignal";

export const DriversPage: React.FC = () => {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);


  const fetchDrivers = async () => {
    try {
      const data = await driversApi.list();
      setDrivers(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load driver roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  // Refetch when shared data changes (e.g. driver created via another view)
  useRefreshSignal(fetchDrivers);

  const filteredDrivers = drivers.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (d.name || "").toLowerCase().includes(q) ||
      (d.driver_code || `#DRV-${d.id}`).toLowerCase().includes(q) ||
      (d.vehicle_type || "").toLowerCase().includes(q) ||
      (d.phone || "").toLowerCase().includes(q)
    );
  });

  const handleToggleAvailable = async (driver: Driver) => {
    try {
      const nextAvail = !driver.available;
      const nextStatus = nextAvail ? "idle" : "offline";
      await driversApi.toggleStatus(driver.id, nextStatus, nextAvail);
      fetchDrivers();
    } catch (err: any) {
      alert(err.message || "Failed to toggle status");
    }
  };

  if (loading) return <LoadingState message="FETCHING FLEET DRIVER TELEMETRY..." />;

  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter((d) => d.available).length;
  const assignedDrivers = drivers.filter((d) => d.status === "assigned" || d.status === "in_transit").length;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {error && <ErrorState message={error} onRetry={fetchDrivers} />}

      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-compact-sm bg-surface-container-low px-space-1-5 py-space-1 rounded border border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-lg font-bold text-on-surface">Fleet Driver Management</h1>
            <span className="font-mono-micro text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-primary font-semibold">
              TELEMETRY MESH ACTIVE
            </span>
          </div>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Active Vehicle Telemetry, Payload Availability, Driver Allocation & Shift Control
          </p>
        </div>

        <TacticalButton variant="primary" size="sm" icon="add" onClick={() => setIsCreateOpen(true)}>
          Register Driver
        </TacticalButton>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-compact-xs">
        <MetricCard label="Total Registered Drivers" value={totalDrivers} badge="Fleet Ready" badgeType="primary" />
        <MetricCard label="Available for Dispatch" value={availableDrivers} badge={`${Math.round((availableDrivers / (totalDrivers || 1)) * 100)}% Avail`} badgeType="success" />
        <MetricCard label="Assigned / In-Transit" value={assignedDrivers} badge="Active Shift" badgeType="primary" />
        <MetricCard label="Off-Duty / Maintenance" value={totalDrivers - availableDrivers - assignedDrivers} badge="Standby" badgeType="neutral" />
      </div>

      {/* Search + Driver List Table */}
      <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="px-3 py-1.5 bg-surface-container border-b border-outline-variant/20 flex items-center gap-2">
          <span className="material-symbols-outlined text-outline text-sm">search</span>
          <input
            type="text"
            placeholder="Filter by driver ID, name, cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1 text-on-surface font-mono-data-dense outline-none text-xs focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          )}
        </div>

        {filteredDrivers.length === 0 && drivers.length > 0 ? (
          <EmptyState
            title="No Drivers Match Search Query"
            description="Clear the filter or register a new driver to the active sector roster."
            actionLabel="Register Driver"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : drivers.length === 0 ? (
          <EmptyState
            title="No Drivers Registered in Active Sector"
            description="Register a driver to begin dispatch operations."
            actionLabel="Register Driver"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-lowest text-outline font-label-standard text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-2 px-3">Driver Code / Name</th>
                  <th className="py-2 px-3">Vehicle Class</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Capacity</th>
                  <th className="py-2 px-3">Current Coordinates</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3 text-right">Shift Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[11px]">
                {filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-surface-container/60 transition-colors cursor-pointer" onClick={() => navigate(`/drivers/${driver.id}`)}>
                    <td className="py-2 px-3 font-sans">
                      <div className="font-bold text-on-surface group-hover:text-primary">{driver.name}</div>
                      <div className="font-mono text-[10px] text-primary">{driver.driver_code || `#DRV-${driver.id}`}</div>
                    </td>
                    <td className="py-2 px-3 font-sans text-on-surface-variant">
                      {driver.vehicle_type || "Cargo Van"}
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={driver.status} />
                    </td>
                    <td className="py-2 px-3 text-on-surface">
                      <b>{driver.vehicle_capacity} kg</b>
                    </td>
                    <td className="py-2 px-3 text-outline text-[10px]">
                      {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                    </td>
                    <td className="py-2 px-3 font-mono text-outline">
                      {driver.phone || "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <TacticalButton
                        variant={driver.available ? "secondary" : "ghost"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAvailable(driver);
                        }}
                      >
                        {driver.available ? "Mark Off-Duty" : "Set Available"}
                      </TacticalButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateDriverModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onDriverCreated={fetchDrivers} />
    </div>
  );
};
