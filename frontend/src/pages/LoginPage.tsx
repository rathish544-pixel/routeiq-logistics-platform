import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { TacticalButton } from "../components/common/TacticalButton";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("ops.lead@routeiq-logistics.com");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [node, setNode] = useState("tx4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Authentication failed. Check fleet identity.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-xl p-space-3 shadow-2xl relative overflow-hidden">
        {/* Glow watermark */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

        {/* Brand Header */}
        <div className="flex items-center justify-between pb-space-2 border-b border-outline-variant/20 mb-space-2">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" fill="none" className="h-8 w-auto">
              <rect width="36" height="36" rx="6" fill="#1E293B" stroke="#3B82F6" strokeWidth="1.5"/>
              <path d="M10 26L18 10L26 26" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 10V26" stroke="#3B82F6" strokeWidth="2" strokeDasharray="2 2"/>
              <circle cx="18" cy="10" r="2.5" fill="#38BDF8"/>
              <circle cx="10" cy="26" r="2" fill="#10B981"/>
              <circle cx="26" cy="26" r="2" fill="#EF4444"/>
              <text x="46" y="24" fill="#F8FAFC" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700" fontSize="18" letterSpacing="0.5">Route<tspan fill="#3B82F6">IQ</tspan></text>
              <text x="122" y="16" fill="#94A3B8" fontFamily="monospace" fontSize="8" letterSpacing="0.5">OPS v2.4</text>
            </svg>
          </div>
          <span className="font-mono-micro text-[10px] px-2 py-0.5 rounded bg-surface-container-highest text-primary font-semibold">
            SECURE GATEWAY
          </span>
        </div>

        <div className="mb-space-2">
          <div className="flex items-center gap-1 font-mono-micro text-[10px] text-secondary uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
            DISPATCH IDENTITY CHECKPOINT
          </div>
          <h2 className="font-headline-lg text-xl font-bold text-on-surface">Logistics Mission Control</h2>
          <p className="font-body-default text-xs text-outline mt-1">
            Enter your fleet credentials or SSO identity to access operational dispatch telemetry.
          </p>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded bg-error/15 border border-error/40 text-error text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3 font-sans text-xs">
          <div>
            <label className="block font-label-standard text-[10px] text-outline uppercase tracking-wider mb-1">
              Work Identity (IAM / Email)
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-base text-outline pointer-events-none">alternate_email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded pl-9 pr-3 py-2 text-on-surface font-mono-data-dense outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block font-label-standard text-[10px] text-outline uppercase tracking-wider mb-1">
              Cryptographic Password
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-base text-outline pointer-events-none">lock</span>
              <input
                type={showPw ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded pl-9 pr-9 py-2 text-on-surface font-mono-data-dense outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-base">{showPw ? "visibility" : "visibility_off"}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block font-label-standard text-[10px] text-outline uppercase tracking-wider mb-1">
              Fleet Operational Hub / Gateway
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-base text-secondary pointer-events-none">hub</span>
              <select
                value={node}
                onChange={(e) => setNode(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded pl-9 pr-3 py-2 text-on-surface font-mono-data-dense outline-none cursor-pointer"
              >
                <option value="tx4">US-EAST-TX4 (Austin Metro Central - Primary Tier 1)</option>
                <option value="in1">IN-SOUTH-01 (Coimbatore Logistics Cluster)</option>
                <option value="eu1">EU-WEST-01 (Frankfurt Central Interchange)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <TacticalButton
              variant="primary"
              size="lg"
              type="submit"
              loading={loading}
              className="w-full"
              icon="login"
            >
              Authenticate & Enter Control Room
            </TacticalButton>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between font-mono-micro text-[10px] text-outline">
          <span>STATUS: ALL NODES OPERATIONAL</span>
          <span>LATENCY: 14ms</span>
        </div>
      </div>
    </div>
  );
};
