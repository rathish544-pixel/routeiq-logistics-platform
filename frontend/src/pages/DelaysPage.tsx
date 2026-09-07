import React, { useEffect, useState } from "react";
import { delaysApi } from "../api/delays";
import type { DelaySummary } from "../api/delays";
import type { SystemAlert } from "../types";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, EmptyState, ErrorState } from "../components/common/States";

export const DelaysPage: React.FC = () => {
  const [summary, setSummary] = useState<DelaySummary | null>(null);
  const [_alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const fetchDelays = async () => {
    try {
      const [sum, alt] = await Promise.all([
        delaysApi.getSummary(),
        delaysApi.getAlerts(),
      ]);
      setSummary(sum);
      setAlerts(alt);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to fetch SLA monitor data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDelays();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError("");
    try {
      const sum = await delaysApi.triggerScan();
      setSummary(sum);
      const alt = await delaysApi.getAlerts();
      setAlerts(alt);
    } catch (err: any) {
      setError(err.message || "SLA scan failed");
    } finally {
      setScanning(false);
    }
  };

  

  if (loading) return <LoadingState message="SCANNING FLEET SLA DELAY HORIZONS..." />;

  const delayedCount = summary?.delayed_count ?? 0;
  const atRiskCount = summary?.at_risk_count ?? 0;
  const onTimeCount = summary?.on_time_count ?? 0;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {error && <ErrorState message={error} onRetry={fetchDelays} />}

      <div className="flex flex-wrap items-center justify-between gap-compact-sm bg-surface-container-low px-space-1-5 py-space-1 rounded border border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-lg font-bold text-on-surface">Delays & At-Risk Orders</h1>
            <span className="font-mono-micro text-[10px] px-2 py-0.5 rounded bg-error/20 text-error font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
              SLA MONITOR ACTIVE
            </span>
          </div>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Deadline Monitoring, Priority-Aware Thresholds & Auto-Escalations
          </p>
        </div>

        <TacticalButton variant="primary" size="sm" icon="radar" loading={scanning} onClick={handleScan}>
          Trigger Full Fleet SLA Scan
        </TacticalButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-compact-xs">
        <MetricCard label="Critical SLA Breaches (Delayed)" value={delayedCount} badge={delayedCount > 0 ? "Breached" : "Clear"} badgeType={delayedCount > 0 ? "danger" : "success"} />
        <MetricCard label="Approaching Deadline (At-Risk)" value={atRiskCount} badge={atRiskCount > 0 ? "Warning" : "Normal"} badgeType={atRiskCount > 0 ? "warning" : "success"} />
        <MetricCard label="Strictly On-Schedule" value={onTimeCount} badge="Optimal" badgeType="success" />
      </div>

      <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
          <span className="font-headline-sm text-xs font-bold text-on-surface">SLA Monitored Deliveries</span>
          <span className="font-mono-micro text-[10px] text-outline">Priority-Weighted Tolerance</span>
        </div>

        {summary?.orders.length === 0 ? (
          <EmptyState title="Zero Delivery Delays" description="All orders are tracking comfortably within their respective delivery deadlines." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-lowest text-outline font-label-standard text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-2 px-3">Order Number</th>
                  <th className="py-2 px-3">Priority</th>
                  <th className="py-2 px-3">SLA Status</th>
                  <th className="py-2 px-3">Deadline</th>
                  <th className="py-2 px-3">Estimated Arrival</th>
                  <th className="py-2 px-3">Variance / Delay</th>
                  <th className="py-2 px-3">Advisory Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[11px]">
                {summary?.orders.map((o) => (
                  <tr key={o.order_id} className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2 px-3 font-bold text-primary">{o.order_number || `#ORD-${o.order_id}`}</td>
                    <td className="py-2 px-3">
                      <span className="bg-surface-container-high px-1.5 py-0.5 rounded font-mono-micro text-[10px] text-outline">
                        P-{o.priority}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={o.delay_status} />
                    </td>
                    <td className="py-2 px-3 text-on-surface-variant font-mono text-[10px]">
                      {o.deadline ? new Date(o.deadline).toLocaleTimeString() : "No Deadline"}
                    </td>
                    <td className="py-2 px-3 text-on-surface font-mono text-[10px]">
                      {o.estimated_arrival ? new Date(o.estimated_arrival).toLocaleTimeString() : "Pending"}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      {o.delay_minutes > 0 ? (
                        <span className="text-error">+{o.delay_minutes} min late</span>
                      ) : (
                        <span className="text-secondary">On-Time</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans text-[11px] text-outline">{o.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
