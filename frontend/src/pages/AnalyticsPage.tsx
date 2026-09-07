import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import type { DashboardMetrics } from "../types";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { LoadingState, ErrorState } from "../components/common/States";

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      analyticsApi.getDashboardMetrics(),
      analyticsApi.getComparison(),
      analyticsApi.getPerformance(),
    ])
      .then(([m, c, p]) => {
        setMetrics(m);
        setComparison(c);
        setPerformance(p);
      })
      .catch((err: any) => setError(err.message || "Analytics aggregation failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState message="COMPUTING REAL-TIME FLEET TELEMETRY ANALYTICS..." />;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      <div className="bg-surface-container-low px-space-1-5 py-space-1 rounded border border-outline-variant/20 flex items-center justify-between">
        <div>
          <h1 className="font-headline-lg text-lg font-bold text-on-surface">Logistics Performance Analytics</h1>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Operational SLA Compliance, Payload Utilization, and Before/After Optimization Benchmarks
          </p>
        </div>
        <span className="font-mono-micro text-[10px] text-outline">LAST AGGREGATED: {metrics?.last_updated || "Live"}</span>
      </div>

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-compact-xs">
        <MetricCard
          label="On-Time Delivery SLA"
          value={`${metrics?.on_time_sla_rate_pct ?? 0}%`}
          badge={`Target ${metrics?.benchmark_sla_pct ?? 96}%`}
          badgeType={(metrics?.on_time_sla_rate_pct ?? 0) >= (metrics?.benchmark_sla_pct ?? 96) ? "success" : "warning"}
        />
        <MetricCard
          label="Fleet Capacity Utilization"
          value={`${metrics?.payload_utilization_pct ?? 0}%`}
          badge="Real-Time"
          badgeType="primary"
          progressBar={{ value: metrics?.payload_utilization_pct ?? 0, color: "#3B82F6" }}
        />
        <MetricCard
          label="Average Route Duration"
          value={`${metrics?.avg_transit_time_minutes ?? 0} min`}
          badge={`${metrics?.routes.total ?? 0} routes`}
          badgeType="neutral"
        />
        <MetricCard
          label="Total Road Distance"
          value={`${metrics?.total_distance_km_today ?? 0} km`}
          badge={metrics?.orders.delayed ? `${metrics.orders.delayed} delayed` : "Clear"}
          badgeType={metrics?.orders.delayed ? "danger" : "success"}
        />
      </div>

      {/* SLA posture strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-compact-xs">
        <MetricCard label="Delivered Orders" value={metrics?.orders.delivered ?? 0} badge="Completed" badgeType="success" />
        <MetricCard label="In-Transit Orders" value={metrics?.orders.in_transit ?? 0} badge="Active" badgeType="primary" />
        <MetricCard label="At-Risk Orders" value={metrics?.orders.at_risk ?? 0} badge={metrics?.orders.at_risk ? "Watch" : "None"} badgeType={metrics?.orders.at_risk ? "warning" : "success"} />
        <MetricCard label="Delayed Orders" value={metrics?.orders.delayed ?? 0} badge={metrics?.orders.delayed ? "Escalate" : "None"} badgeType={metrics?.orders.delayed ? "danger" : "success"} />
      </div>

      <div className="bg-surface-container-low p-space-1-5 rounded-lg border border-outline-variant/20">
        <h3 className="font-headline-sm text-sm font-bold text-on-surface mb-2">
          Optimization Impact Analysis (OR-Tools VRP Benchmark)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-compact-sm">
          <div className="p-3 bg-surface-container rounded border border-outline-variant/20">
            <div className="font-mono-micro text-[10px] text-outline uppercase">Total Distance Reduction</div>
            <div className="font-bold text-xl text-secondary font-mono mt-1">
              {comparison?.distance_reduction_pct != null ? `-${comparison.distance_reduction_pct}%` : "—"}
            </div>
            <p className="text-[11px] text-outline mt-1">
              {comparison?.pre_optimization_distance_km != null && comparison?.post_optimization_distance_km != null
                ? `Pre: ${comparison.pre_optimization_distance_km} km → Post: ${comparison.post_optimization_distance_km} km`
                : "Run the optimizer to benchmark savings."}
            </p>
          </div>

          <div className="p-3 bg-surface-container rounded border border-outline-variant/20">
            <div className="font-mono-micro text-[10px] text-outline uppercase">Transit Duration Saved</div>
            <div className="font-bold text-xl text-primary font-mono mt-1">
              {comparison?.time_reduction_pct != null ? `-${comparison.time_reduction_pct}%` : "—"}
            </div>
            <p className="text-[11px] text-outline mt-1">
              Reduced overall vehicle travel hours and traffic congestion dwell.
            </p>
          </div>

          <div className="p-3 bg-surface-container rounded border border-outline-variant/20">
            <div className="font-mono-micro text-[10px] text-outline uppercase">Estimated Fuel & Cost Savings</div>
            <div className="font-bold text-xl text-secondary font-mono mt-1">
              {comparison?.fuel_cost_savings_estimate_usd != null ? `$${comparison.fuel_cost_savings_estimate_usd}` : "—"}
            </div>
            <p className="text-[11px] text-outline mt-1">
              Calculated on $0.42/km heavy vehicle fuel & wear coefficients.
            </p>
          </div>
        </div>
      </div>

      {/* Route efficiency + driver performance (real attribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm">
        <div className="lg:col-span-4 bg-surface-container-low rounded-lg border border-outline-variant/20 p-space-1-5">
          <h3 className="font-headline-sm text-sm font-bold text-on-surface mb-2 border-b border-outline-variant/20 pb-1">
            Fleet Route Efficiency
          </h3>
          <div className="space-y-2.5 mt-2">
            {[
              { label: "Total Route Distance", value: `${performance?.fleet?.total_distance_km ?? 0} km` },
              { label: "Total Route Duration", value: `${performance?.fleet?.total_duration_minutes ?? 0} min` },
              { label: "Avg Distance / Route", value: `${performance?.fleet?.avg_route_distance_km ?? 0} km` },
              { label: "Avg Duration / Route", value: `${performance?.fleet?.avg_route_duration_minutes ?? 0} min` },
              { label: "Active Routes", value: `${performance?.fleet?.active_route_count ?? 0}` },
              { label: "Registered Drivers", value: `${performance?.fleet?.driver_count ?? 0}` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between bg-surface-container rounded px-2 py-1.5 border border-outline-variant/15">
                <span className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">{row.label}</span>
                <span className="font-mono-data-dense text-[11px] text-on-surface font-semibold">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
          <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">groups</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface">Driver Performance Matrix</span>
            </div>
            <button onClick={() => navigate("/drivers")} className="font-mono-micro text-[10px] text-primary hover:underline">
              VIEW FLEET ROSTER &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest text-outline font-label-standard text-[9px] uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-2 px-3">Driver</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Orders</th>
                  <th className="py-2 px-3 text-right">Delivered</th>
                  <th className="py-2 px-3 text-right">Delayed</th>
                  <th className="py-2 px-3 text-right">On-Time %</th>
                  <th className="py-2 px-3 text-right">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[10px]">
                {(performance?.driver_performance || []).map((d: any) => (
                  <tr key={d.driver_id} className="hover:bg-surface-container/50 transition-colors cursor-pointer" onClick={() => navigate(`/drivers/${d.driver_id}`)}>
                    <td className="py-2 px-3 font-sans">
                      <span className="font-bold text-on-surface">{d.driver_name}</span>
                      <span className="text-outline ml-1">{d.driver_code || `#DRV-${d.driver_id}`}</span>
                    </td>
                    <td className="py-2 px-3"><StatusBadge status={d.status} size="sm" /></td>
                    <td className="py-2 px-3 text-right">{d.total_orders}</td>
                    <td className="py-2 px-3 text-right text-secondary">{d.delivered_count}</td>
                    <td className={`py-2 px-3 text-right ${d.delayed_count ? "text-error" : "text-outline"}`}>{d.delayed_count}</td>
                    <td className={`py-2 px-3 text-right font-bold ${d.on_time_rate_pct == null ? "text-outline" : d.on_time_rate_pct >= 90 ? "text-secondary" : "text-tertiary"}`}>
                      {d.on_time_rate_pct == null ? "—" : `${d.on_time_rate_pct}%`}
                    </td>
                    <td className="py-2 px-3 text-right text-on-surface-variant">{d.total_distance_km} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
