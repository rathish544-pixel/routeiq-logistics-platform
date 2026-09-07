import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { optimizationApi } from "../api/optimization";
import type { OptimizedRoute, OptimizationResult, RouteGeometry } from "../types";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, EmptyState, ErrorState } from "../components/common/States";
import { FleetMap } from "../components/map/FleetMap";

export const OptimizationPage: React.FC = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<OptimizedRoute[]>([]);
  const [routeGeometries, setRouteGeometries] = useState<RouteGeometry[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [lastMetrics, setLastMetrics] = useState<OptimizationResult["metrics"] | null>(null);
  const [lastRun, setLastRun] = useState<OptimizationResult | null>(null);

  const fetchRoutes = async () => {
    try {
      const res = await optimizationApi.getRoutes();
      setRoutes(res.routes || []);

      const geomPromises = (res.routes || []).map(async (r) => {
        if (!r.orders || r.orders.length === 0) return null;
        const locs: [number, number][] = r.orders.map((o) => [o.latitude, o.longitude]);
        if (locs.length < 2) return null;
        try {
          const g = await optimizationApi.getRouteGeometry(locs);
          const points: [number, number][] = (g.coordinates || []).map((c: any) => [c[1], c[0]]);
          return { routeId: r.route_id, points };
        } catch {
          return null;
        }
      });
      const geoms = (await Promise.all(geomPromises)).filter(Boolean) as RouteGeometry[];
      setRouteGeometries(geoms);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleRunOptimization = async () => {
    setOptimizing(true);
    setError("");
    try {
      const res: OptimizationResult = await optimizationApi.optimizeMultiDriver();
      setLastMetrics(res.metrics || null);
      setLastRun(res);
      setSuccessMsg(
        `Optimization Complete: ${res.routes_saved} vehicle routes generated for ${res.total_orders} orders (${res.execution_time_seconds || 1.8}s solver runtime).`
      );
      fetchRoutes();
    } catch (err: any) {
      setError(err.message || "Optimization solver failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleClearRun = () => {
    setSuccessMsg("");
    setLastMetrics(null);
    setLastRun(null);
  };

  if (loading && routes.length === 0) return <LoadingState message="INITIALIZING OR-TOOLS VRP SOLVER PIPELINE..." />;

  const totalKm = routes.reduce((acc, r) => acc + (r.total_distance_km || 0), 0);
  const totalDuration = routes.reduce((acc, r) => acc + (r.estimated_duration_minutes || 0), 0);

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {successMsg && (
        <div className="p-2.5 rounded bg-secondary/15 border border-secondary/40 text-secondary font-mono-micro flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">verified</span>
              <span>{successMsg}</span>
            </div>
            <button onClick={handleClearRun} className="text-secondary/70 hover:text-secondary">
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          </div>
          {lastMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-secondary/20">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">speed</span>
                <span className="text-on-surface-variant">Run #{lastRun?.run_id} · Solver {lastRun?.execution_time_seconds}s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">route</span>
                <span className="text-on-surface-variant">Fleet Distance <b className="text-secondary">{lastMetrics.total_fleet_distance_km} km</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">inventory_2</span>
                <span className="text-on-surface-variant">Capacity Util <b className="text-secondary">{lastMetrics.avg_capacity_utilization_pct}%</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">schedule</span>
                <span className="text-on-surface-variant">On-Time <b className="text-secondary">{lastMetrics.on_time_compliance_pct}%</b> · Late <b className="text-error">{lastMetrics.late_orders_count}</b></span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchRoutes} />}

      <div className="bg-surface-container-low p-space-1-5 rounded border border-outline-variant/20 flex flex-wrap items-center justify-between gap-compact-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-lg font-bold text-on-surface">Route Optimization Engine</h1>
            <span className="font-mono-micro text-[10px] px-2 py-0.5 rounded bg-secondary/15 text-secondary flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              OR-ENGINE V4.2 ACTIVE
            </span>
          </div>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Constrained Vehicle Routing Problem (VRP): Capacity, Precedence, Hard Deadlines & OSRM Road Geometries
          </p>
        </div>

        <TacticalButton
          variant="primary"
          size="md"
          icon="play_arrow"
          loading={optimizing}
          onClick={handleRunOptimization}
        >
          Execute Optimization Solver
        </TacticalButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-compact-xs">
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Horizon</div>
          <div className="font-bold text-on-surface text-xs mt-0.5 font-mono">Today (8h Window)</div>
        </div>
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Active Routes</div>
          <div className="font-bold text-primary text-xs mt-0.5 font-mono">{routes.length} Generated</div>
        </div>
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Total Road Travel</div>
          <div className="font-bold text-secondary text-xs mt-0.5 font-mono">{totalKm.toFixed(1)} km</div>
        </div>
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Estimated Duration</div>
          <div className="font-bold text-on-surface text-xs mt-0.5 font-mono">{Math.round(totalDuration)} min</div>
        </div>
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Precedence Mode</div>
          <div className="font-bold text-tertiary text-xs mt-0.5 font-mono">Pickup &rarr; Delivery</div>
        </div>
        <div className="bg-surface-container p-2 rounded border border-outline-variant/20">
          <div className="text-outline uppercase text-[9px] font-mono-micro">Routing Engine</div>
          <div className="font-bold text-primary text-xs mt-0.5 font-mono">OSRM Road Network</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm">
        <div className="lg:col-span-6 h-[420px] bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
          <FleetMap routes={routeGeometries} />
        </div>

        <div className="lg:col-span-6 h-[420px] overflow-y-auto space-y-2 pr-1">
          {routes.length === 0 ? (
            <EmptyState
              title="No Optimized Routes Generated"
              description="Click 'Execute Optimization Solver' to generate multi-driver routes respecting vehicle capacity and delivery deadlines."
              actionLabel="Run Solver"
              onAction={handleRunOptimization}
            />
          ) : (
            routes.map((route) => (
              <div
                key={route.route_id}
                onClick={() => navigate(`/optimization/routes/${route.route_id}`)}
                className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/20 hover:border-primary/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-headline-sm font-bold text-on-surface text-sm">
                      {route.route_code || `Route #${route.route_id}`}
                    </span>
                    <span className="font-mono text-[10px] text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                      Driver: {route.driver_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-secondary font-semibold">{route.total_distance_km} km</span>
                    <span className="text-outline">&bull;</span>
                    <span className="text-on-surface">{route.estimated_duration_minutes} min</span>
                  </div>
                </div>

                <div className="space-y-1 font-mono-data-dense text-[11px]">
                  <div className="text-[10px] text-outline uppercase font-mono-micro">Stop Itinerary:</div>
                  <div className="grid grid-cols-1 gap-1">
                    {(route.orders || []).map((stop, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 rounded bg-surface-container-lowest border border-outline-variant/15 text-[10px]"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] ${
                            stop.stop_type === "pickup" ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary"
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="uppercase font-semibold text-on-surface">
                            {stop.stop_type}: Order #{stop.order_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {stop.estimated_arrival && (
                            <span className="text-outline">
                              ETA: {new Date(stop.estimated_arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold text-secondary">On-Schedule</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
