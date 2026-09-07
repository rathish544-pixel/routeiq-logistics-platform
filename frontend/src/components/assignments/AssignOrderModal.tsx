import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { TacticalButton } from "../common/TacticalButton";
import type { Order, Driver, AssignmentResult } from "../../types";
import { assignmentsApi } from "../../api/assignments";

interface AssignOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  drivers: Driver[];
  onAssigned: () => void;
}

export const AssignOrderModal: React.FC<AssignOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  drivers,
  onAssigned,
}) => {
  const [selectedDriverId, setSelectedDriverId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [error, setError] = useState("");

  if (!order) return null;

  const eligibleDrivers = drivers.filter(
    (d) => d.available && d.vehicle_capacity >= order.weight
  );

  const handleAssign = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await assignmentsApi.assignOrder(order.id, selectedDriverId);
      setResult(res);
      onAssigned();
    } catch (err: any) {
      setError(err.message || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`INTELLIGENT DRIVER ASSIGNMENT — ${order.order_number || `#ORD-${order.id}`}`}
      subtitle={`Weight: ${order.weight} kg | Priority: ${order.priority}`}
    >
      <div className="space-y-3 font-sans text-xs">
        {error && (
          <div className="p-2 rounded bg-error/15 border border-error/40 text-error text-[11px]">
            {error}
          </div>
        )}

        {result ? (
          <div className="p-3 rounded bg-secondary/15 border border-secondary/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-secondary text-sm">ORDER ASSIGNED SUCCESSFULLY</span>
              <span className="material-symbols-outlined text-secondary">check_circle</span>
            </div>
            <p className="text-on-surface font-body-default">
              Assigned to <b>{result.driver_name}</b> ({result.driver_code || `#DRV-${result.driver_id}`})
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono-data-dense pt-1 border-t border-secondary/20">
              <div>Distance to Pickup: <b className="text-white">{result.distance_to_pickup_km} km</b></div>
              <div>Est Travel Time: <b className="text-white">{result.estimated_travel_time_minutes} min</b></div>
              <div>Vehicle Load: <b className="text-white">{result.capacity_utilization_pct}%</b></div>
              <div>Match Score: <b className="text-secondary">{result.score} pts</b></div>
            </div>
            <p className="text-xs text-on-surface-variant italic pt-1">{result.reasoning}</p>
            <div className="pt-2 flex justify-end">
              <TacticalButton variant="secondary" size="sm" onClick={onClose}>
                Close
              </TacticalButton>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Select Specific Driver (Or leave blank for Automated AI Selection)
              </label>
              <select
                value={selectedDriverId || ""}
                onChange={(e) => setSelectedDriverId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none cursor-pointer"
              >
                <option value="">⚡ Automatic AI Multi-Factor Optimization (Recommended)</option>
                {eligibleDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.driver_code || `#DRV-${d.id}`}) — Cap: {d.vehicle_capacity}kg | Status: {d.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/20 font-mono-micro text-[11px] space-y-1">
              <div className="text-outline uppercase">Decision Factors Evaluated:</div>
              <ul className="list-disc list-inside text-on-surface-variant space-y-0.5">
                <li>Real-road distance to order pickup point</li>
                <li>Driver vehicle capacity fit & payload balancing</li>
                <li>Current driver status & active order backlog</li>
                <li>Delivery SLA deadline urgency factor</li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-outline-variant/30">
              <TacticalButton variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </TacticalButton>
              <TacticalButton variant="primary" size="sm" loading={loading} onClick={handleAssign} icon="alt_route">
                Calculate & Assign Driver
              </TacticalButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
