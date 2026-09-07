import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { TacticalButton } from "../common/TacticalButton";
import type { OrderCreate } from "../../types";
import { ordersApi } from "../../api/orders";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
}

/** Format a Date as a local-time string for <input type="datetime-local">. */
const toLocalInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ isOpen, onClose, onOrderCreated }) => {
  const [formData, setFormData] = useState<OrderCreate>({
    customer_name: "",
    pickup_address: "Central Depot Gate 4",
    pickup_latitude: 11.0168,
    pickup_longitude: 76.9558,
    delivery_address: "Metro Distribution Node B",
    delivery_latitude: 11.0320,
    delivery_longitude: 76.9740,
    weight: 15.0,
    priority: 1,
    // Default SLA is ~4h out, expressed in LOCAL time so datetime-local
    // (which parses as local) doesn't render a deadline in the past.
    delivery_deadline: toLocalInputValue(new Date(Date.now() + 4 * 3600000)),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await ordersApi.create({
        ...formData,
        delivery_deadline: formData.delivery_deadline ? new Date(formData.delivery_deadline).toISOString() : null,
      });
      onOrderCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="CREATE NEW LOGISTICS DISPATCH ORDER" subtitle="PIPELINE INGESTION TX4">
      <form onSubmit={handleSubmit} className="space-y-3 font-sans text-xs">
        {error && (
          <div className="p-2 rounded bg-error/15 border border-error/40 text-error text-[11px]">
            {error}
          </div>
        )}

        <div>
          <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Customer / Consignee</label>
          <input
            type="text"
            required
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            placeholder="e.g. Acme Logistics, Apex Retail"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 text-on-surface font-mono-data-dense focus:border-primary outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Pickup Address</label>
            <input
              type="text"
              value={formData.pickup_address}
              onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Delivery Address</label>
            <input
              type="text"
              value={formData.delivery_address}
              onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Pickup Coordinates (Lat, Lon)</label>
            <div className="flex gap-1">
              <input
                type="number"
                step="any"
                required
                value={formData.pickup_latitude}
                onChange={(e) => setFormData({ ...formData, pickup_latitude: parseFloat(e.target.value) })}
                className="w-1/2 bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1 text-on-surface font-mono-data-dense outline-none"
              />
              <input
                type="number"
                step="any"
                required
                value={formData.pickup_longitude}
                onChange={(e) => setFormData({ ...formData, pickup_longitude: parseFloat(e.target.value) })}
                className="w-1/2 bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1 text-on-surface font-mono-data-dense outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Delivery Coordinates (Lat, Lon)</label>
            <div className="flex gap-1">
              <input
                type="number"
                step="any"
                required
                value={formData.delivery_latitude}
                onChange={(e) => setFormData({ ...formData, delivery_latitude: parseFloat(e.target.value) })}
                className="w-1/2 bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1 text-on-surface font-mono-data-dense outline-none"
              />
              <input
                type="number"
                step="any"
                required
                value={formData.delivery_longitude}
                onChange={(e) => setFormData({ ...formData, delivery_longitude: parseFloat(e.target.value) })}
                className="w-1/2 bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1 text-on-surface font-mono-data-dense outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Weight (KG)</label>
            <input
              type="number"
              step="0.1"
              required
              min="0.1"
              value={formData.weight}
              onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>

          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Priority SLA</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none cursor-pointer"
            >
              <option value="1">Priority 1 (Standard)</option>
              <option value="2">Priority 2 (Express)</option>
              <option value="3">Priority 3 (Critical / SLA)</option>
            </select>
          </div>

          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Target Deadline</label>
            <input
              type="datetime-local"
              value={formData.delivery_deadline || ""}
              onChange={(e) => setFormData({ ...formData, delivery_deadline: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1 text-on-surface font-mono-data-dense outline-none text-[11px]"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-outline-variant/30">
          <TacticalButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </TacticalButton>
          <TacticalButton variant="primary" size="sm" type="submit" loading={loading} icon="add">
            Ingest & Register Order
          </TacticalButton>
        </div>
      </form>
    </Modal>
  );
};
