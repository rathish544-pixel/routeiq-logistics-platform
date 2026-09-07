import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { TacticalButton } from "../common/TacticalButton";
import type { DriverCreate } from "../../types";
import { driversApi } from "../../api/drivers";

interface CreateDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDriverCreated: () => void;
}

export const CreateDriverModal: React.FC<CreateDriverModalProps> = ({ isOpen, onClose, onDriverCreated }) => {
  const [formData, setFormData] = useState<DriverCreate>({
    name: "",
    phone: "+1 (555) 019-",
    vehicle_type: "Van",
    vehicle_capacity: 100.0,
    latitude: 11.0168,
    longitude: 76.9558,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await driversApi.create(formData);
      onDriverCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to register driver");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="REGISTER FLEET DRIVER & VEHICLE" subtitle="DISPATCH NETWORK ONBOARDING">
      <form onSubmit={handleSubmit} className="space-y-3 font-sans text-xs">
        {error && (
          <div className="p-2 rounded bg-error/15 border border-error/40 text-error text-[11px]">
            {error}
          </div>
        )}

        <div>
          <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Driver Full Name</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Marcus Brody"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 text-on-surface font-mono-data-dense focus:border-primary outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Phone / Comms</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Vehicle Class</label>
            <select
              value={formData.vehicle_type}
              onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none cursor-pointer"
            >
              <option value="Van">Cargo Van (1.2t)</option>
              <option value="Sprinter">Sprinter Van (2.4t)</option>
              <option value="Box Truck">Box Truck (4.5t)</option>
              <option value="Reefer">Cold-Chain Reefer (3.0t)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Capacity (KG)</label>
            <input
              type="number"
              step="1"
              required
              min="10"
              value={formData.vehicle_capacity}
              onChange={(e) => setFormData({ ...formData, vehicle_capacity: parseFloat(e.target.value) })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Depot Latitude</label>
            <input
              type="number"
              step="any"
              required
              value={formData.latitude}
              onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
          <div>
            <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">Depot Longitude</label>
            <input
              type="number"
              step="any"
              required
              value={formData.longitude}
              onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2 py-1.5 text-on-surface font-mono-data-dense outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-outline-variant/30">
          <TacticalButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </TacticalButton>
          <TacticalButton variant="primary" size="sm" type="submit" loading={loading} icon="local_shipping">
            Commission Driver
          </TacticalButton>
        </div>
      </form>
    </Modal>
  );
};
