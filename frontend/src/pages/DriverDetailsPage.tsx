import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { driversApi, type DriverMission } from "../api/drivers";
import { ordersApi } from "../api/orders";
import type { Order, RouteGeometry } from "../types";
import { optimizationApi } from "../api/optimization";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { MetricCard } from "../components/common/MetricCard";
import { LoadingState, ErrorState } from "../components/common/States";
import { FleetMap } from "../components/map/FleetMap";
import { useWebSocket } from "../hooks/useWebSocket";

export const DriverDetailsPage: React.FC = () => {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const id = parseInt(driverId || "0", 10);

  const [mission, setMission] = useState<DriverMission | null>(null);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [confirmToggle, setConfirmToggle] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    try {
      const [missionData, allOrders] = await Promise.all([driversApi.getMission(id), ordersApi.list()]);
      setMission(missionData);
      // Historical deliveries for this driver (delivered orders previously assigned)
      setOrderHistory(allOrders.filter((o) => o.assigned_driver_id === id && (o.status === "delivered" || o.status === "cancelled")));
      setError("");

      const route = missionData.current_route;
      if (route && route.orders.length >= 1) {
        const locs: [number, number][] = route.orders.flatMap((s) =>
          s.stop_type === "delivery"
            ? [[s.delivery_latitude, s.delivery_longitude] as [number, number]]
            : [[s.pickup_latitude, s.pickup_longitude] as [number, number]]
        );
        const all = [[missionData.driver.latitude, missionData.driver.longitude] as [number, number], ...locs];
        if (all.length >= 2) {
          try {
            const geom = await optimizationApi.getRouteGeometry(all);
            setRouteGeometry([{ routeId: route.route_id, points: (geom.coordinates || []).map((c: any) => [c[1], c[0]]) }]);
          } catch {
            setRouteGeometry([]);
          }
        }
      } else {
        setRouteGeometry([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load driver telemetry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live updates while this screen is open
  useWebSocket((msg) => {
    if (msg.event === "driver_location_updated" && msg.data?.driver_id === id) {
      setMission((prev) =>
        prev ? { ...prev, driver: { ...prev.driver, latitude: msg.data.latitude, longitude: msg.data.longitude } } : prev
      );
    }
    if (msg.event === "driver_status_changed" && msg.data?.driver_id === id) fetchData();
  });

  const driver = mission?.driver || null;

  const stats = useMemo(() => {
    if (!mission) return null;
    const route = mission.current_route;
    const orders = route?.orders || [];
    const totalStops = orders.length;
    const done = orders.filter((o) => o.delivery_status === "delivered").length;
    const remaining = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
    const onboard = remaining
      .filter((o) => ["picked_up", "out_for_delivery"].includes(o.status))
      .reduce((acc, o) => acc + o.weight, 0);
    const delivered = orderHistory.filter((o) => o.status === "delivered").length;
    const atRisk = orders.filter((o) => o.delivery_status === "at_risk").length;
    const delayed = orders.filter((o) => o.delivery_status === "delayed").length;
    return { orders, totalStops, done, delivered, onboard, atRisk, delayed, route };
  }, [mission, orderHistory]);

  const loadPct = driver && stats && driver.vehicle_capacity > 0
    ? Math.min(100, Math.round(((stats.onboard || 0) / driver.vehicle_capacity) * 100))
    : 0;

  const handleToggleStatus = async () => {
    if (!driver) return;
    setBusy(true);
    try {
      const nextAvail = !driver.available;
      const nextStatus = nextAvail ? "idle" : "offline";
      await driversApi.toggleStatus(driver.id, nextStatus, nextAvail);
      setActionMsg(nextAvail ? `${driver.name} is now available for dispatch` : `${driver.name} marked off-duty`);
      setTimeout(() => setActionMsg(""), 4000);
      setConfirmToggle(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update driver status");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState message="LOADING DRIVER MISSION TELEMETRY..." />;
  if (!driver) return <ErrorState message={error || "Driver not found"} onRetry={fetchData} />;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {actionMsg && (
        <div className="p-2 rounded bg-secondary/15 border border-secondary/40 text-secondary font-mono-micro flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>{actionMsg}</span>
          </div>
          <button onClick={() => setActionMsg("")} className="text-secondary/70 hover:text-secondary">
            <span className="material-symbols-outlined text-xs">close</span>
          </button>
        </div>
      )}
      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-mono-data-dense text-on-surface-variant">
        <Link to="/drivers" className="text-outline hover:text-on-surface transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">local_shipping</span>
          <span>DRIVERS</span>
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-primary font-semibold tracking-wider">{driver.driver_code || `#DRV-${driver.id}`}</span>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface uppercase tracking-wider">{driver.name}</span>
      </div>

      {/* Header hero */}
      <div className="bg-surface-container rounded-lg p-space-2 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-2 border border-outline-variant/20 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none"></div>
        <div className="flex items-center gap-space-1-5 z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-surface-container-highest to-surface-container flex items-center justify-center border border-outline-variant/40">
            <span className="material-symbols-outlined text-2xl text-primary">person</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline-lg text-xl font-bold text-on-surface">{driver.name}</h1>
              <StatusBadge status={driver.status} />
              <span className={`font-mono-micro text-[10px] px-1.5 py-0.5 rounded font-bold ${driver.available ? "bg-secondary/15 text-secondary" : "bg-outline/10 text-outline"}`}>
                {driver.available ? "AVAILABLE" : "OFF-DUTY"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 font-mono-micro text-[10px] text-outline">
              <span className="text-primary">{driver.driver_code}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[11px]">directions_car</span>{driver.vehicle_type || "Cargo Van"}</span>
              <span>·</span>
              <span>Max {driver.vehicle_capacity} kg</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-compact-xs z-10">
          <TacticalButton variant="secondary" size="sm" icon="my_location" onClick={() => navigate(`/tracking?driver=${driver.id}`)}>
            Track Live
          </TacticalButton>
          {driver.status === "in_transit" || driver.status === "delivering" ? (
            <TacticalButton variant="secondary" size="sm" icon="alt_route" onClick={() => navigate("/optimization")}>
              View Route Plan
            </TacticalButton>
          ) : null}
          {!confirmToggle ? (
            <TacticalButton
              variant={driver.available ? "danger" : "primary"}
              size="sm"
              icon={driver.available ? "power_settings_new" : "play_arrow"}
              onClick={() => setConfirmToggle(true)}
            >
              {driver.available ? "Mark Off-Duty" : "Set Available"}
            </TacticalButton>
          ) : (
            <div className="flex items-center gap-1 bg-tertiary/10 border border-tertiary/40 rounded px-2 py-1">
              <span className="text-tertiary text-[11px] font-semibold">Confirm shift change?</span>
              <TacticalButton variant="primary" size="sm" onClick={handleToggleStatus} loading={busy}>Yes</TacticalButton>
              <TacticalButton variant="secondary" size="sm" onClick={() => setConfirmToggle(false)}>No</TacticalButton>
            </div>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-compact-xs">
        <MetricCard
          label="Shift On-Duty Since"
          value={driver.created_at ? new Date(driver.created_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
          sublabel={driver.updated_at ? `Last update ${new Date(driver.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          badge={driver.available ? "Active" : "Standby"}
          badgeType={driver.available ? "success" : "neutral"}
        />
        <MetricCard
          label="Current Payload Load"
          value={`${stats?.onboard ?? 0} kg`}
          sublabel={`/ ${driver.vehicle_capacity} kg capacity`}
          badge={`${loadPct}% Util`}
          badgeType={loadPct > 90 ? "warning" : "primary"}
          progressBar={{ value: loadPct, color: loadPct > 90 ? "#F59E0B" : "#3B82F6" }}
        />
        <MetricCard
          label="Historical Deliveries"
          value={stats?.delivered ?? 0}
          badge="Lifetime"
          badgeType="success"
        />
        <MetricCard
          label="Stops Remaining Today"
          value={stats?.totalStops ?? 0}
          sublabel={`${stats?.done ?? 0} completed`}
          badge={stats?.delayed ? `${stats.delayed} Delayed` : stats?.atRisk ? `${stats.atRisk} At-Risk` : "On Track"}
          badgeType={stats?.delayed ? "danger" : stats?.atRisk ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm">
        {/* Map + mission */}
        <div className="lg:col-span-7 flex flex-col gap-compact-sm">
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
            <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">radar</span>
                <span className="font-headline-sm text-xs font-bold text-on-surface">Live Unit Position & Route Span</span>
              </div>
              <span className="font-mono-micro text-[10px] text-outline">
                {driver.latitude.toFixed(5)}, {driver.longitude.toFixed(5)}
              </span>
            </div>
            <div className="h-[320px]">
              <FleetMap
                drivers={[driver]}
                orders={orderHistory.slice(0, 0)}
                routes={routeGeometry}
                center={[driver.latitude, driver.longitude]}
                zoom={13}
              />
            </div>
          </div>

          {/* Active route itinerary */}
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
            <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-secondary">conversion_path</span>
                <span className="font-headline-sm text-xs font-bold text-on-surface">Active Route Itinerary</span>
                {stats?.route && (
                  <span className="font-mono-micro text-[10px] text-outline">
                    #{stats.route.route_id} · {stats.route.total_distance_km} km · {stats.route.estimated_duration_minutes} min
                  </span>
                )}
              </div>
            </div>
            {stats && stats.route && stats.orders.length > 0 ? (
              <div className="divide-y divide-outline-variant/10">
                {stats.orders.map((stop) => (
                  <div key={`${stop.order_id}-${stop.stop_type}`} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-surface-container/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 ${
                        stop.stop_type === "pickup" ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary"
                      }`}>
                        {stop.stop_sequence}
                      </span>
                      <div className="min-w-0">
                        <Link to={`/orders/${stop.order_id}`} className="font-mono-data-dense text-[11px] text-primary hover:underline">
                          {stop.order_number || `#ORD-${stop.order_id}`}
                        </Link>
                        <span className={`ml-2 text-[9px] font-mono-micro uppercase font-bold ${stop.stop_type === "pickup" ? "text-secondary" : "text-primary"}`}>
                          {stop.stop_type === "pickup" ? "Pickup" : "Delivery"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-outline hidden md:inline truncate max-w-[180px]">
                        {stop.stop_type === "delivery" ? stop.delivery_address : stop.pickup_address}
                      </span>
                      {stop.estimated_arrival && (
                        <span className="font-mono-data-dense text-[10px] text-on-surface-variant">
                          ETA {new Date(stop.estimated_arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <StatusBadge status={stop.delivery_status === "pending" ? (stop.status === "delivered" ? "delivered" : "pending") : stop.delivery_status} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-outline">
                <span className="material-symbols-outlined text-3xl text-outline mb-1 block">route</span>
                <span className="font-bold text-on-surface">No Active Route</span>
                <p className="text-[11px] mt-0.5">This driver has no planned or active route itinerary right now.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right telemetry column */}
        <div className="lg:col-span-5 flex flex-col gap-compact-sm">
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 p-space-1-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-primary text-lg">settings_input_antenna</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface uppercase tracking-wider">Unit Telemetry</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Contact</div>
                <div className="font-mono-data-dense text-[11px] text-on-surface mt-0.5">{driver.phone || "Not registered"}</div>
              </div>
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Vehicle Class</div>
                <div className="font-mono-data-dense text-[11px] text-on-surface mt-0.5">{driver.vehicle_type || "Cargo Van"}</div>
              </div>
            </div>

            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">GPS Coordinate Telemetry</div>
              <div className="font-mono-data-base text-sm text-primary font-semibold mt-0.5">
                {driver.latitude.toFixed(6)}, {driver.longitude.toFixed(6)}
              </div>
            </div>

            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider mb-1">Capacity Load Gauge</div>
              <div className="h-2 bg-surface-container-lowest rounded overflow-hidden">
                <div className="h-full rounded transition-all duration-500" style={{ width: `${loadPct}%`, background: loadPct > 90 ? "#F59E0B" : "#3B82F6" }}></div>
              </div>
              <div className="flex justify-between mt-1 font-mono-micro text-[9px] text-outline">
                <span>{stats?.onboard ?? 0} kg onboard</span>
                <span>{driver.vehicle_capacity} kg max</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">At-Risk Stops</div>
                <div className={`font-mono-data-lg text-lg font-bold mt-0.5 ${stats?.atRisk ? "text-tertiary" : "text-on-surface"}`}>{stats?.atRisk ?? 0}</div>
              </div>
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Delayed Stops</div>
                <div className={`font-mono-data-lg text-lg font-bold mt-0.5 ${stats?.delayed ? "text-error" : "text-on-surface"}`}>{stats?.delayed ?? 0}</div>
              </div>
            </div>

            <div className="pt-1">
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Registered</div>
              <div className="font-mono-data-dense text-[11px] text-outline mt-0.5">
                {driver.created_at ? new Date(driver.created_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate("/drivers")}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors font-body-medium text-xs"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Return to Fleet Roster
          </button>
        </div>
      </div>
    </div>
  );
};