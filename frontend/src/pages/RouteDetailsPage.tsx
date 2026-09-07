import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { optimizationApi } from "../api/optimization";
import { driversApi } from "../api/drivers";
import type { OptimizedRoute, Driver, RouteGeometry, Order, DynamicRouteResult } from "../types";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, ErrorState } from "../components/common/States";
import { FleetMap } from "../components/map/FleetMap";
import { useWebSocket } from "../hooks/useWebSocket";

export const RouteDetailsPage: React.FC = () => {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const id = parseInt(routeId || "0", 10);

  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [geometry, setGeometry] = useState<RouteGeometry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [rerouteMsg, setRerouteMsg] = useState("");
  const [rerouteResult, setRerouteResult] = useState<DynamicRouteResult | null>(null);

  const fetchRoute = async () => {
    if (!id) return;
    try {
      const data = await optimizationApi.getRoute(id);
      setRoute(data);
      setError("");

      if (data.driver_id) {
        const driverList = await driversApi.list();
        setDriver(driverList.find((d) => d.id === data.driver_id) || null);
      }

      if (data.orders && data.orders.length >= 1) {
        const driverStart = data.orders.length > 0 ? [data.orders[0].latitude, data.orders[0].longitude] : null;
        const stops: [number, number][] = data.orders.map((s) => [s.latitude, s.longitude]);
        const all = driverStart ? [driverStart as [number, number], ...stops] : stops;
        if (all.length >= 2) {
          try {
            const g = await optimizationApi.getRouteGeometry(all);
            setGeometry([{ routeId: data.route_id, points: (g.coordinates || []).map((c: any) => [c[1], c[0]]) }]);
          } catch {
            // Fallback straight-line segments
            setGeometry([{ routeId: data.route_id, points: all }]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load route");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useWebSocket((msg) => {
    if ((msg.event === "route_updated" || msg.event === "optimization_completed") && msg.data?.route_id === id) fetchRoute();
  });

  const stats = useMemo(() => {
    if (!route) return null;
    const stops = route.orders || [];
    const uniqueOrderIds = new Set(stops.map((s) => s.order_id));
    const totalStopCount = stops.length;
    const doneStops = stops.filter((s) => s.completed || s.order_status === "delivered").length;
    const atRisk = stops.filter((s) => s.delivery_status === "at_risk").length;
    const delayed = stops.filter((s) => s.delivery_status === "delayed").length;
    return {
      stops,
      ordersCount: uniqueOrderIds.size,
      totalStopCount,
      doneStops,
      atRisk,
      delayed,
      loadKg: route.total_weight || 0,
      capKg: route.vehicle_capacity || 0,
    };
  }, [route]);

  const loadPct = stats && stats.capKg > 0 ? Math.min(100, Math.round((stats.loadKg / stats.capKg) * 100)) : 0;
  const slaPct = route && route.orders && route.orders.length
    ? Math.max(0, Math.round(((route.orders.length - stats!.atRisk - stats!.delayed) / route.orders.length) * 100))
    : 100;

  const pseudoOrders: Order[] = useMemo(() => {
    if (!route || !route.orders) return [];
    const seen = new Set<number>();
    const list: Order[] = [];
    for (const stop of route.orders) {
      if (seen.has(stop.order_id)) continue;
      seen.add(stop.order_id);
      const pickup = route.orders.find((s) => s.order_id === stop.order_id && s.stop_type === "pickup");
      const delivery = route.orders.find((s) => s.order_id === stop.order_id && s.stop_type === "delivery");
      list.push({
        id: stop.order_id,
        order_number: stop.order_number || `#ORD-${stop.order_id}`,
        customer_name: stop.customer_name || undefined,
        weight: stop.weight || 0,
        priority: stop.priority || 1,
        status: (stop.order_status as any) || "planned",
        delivery_status: (stop.delivery_status as any) || "pending",
        delivery_deadline: stop.deadline || null,
        pickup_latitude: pickup?.latitude ?? stop.latitude,
        pickup_longitude: pickup?.longitude ?? stop.longitude,
        delivery_latitude: delivery?.latitude ?? stop.latitude,
        delivery_longitude: delivery?.longitude ?? stop.longitude,
        pickup_address: pickup?.address || undefined,
        delivery_address: delivery?.address || undefined,
      });
    }
    return list;
  }, [route]);

  const handleRecalculate = async () => {
    if (!route?.driver_id) {
      setRerouteMsg("This route has no active driver — recalculation unavailable.");
      setTimeout(() => setRerouteMsg(""), 4000);
      return;
    }
    setRecalculating(true);
    setError("");
    try {
      const res = await optimizationApi.recalculateRoute(route.driver_id);
      setRerouteResult(res);
      const msg = res.route && res.route.stops.length > 0
        ? `Route recalculated from current position: ${res.route.stops.length} stops · ${res.route.total_distance_km} km · ${Math.round(res.route.estimated_duration_minutes)} min remaining`
        : res.message || "Route recalculated";
      setRerouteMsg(msg);
      setTimeout(() => setRerouteMsg(""), 6000);
      fetchRoute();
    } catch (err: any) {
      setError(err.message || "Recalculation failed");
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) return <LoadingState message="LOADING ROUTE MISSION TELEMETRY..." />;
  if (!route) return <ErrorState message={error || "Route not found"} onRetry={fetchRoute} />;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {rerouteMsg && (
        <div className="p-2 rounded bg-secondary/15 border border-secondary/40 text-secondary font-mono-micro flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">alt_route</span>
            <span>{rerouteMsg}</span>
          </div>
          <button onClick={() => setRerouteMsg("")} className="text-secondary/70 hover:text-secondary">
            <span className="material-symbols-outlined text-xs">close</span>
          </button>
        </div>
      )}
      {error && <ErrorState message={error} onRetry={fetchRoute} />}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-mono-data-dense text-on-surface-variant">
        <Link to="/optimization" className="text-outline hover:text-on-surface transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">alt_route</span>
          <span>ROUTE OPTIMIZATION</span>
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-primary font-semibold tracking-wider">{route.route_code || `#RT-${route.route_id}`}</span>
      </div>

      {/* Hero strip */}
      <div className="bg-surface-container rounded-lg p-space-2 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-2 border border-outline-variant/20 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none"></div>
        <div className="flex items-center gap-space-1-5 z-10">
          <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-xl">alt_route</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline-lg text-xl font-bold text-on-surface">{route.route_code || `Route #${route.route_id}`}</h1>
              <StatusBadge status={route.status || "planned"} />
            </div>
            <div className="flex items-center gap-2 mt-1 font-mono-micro text-[10px] text-outline">
              <span>Multi-Stop Optimized Itinerary</span>
              {driver && (
                <Link to={`/drivers/${driver.id}`} className="flex items-center gap-1 text-secondary hover:underline">
                  <span className="material-symbols-outlined text-[11px]">local_shipping</span>
                  {driver.name} ({driver.driver_code || `#DRV-${driver.id}`})
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-compact-xs z-10">
          <TacticalButton variant="primary" size="sm" icon="auto_fix_high" loading={recalculating} onClick={handleRecalculate}>
            Recalculate Route
          </TacticalButton>
          {driver && (
            <TacticalButton variant="secondary" size="sm" icon="my_location" onClick={() => navigate(`/tracking?driver=${driver.id}`)}>
              Track Vehicle
            </TacticalButton>
          )}
          <TacticalButton variant="secondary" size="sm" icon="arrow_back" onClick={() => navigate("/optimization")}>
            All Routes
          </TacticalButton>
        </div>
      </div>

      {/* Dynamic Reroute — before/after comparison panel */}
      {rerouteResult && rerouteResult.changes && rerouteResult.route && rerouteResult.route.stops.length > 0 && (
        <div className="bg-surface-container-low rounded-lg border border-primary/40 overflow-hidden">
          <div className="h-9 px-3 bg-primary/10 border-b border-primary/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">alt_route</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface uppercase tracking-wider">Dynamic Reroute Comparison</span>
            </div>
            <button
              onClick={() => setRerouteResult(null)}
              className="text-outline hover:text-on-surface p-0.5 rounded"
              title="Dismiss comparison"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          </div>
          <div className="p-space-1-5 space-y-2">
            {/* Route-level deltas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-compact-xs">
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase">Distance Δ</div>
                <div className={`font-mono-data-lg text-lg font-bold mt-0.5 ${rerouteResult.changes.distance_delta_km <= 0 ? "text-secondary" : "text-error"}`}>
                  {rerouteResult.changes.distance_delta_km > 0 ? "+" : ""}{rerouteResult.changes.distance_delta_km} km
                </div>
                <div className="text-[10px] text-outline font-mono-data-dense">
                  {rerouteResult.previous_route?.total_distance_km} → {rerouteResult.route.total_distance_km} km
                </div>
              </div>
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase">Duration Δ</div>
                <div className={`font-mono-data-lg text-lg font-bold mt-0.5 ${rerouteResult.changes.duration_delta_minutes <= 0 ? "text-secondary" : "text-error"}`}>
                  {rerouteResult.changes.duration_delta_minutes > 0 ? "+" : ""}{rerouteResult.changes.duration_delta_minutes} min
                </div>
                <div className="text-[10px] text-outline font-mono-data-dense">
                  {rerouteResult.previous_route?.estimated_duration_minutes} → {Math.round(rerouteResult.route.estimated_duration_minutes)} min
                </div>
              </div>
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase">Affected Orders</div>
                <div className="font-mono-data-lg text-lg font-bold text-primary mt-0.5">{rerouteResult.changes.affected_orders_count}</div>
                <div className="text-[10px] text-outline">Resequenced from current position</div>
              </div>
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase">SLA Impact</div>
                <div className="font-mono-data-lg text-lg font-bold mt-0.5">
                  {rerouteResult.changes.delayed_order_ids.length > 0 ? (
                    <span className="text-error">{rerouteResult.changes.delayed_order_ids.length} DELAYED</span>
                  ) : rerouteResult.changes.at_risk_order_ids.length > 0 ? (
                    <span className="text-tertiary">{rerouteResult.changes.at_risk_order_ids.length} AT-RISK</span>
                  ) : (
                    <span className="text-secondary">PROTECTED</span>
                  )}
                </div>
              </div>
            </div>

            {/* ETA changes per affected order */}
            {rerouteResult.changes.eta_changes.length > 0 && (
              <div className="bg-surface-container-lowest rounded border border-outline-variant/20 overflow-hidden">
                <div className="h-8 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center">
                  <span className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">ETA Revisions — Affected Orders</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-outline font-label-standard text-[9px] uppercase tracking-wider border-b border-outline-variant/20">
                        <th className="py-1.5 px-3">Order</th>
                        <th className="py-1.5 px-3">Priority</th>
                        <th className="py-1.5 px-3">Previous ETA</th>
                        <th className="py-1.5 px-3">Revised ETA</th>
                        <th className="py-1.5 px-3">Drift</th>
                        <th className="py-1.5 px-3">SLA Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[10px]">
                      {rerouteResult.changes.eta_changes.map((change) => (
                        <tr key={change.order_id} className="hover:bg-surface-container/50">
                          <td className="py-1.5 px-3">
                            <Link to={`/orders/${change.order_id}`} className="text-primary hover:underline">
                              {change.order_number || `#ORD-${change.order_id}`}
                            </Link>
                          </td>
                          <td className="py-1.5 px-3">P-{change.priority}</td>
                          <td className="py-1.5 px-3 text-outline">
                            {change.previous_eta ? new Date(change.previous_eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-on-surface">
                            {new Date(change.new_eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className={`py-1.5 px-3 font-bold ${change.eta_delta_minutes && change.eta_delta_minutes > 0 ? "text-error" : "text-secondary"}`}>
                            {change.eta_delta_minutes == null
                              ? "new"
                              : change.eta_delta_minutes > 0
                                ? `+${change.eta_delta_minutes} min`
                                : `${change.eta_delta_minutes} min`}
                          </td>
                          <td className="py-1.5 px-3">
                            <StatusBadge status={change.delivery_status} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI telemetry row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-compact-xs">
        <div className="bg-surface-container-low p-compact-sm rounded border border-outline-variant/20">
          <div className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">Total Road Distance</div>
          <div className="font-mono-data-lg text-lg font-bold text-primary mt-0.5">{route.total_distance_km} km</div>
          <div className="text-[10px] text-outline">Optimized fleet leg</div>
        </div>
        <div className="bg-surface-container-low p-compact-sm rounded border border-outline-variant/20">
          <div className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">Estimated Duration</div>
          <div className="font-mono-data-lg text-lg font-bold text-on-surface mt-0.5">{Math.round(route.estimated_duration_minutes)} min</div>
          <div className="text-[10px] text-outline">Incl. 10 min service per stop</div>
        </div>
        <div className="bg-surface-container-low p-compact-sm rounded border border-outline-variant/20">
          <div className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">Stop Sequence</div>
          <div className="font-mono-data-lg text-lg font-bold text-on-surface mt-0.5">
            {stats?.doneStops || 0} <span className="text-outline text-xs">/ {stats?.totalStopCount || 0}</span>
          </div>
          <div className="text-[10px] text-secondary">Pickup → Delivery constrained</div>
        </div>
        <div className="bg-surface-container-low p-compact-sm rounded border border-outline-variant/20">
          <div className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">SLA Assurance</div>
          <div className="font-mono-data-lg text-lg font-bold text-on-surface mt-0.5">{slaPct}%</div>
          <div className="text-[10px]">
            {stats && stats.atRisk > 0 ? <span className="text-tertiary">{stats.atRisk} at risk</span> : <span className="text-secondary">Clear</span>}
            {stats && stats.delayed > 0 ? <span className="text-error"> · {stats.delayed} delayed</span> : null}
          </div>
        </div>
        <div className="bg-surface-container-low p-compact-sm rounded border border-outline-variant/20">
          <div className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">Payload Utilization</div>
          <div className="font-mono-data-lg text-lg font-bold text-secondary mt-0.5">{stats?.loadKg || 0} <span className="text-outline text-xs">/ {stats?.capKg || 0} kg</span></div>
          <div className="w-full h-1.5 bg-surface-container-lowest rounded overflow-hidden mt-1">
            <div className="h-full rounded" style={{ width: `${loadPct}%`, background: loadPct > 90 ? "#F59E0B" : "#10B981" }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm">
        {/* Map */}
        <div className="lg:col-span-7 bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
          <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">explore</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface">Optimized Route GIS Canvas</span>
            </div>
            <span className="font-mono-micro text-[10px] text-outline">OSRM ROAD GEOMETRY · STOP SEQUENCED</span>
          </div>
          <div className="h-[430px]">
            <FleetMap
              drivers={driver ? [driver] : []}
              orders={pseudoOrders}
              routes={geometry}
              center={pseudoOrders[0] ? [pseudoOrders[0].pickup_latitude, pseudoOrders[0].pickup_longitude] : undefined}
              zoom={13}
            />
          </div>
        </div>

        {/* Stop itinerary */}
        <div className="lg:col-span-5 bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden flex flex-col max-h-[500px]">
          <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-secondary">conversion_path</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface">Stop Itinerary</span>
            </div>
            <span className="font-mono-micro text-[10px] text-outline">{stats?.totalStopCount} STOPS</span>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-outline-variant/10">
            {(route.orders || []).map((stop) => (
              <div key={`${stop.order_id}-${stop.stop_sequence}`} className="px-3 py-2 flex items-start gap-2 hover:bg-surface-container/50 transition-colors">
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                  stop.stop_type === "pickup" ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary"
                }`}>
                  {stop.stop_sequence}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono-micro text-[9px] uppercase font-bold text-on-surface-variant">
                        {stop.stop_type === "pickup" ? "PICKUP" : "DELIVERY"}
                      </span>
                      <Link to={`/orders/${stop.order_id}`} className="font-mono-data-dense text-[11px] text-primary hover:underline truncate">
                        {stop.order_number || `#ORD-${stop.order_id}`}
                      </Link>
                    </div>
                    <StatusBadge status={stop.delivery_status || stop.order_status || "pending"} size="sm" />
                  </div>
                  <div className="text-[10px] text-outline truncate mt-0.5">{stop.address || `${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}`}</div>
                  <div className="flex items-center justify-between mt-0.5 font-mono-data-dense text-[10px]">
                    {stop.estimated_arrival ? (
                      <span className="text-on-surface-variant">
                        ETA {new Date(stop.estimated_arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : (
                      <span className="text-outline">ETA pending</span>
                    )}
                    {stop.deadline && (
                      <span className="text-outline">
                        SLA {new Date(stop.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};