import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, ErrorState } from "../components/common/States";
import { FleetMap } from "../components/map/FleetMap";
import { CreateOrderModal } from "../components/orders/CreateOrderModal";
import { CreateDriverModal } from "../components/drivers/CreateDriverModal";
import { AssignOrderModal } from "../components/assignments/AssignOrderModal";
import { ordersApi } from "../api/orders";
import { driversApi } from "../api/drivers";
import { optimizationApi } from "../api/optimization";
import { delaysApi } from "../api/delays";
import { analyticsApi } from "../api/analytics";
import { assignmentsApi } from "../api/assignments";
import type { Driver, Order, RouteGeometry, DashboardMetrics, SystemAlert, DynamicRouteResult } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import { useRefreshSignal } from "../hooks/useRefreshSignal";

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [routes, setRoutes] = useState<RouteGeometry[]>([]);
  const [dynamicRoutes, setDynamicRoutes] = useState<RouteGeometry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isCreateDriverOpen, setIsCreateDriverOpen] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [reroutingDriverId, setReroutingDriverId] = useState<number | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [ordersData, driversData, metricsData, alertsData, routesResp] = await Promise.allSettled([
        ordersApi.list(),
        driversApi.list(),
        analyticsApi.getDashboardMetrics(),
        delaysApi.getAlerts(),
        optimizationApi.getRoutes(),
      ]);

      if (ordersData.status === "fulfilled") setOrders(ordersData.value);
      if (driversData.status === "fulfilled") setDrivers(driversData.value);
      if (metricsData.status === "fulfilled") setMetrics(metricsData.value);
      if (alertsData.status === "fulfilled") setAlerts(alertsData.value);

      // Load route geometries if routes exist
      if (routesResp.status === "fulfilled" && routesResp.value.routes) {
        const routeList = routesResp.value.routes;
        const geomPromises = routeList.map(async (r) => {
          if (!r.orders || r.orders.length === 0) return null;
          const locs: [number, number][] = r.orders.map((o) => [o.latitude, o.longitude]);
          if (locs.length < 2) return null;
          try {
            const geom = await optimizationApi.getRouteGeometry(locs);
            const points: [number, number][] = (geom.coordinates || []).map((c: any) => [c[1], c[0]]);
            return { routeId: r.route_id, points };
          } catch {
            return null;
          }
        });
        const geoms = (await Promise.all(geomPromises)).filter(Boolean) as RouteGeometry[];
        setRoutes(geoms);
      }
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load telemetry stream");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when shared data changes (e.g. order created via header quick action)
  useRefreshSignal(fetchData);

  // Debounced refetch so event bursts (many drivers/locations changing at once)
  // collapse into a single API round-trip instead of one per broadcast.
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(fetchData, 600);
  }, [fetchData]);

  // Real-time WebSocket updates
  useWebSocket((msg) => {
    if (msg.event === "driver_location_updated") {
      // High-frequency telemetry: merge the ping into local state instead of
      // refetching the whole dashboard (and all route geometries) every 2s.
      if (msg.data?.driver_id != null) {
        const { driver_id: driverId, latitude, longitude, speed_kmh } = msg.data;
        setDrivers((prev) =>
          prev.map((d) =>
            d.id === driverId && typeof latitude === "number" && typeof longitude === "number"
              ? {
                  ...d,
                  latitude,
                  longitude,
                  ...(speed_kmh != null ? { speed_kmh } : {}),
                }
              : d
          )
        );
      }
      return;
    }
    if (
      msg.event === "driver_status_changed" ||
      msg.event === "order_status_changed" ||
      msg.event === "route_updated" ||
      msg.event === "order_delay_detected" ||
      msg.event === "optimization_completed" ||
      msg.event === "alert_created"
    ) {
      debouncedFetch();
    }
  });

  const handleRecalculateRoute = async (driverId: number) => {
    setReroutingDriverId(driverId);
    try {
      const res: DynamicRouteResult = await optimizationApi.recalculateRoute(driverId);
      if (res && res.route && res.route.stops.length > 0) {
        const stops = res.route.stops;
        const coords: [number, number][] = [
          ...(res.current_location ? [[res.current_location.latitude, res.current_location.longitude] as [number, number]] : []),
          ...stops.map((s) => [s.latitude, s.longitude] as [number, number]),
        ];
        if (coords.length >= 2) {
          const geom = await optimizationApi.getRouteGeometry(coords);
          const points: [number, number][] = (geom.coordinates || []).map((c: any) => [c[1], c[0]]);
          setDynamicRoutes((prev) => [
            ...prev.filter((r) => r.routeId !== driverId),
            { routeId: driverId, points },
          ]);
        }
      }
      setActionSuccess(`Dynamic route recalculation executed for driver #${driverId}`);
      setTimeout(() => setActionSuccess(""), 4000);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to recalculate route");
    } finally {
      setReroutingDriverId(null);
    }
  };

  const handleExecuteOptimization = async () => {
    setOptimizing(true);
    setError("");
    try {
      const res = await optimizationApi.optimizeMultiDriver();
      setActionSuccess(`Optimization complete: ${res.routes_saved} routes generated across ${res.total_drivers} drivers`);
      setTimeout(() => setActionSuccess(""), 4000);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Solver optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleAutoAssign = async () => {
    try {
      const res = await assignmentsApi.autoAssignAll();
      setActionSuccess(`Auto-assigned ${res.total_assigned} orders to optimal fleet drivers`);
      setTimeout(() => setActionSuccess(""), 4000);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Auto-assignment failed");
    }
  };

  const handleAckAlert = async (id: number) => {
    try {
      await delaysApi.acknowledgeAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      console.error("Ack error:", err);
    }
  };

  if (loading && !metrics) return <LoadingState message="LOADING FLEET CONTROL CENTER..." />;

  // Aggregate fallbacks if backend analytics metric endpoint is computing
  const totalOrders = metrics?.orders.total ?? orders.length;
  const pendingOrders = metrics?.orders.pending ?? orders.filter((o) => o.status === "pending").length;
  const assignedOrders = metrics?.orders.assigned ?? orders.filter((o) => o.status === "assigned").length;
  const inTransitOrders = metrics?.orders.in_transit ?? orders.filter((o) => o.status === "out_for_delivery").length;
  const deliveredOrders = metrics?.orders.delivered ?? orders.filter((o) => o.status === "delivered").length;
  const delayedOrders = metrics?.orders.delayed ?? orders.filter((o) => o.delivery_status === "delayed").length;

  const totalDrivers = metrics?.drivers.total ?? drivers.length;
  const activeDrivers = metrics?.drivers.assigned ?? drivers.filter((d) => d.status !== "offline" && d.status !== "idle").length;
  const idleDrivers = metrics?.drivers.idle ?? drivers.filter((d) => d.available && d.status === "idle").length;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {/* Banner / Flash notification */}
      {actionSuccess && (
        <div className="p-2 rounded bg-secondary/15 border border-secondary/40 text-secondary font-mono-micro flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess("")} className="text-secondary/70 hover:text-secondary">
            <span className="material-symbols-outlined text-xs">close</span>
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Top Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-compact-sm bg-surface-container-low px-space-1-5 py-compact-xs rounded border border-outline-variant/20">
        <div className="flex items-center gap-compact-xs">
          <span className="font-headline-sm text-sm font-bold text-on-surface">Operations Mission Control</span>
          <span className="font-mono-micro text-[10px] text-outline px-1.5 py-0.5 rounded bg-surface-container">
            AUTONOMOUS DISPATCH
          </span>
        </div>

        <div className="flex items-center gap-compact-xs">
          <TacticalButton
            variant="secondary"
            size="sm"
            icon="auto_fix_high"
            onClick={handleAutoAssign}
            title="Automatically assign all pending orders to nearest available drivers"
          >
            Auto-Assign Backlog
          </TacticalButton>

          <TacticalButton
            variant="secondary"
            size="sm"
            icon="local_shipping"
            onClick={() => setIsCreateDriverOpen(true)}
          >
            Add Driver
          </TacticalButton>

          <TacticalButton
            variant="secondary"
            size="sm"
            icon="add_box"
            onClick={() => setIsCreateOrderOpen(true)}
          >
            Ingest Order
          </TacticalButton>

          <TacticalButton
            variant="primary"
            size="sm"
            icon="refresh"
            loading={optimizing}
            onClick={handleExecuteOptimization}
          >
            Run Route Optimization
          </TacticalButton>
        </div>
      </div>

      {/* 1. TOP KPI TELEMETRY ROW (6 HIGH-DENSITY CARDS) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-compact-xs">
        <MetricCard
          label="Total Orders"
          value={totalOrders}
          badge={`${Math.round(((totalOrders - pendingOrders) / (totalOrders || 1)) * 100)}% Active`}
          badgeType="success"
          sparklineColor="#3B82F6"
          breakdown={[
            { label: "Trans", value: inTransitOrders, color: "text-on-surface" },
            { label: "Del", value: deliveredOrders, color: "text-secondary" },
            { label: "Asg", value: assignedOrders, color: "text-primary" },
            { label: "Pnd", value: pendingOrders, color: "text-tertiary" },
          ]}
          onClick={() => navigate("/orders")}
        />

        <MetricCard
          label="Active Drivers"
          value={activeDrivers}
          sublabel={`/ ${totalDrivers} total`}
          badge={`${Math.round((activeDrivers / (totalDrivers || 1)) * 100)}% Util`}
          badgeType="primary"
          sparklineColor="#10B981"
          breakdown={[
            { label: "Active", value: activeDrivers, color: "text-secondary" },
            { label: "Idle", value: idleDrivers, color: "text-primary" },
            { label: "Offline", value: totalDrivers - activeDrivers - idleDrivers, color: "text-outline" },
          ]}
          onClick={() => navigate("/drivers")}
        />

        <MetricCard
          label="Active Routes"
          value={metrics?.routes.total || routes.length || 0}
          badge={`${metrics?.routes.delayed || 0} Critical`}
          badgeType={metrics?.routes.delayed ? "danger" : "neutral"}
          sparklineColor="#EF4444"
          breakdown={[
            { label: "On-Sched", value: metrics?.routes.on_schedule || 0, color: "text-secondary" },
            { label: "At-Risk", value: metrics?.routes.at_risk || 0, color: "text-tertiary" },
            { label: "Delay", value: metrics?.routes.delayed || 0, color: "text-error" },
          ]}
          onClick={() => navigate("/optimization")}
        />

        <MetricCard
          label="On-Time SLA Rate"
          value={metrics?.on_time_sla_rate_pct != null ? `${Math.round(metrics.on_time_sla_rate_pct)}%` : "—"}
          badge={
            metrics?.on_time_sla_rate_pct != null && metrics?.benchmark_sla_pct != null
              ? `${(metrics.on_time_sla_rate_pct - metrics.benchmark_sla_pct).toFixed(1)}% vs Target`
              : ""
          }
          badgeType={metrics?.on_time_sla_rate_pct != null && metrics.on_time_sla_rate_pct < (metrics?.benchmark_sla_pct ?? 100) ? "danger" : "success"}
          sparklineColor="#10B981"
          progressBar={{ value: metrics?.on_time_sla_rate_pct ?? 0, color: "#10B981" }}
          onClick={() => navigate("/analytics")}
        />

        <MetricCard
          label="Delayed Orders"
          value={delayedOrders}
          sublabel={`/ ${totalOrders}`}
          badge={delayedOrders > 0 ? "Attention" : "Clear"}
          badgeType={delayedOrders > 0 ? "danger" : "success"}
          sparklineColor="#EF4444"
          breakdown={[
            { label: "Critical", value: delayedOrders, color: "text-error" },
            { label: "At-Risk", value: metrics?.orders.at_risk || 0, color: "text-tertiary" },
          ]}
          onClick={() => navigate("/delays")}
        />

        <MetricCard
          label="Payload Utilization"
          value={metrics?.payload_utilization_pct != null ? `${Math.round(metrics.payload_utilization_pct)}%` : "—"}
          badge="Live"
          badgeType="primary"
          sparklineColor="#3B82F6"
          progressBar={{ value: metrics?.payload_utilization_pct ?? 0, color: "#3B82F6" }}
          onClick={() => navigate("/analytics")}
        />
      </div>

      {/* 2. MAIN WORKSPACE: MAP CANVAS (LEFT/CENTER) + ESCALATION QUEUE (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm h-[480px]">
        {/* Map Container (8 cols) */}
        <div className="lg:col-span-8 h-full flex flex-col bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
          <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">map</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface">Real-Time Fleet GIS Canvas</span>
              <span className="font-mono-micro text-[10px] text-secondary">
                {drivers.length} VEHICLES ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono-micro text-[10px]">
              <span className="text-outline">LAYER: CARTO DARK MATTER</span>
            </div>
          </div>
          <div className="flex-1 w-full h-full relative">
            <FleetMap
              drivers={drivers}
              orders={orders}
              routes={routes}
              dynamicRoutes={dynamicRoutes}
              onRecalculateRoute={handleRecalculateRoute}
            />
          </div>
        </div>

        {/* Escalation Queue & Live Alerts (4 cols) */}
        <div className="lg:col-span-4 h-full flex flex-col bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
          <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-tertiary">warning</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface">Escalation Queue</span>
              {alerts.length > 0 && (
                <span className="font-mono-micro text-[10px] px-1.5 py-0.2 rounded bg-error/20 text-error font-bold">
                  {alerts.length}
                </span>
              )}
            </div>
            <button
              onClick={() => delaysApi.triggerScan().then(() => fetchData())}
              className="text-outline hover:text-primary text-[10px] font-mono-micro flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-xs">radar</span>
              <span>SCAN SLA</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {alerts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-outline">
                <span className="material-symbols-outlined text-3xl text-secondary mb-1">verified</span>
                <span className="font-bold text-on-surface">No Escalations Active</span>
                <span className="text-[11px] mt-0.5">All driver routes are operating within designated SLA parameters.</span>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded border text-[11px] font-sans transition-all ${
                    alert.severity === "critical"
                      ? "bg-error/10 border-error/30 text-on-surface"
                      : "bg-tertiary/10 border-tertiary/30 text-on-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-mono-micro text-[10px] uppercase font-bold tracking-wider text-error">
                      {alert.title}
                    </span>
                    <button
                      onClick={() => handleAckAlert(alert.id)}
                      className="text-outline hover:text-on-surface p-0.5 rounded"
                      title="Acknowledge Alert"
                    >
                      <span className="material-symbols-outlined text-xs">done</span>
                    </button>
                  </div>
                  <p className="text-on-surface-variant font-body-dense text-[11px] leading-tight mb-2">
                    {alert.message}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 font-mono-micro text-[10px]">
                    <span className="text-outline">
                      {alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : "Just now"}
                    </span>
                    {alert.driver_id && (
                      <button
                        onClick={() => handleRecalculateRoute(alert.driver_id!)}
                        disabled={reroutingDriverId === alert.driver_id}
                        className="text-primary hover:underline font-semibold flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-xs">alt_route</span>
                        <span>Auto-Reroute</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. ACTIVE VEHICLE TELEMETRY TABLE (BOTTOM ROW) */}
      <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-secondary">speed</span>
            <span className="font-headline-sm text-xs font-bold text-on-surface">Active Fleet Vehicle Telemetry</span>
            <span className="font-mono-micro text-[10px] text-outline">({drivers.length} Units Online)</span>
          </div>
          <button
            onClick={() => navigate("/drivers")}
            className="font-mono-micro text-[10px] text-primary hover:underline"
          >
            VIEW FULL FLEET ROSTER &rarr;
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-lowest text-outline font-label-standard text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                <th className="py-2 px-3">Vehicle / Driver</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Capacity / Load</th>
                <th className="py-2 px-3">GPS Telemetry</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[11px]">
              {drivers.slice(0, 6).map((driver) => {
                const isRerouting = reroutingDriverId === driver.id;
                return (
                  <tr key={driver.id} className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2 px-3 font-sans">
                      <div className="font-bold text-on-surface">{driver.name}</div>
                      <div className="font-mono text-[10px] text-outline">{driver.driver_code || `#DRV-${driver.id}`} &bull; {driver.vehicle_type || "Van"}</div>
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={driver.status} />
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-surface-container-lowest h-1.5 rounded overflow-hidden">
                          <div
                            className="h-full bg-primary rounded"
                            style={{ width: `${Math.min(100, Math.round((35 / (driver.vehicle_capacity || 100)) * 100))}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-outline">
                          max {driver.vehicle_capacity}kg
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-on-surface-variant text-[10px]">
                      {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-right space-x-1.5 font-sans">
                      <TacticalButton
                        variant="secondary"
                        size="sm"
                        loading={isRerouting}
                        icon="alt_route"
                        onClick={() => handleRecalculateRoute(driver.id)}
                      >
                        Recalculate
                      </TacticalButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateOrderModal
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
        onOrderCreated={fetchData}
      />

      <CreateDriverModal
        isOpen={isCreateDriverOpen}
        onClose={() => setIsCreateDriverOpen(false)}
        onDriverCreated={fetchData}
      />

      <AssignOrderModal
        isOpen={!!assigningOrder}
        onClose={() => setAssigningOrder(null)}
        order={assigningOrder}
        drivers={drivers}
        onAssigned={fetchData}
      />
    </div>
  );
};
