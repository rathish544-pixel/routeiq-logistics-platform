import React, { useEffect, useState } from "react";
import { settingsApi } from "../api/settings";
import type { OperationSettings } from "../types";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState } from "../components/common/States";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<OperationSettings>({
    delay_warning_threshold_p1: 15,
    delay_warning_threshold_p2: 20,
    delay_warning_threshold_p3: 30,
    solver_timeout_seconds: 5,
    default_service_time_minutes: 10,
    auto_reroute_on_delay: true,
    map_center_latitude: 11.0168,
    map_center_longitude: 76.9558,
    map_zoom_level: 13,
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsApi.get()
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await settingsApi.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to save settings");
    }
  };

  if (loading) return <LoadingState message="LOADING OPERATIONAL SETTINGS..." />;

  return (
    <div className="max-w-4xl space-y-space-1-5 text-xs font-sans">
      <div className="bg-surface-container-low px-space-1-5 py-space-1 rounded border border-outline-variant/20 flex items-center justify-between">
        <div>
          <h1 className="font-headline-lg text-lg font-bold text-on-surface">Settings & Operational Policies</h1>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Configure Dispatch SLA Thresholds, OR-Tools Optimization Constraints, and System Telemetry
          </p>
        </div>
        {saved && <span className="font-mono-micro text-secondary font-bold">POLICIES SAVED & SYNCHRONIZED</span>}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="bg-surface-container-low p-space-1-5 rounded-lg border border-outline-variant/20 space-y-3">
          <h3 className="font-headline-sm font-bold text-on-surface text-sm border-b border-outline-variant/20 pb-1">
            SLA Delay Warning Windows
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Priority 1 Warning (min)
              </label>
              <input
                type="number"
                value={settings.delay_warning_threshold_p1}
                onChange={(e) => setSettings({ ...settings, delay_warning_threshold_p1: parseInt(e.target.value) })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 font-mono text-on-surface outline-none"
              />
            </div>
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Priority 2 Express Warning (min)
              </label>
              <input
                type="number"
                value={settings.delay_warning_threshold_p2}
                onChange={(e) => setSettings({ ...settings, delay_warning_threshold_p2: parseInt(e.target.value) })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 font-mono text-on-surface outline-none"
              />
            </div>
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Priority 3 Critical SLA (min)
              </label>
              <input
                type="number"
                value={settings.delay_warning_threshold_p3}
                onChange={(e) => setSettings({ ...settings, delay_warning_threshold_p3: parseInt(e.target.value) })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 font-mono text-on-surface outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low p-space-1-5 rounded-lg border border-outline-variant/20 space-y-3">
          <h3 className="font-headline-sm font-bold text-on-surface text-sm border-b border-outline-variant/20 pb-1">
            Optimization Solver Parameters
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Solver Time Limit (Seconds)
              </label>
              <input
                type="number"
                value={settings.solver_timeout_seconds}
                onChange={(e) => setSettings({ ...settings, solver_timeout_seconds: parseInt(e.target.value) })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 font-mono text-on-surface outline-none"
              />
            </div>
            <div>
              <label className="block font-mono-micro text-[10px] text-outline uppercase mb-1">
                Default Stop Service Dwell Time (min)
              </label>
              <input
                type="number"
                value={settings.default_service_time_minutes}
                onChange={(e) => setSettings({ ...settings, default_service_time_minutes: parseInt(e.target.value) })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 font-mono text-on-surface outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <TacticalButton variant="primary" size="md" type="submit" icon="save">
            Persist Operational Policies
          </TacticalButton>
        </div>
      </form>
    </div>
  );
};
