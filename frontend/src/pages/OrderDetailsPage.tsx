import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ordersApi } from "../api/orders";
import { driversApi } from "../api/drivers";
import type { Order, Driver } from "../types";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, ErrorState } from "../components/common/States";
import { AssignOrderModal } from "../components/assignments/AssignOrderModal";
import { FleetMap } from "../components/map/FleetMap";
import { useWebSocket } from "../hooks/useWebSocket";

const LIFECYCLE_STEPS: { key: string; label: string; icon: string; detail: string }[] = [
  { key: "pending", label: "Order Ingested", icon: "inventory_2", detail: "Order registered to the dispatch pipeline" },
  { key: "assigned", label: "Driver Assigned", icon: "local_shipping", detail: "Best-fit driver selected for the run" },
  { key: "planned", label: "Route Planned", icon: "alt_route", detail: "Stop sequenced by the OR-Tools solver" },
  { key: "pickup_pending", label: "Staged at Pickup", icon: "package_2", detail: "Driver positioned at the origin" },
  { key: "picked_up", label: "Pickup Confirmed", icon: "archive", detail: "Cargo loaded onto the vehicle" },
  { key: "out_for_delivery", label: "In Transit", icon: "local_shipping", detail: "En route to final destination" },
  { key: "delivered", label: "Delivered", icon: "check_circle", detail: "Proof-of-delivery completed" },
];

const STEP_ORDER = ["pending", "assigned", "planned", "pickup_pending", "picked_up", "out_for_delivery", "delivered"];

export const OrderDetailsPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const id = parseInt(orderId || "0", 10);

  const [order, setOrder] = useState<Order | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now, setNow] = useState(Date.now());

  const fetchData = async () => {
    if (!id) return;
    try {
      const [orderData, driverList] = await Promise.all([ordersApi.get(id), driversApi.list()]);
      setOrder(orderData);
      setDrivers(driverList);
      if (orderData.assigned_driver_id) {
        setDriver(driverList.find((d) => d.id === orderData.assigned_driver_id) || null);
      }
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load order telemetry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live clock for SLA countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live refresh on telemetry events touching this order
  useWebSocket((msg) => {
    if (order && (msg.data?.order_id === order.id)) fetchData();
  });

  const sla = useMemo(() => {
    if (!order) return null;
    const deadline = order.delivery_deadline ? new Date(order.delivery_deadline).getTime() : null;

    if (!deadline) return { status: "no_deadline", label: "NO SLA DEADLINE", driftMs: 0 };
    if (order.status === "delivered" || order.status === "cancelled") {
      return { status: order.delivery_status, label: "RUN COMPLETE", driftMs: 0 };
    }

    const driftMs = deadline - now;
    const effectiveStatus = order.delivery_status === "at_risk" || order.delivery_status === "delayed"
      ? order.delivery_status
      : driftMs < 0 ? "delayed" : driftMs < (order.priority >= 3 ? 30 : order.priority === 2 ? 20 : 15) * 60000 ? "at_risk" : "on_time";

    return { status: effectiveStatus, label: "SLA BREACH WINDOW", driftMs };
  }, [order, now]);

  const statusIndex = order ? STEP_ORDER.indexOf(order.status) : -1;
  const isTerminal = order && (order.status === "delivered" || order.status === "cancelled");

  const handleTransition = async (next: string) => {
    if (!order) return;
    setBusy(true);
    try {
      await ordersApi.updateStatus(order.id, next);
      setActionMsg(`Order lifecycle advanced to "${next.replace(/_/g, " ")}"`);
      setTimeout(() => setActionMsg(""), 4000);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Status transition rejected");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await ordersApi.delete(order.id);
      navigate("/orders");
    } catch (err: any) {
      setError(err.message || "Failed to delete order");
      setBusy(false);
    }
  };

  const nextActions: { status: string; label: string; icon: string; variant: "primary" | "secondary" | "danger" }[] = [];
  if (order && !isTerminal) {
    if (order.status === "pending") {
      nextActions.push({ status: "assign", label: "Assign Driver", icon: "swap_driving_apps", variant: "primary" });
      nextActions.push({ status: "cancel", label: "Cancel Order", icon: "close", variant: "danger" });
    }
    if (order.status === "assigned") nextActions.push({ status: "pickup_pending", label: "Mark Staged", icon: "package_2", variant: "secondary" });
    if (order.status === "planned") nextActions.push({ status: "pickup_pending", label: "Mark Staged", icon: "package_2", variant: "secondary" });
    if (order.status === "pickup_pending") nextActions.push({ status: "picked_up", label: "Confirm Pickup", icon: "archive", variant: "secondary" });
    if (order.status === "picked_up") nextActions.push({ status: "out_for_delivery", label: "Dispatch In Transit", icon: "local_shipping", variant: "secondary" });
    if (order.status === "out_for_delivery") nextActions.push({ status: "delivered", label: "Complete Delivery", icon: "check_circle", variant: "primary" });
  }

  if (loading) return <LoadingState message="LOADING ORDER MISSION TELEMETRY..." />;
  if (!order) return <ErrorState message={error || "Order not found"} onRetry={fetchData} />;

  const fmtTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

  const driftText = sla && sla.driftMs !== null
    ? sla.driftMs < 0
      ? `+${Math.floor(-sla.driftMs / 60000)}m ${Math.floor((-sla.driftMs % 60000) / 1000)}s DRIFT`
      : `${Math.floor(sla.driftMs / 60000)}m ${Math.floor((sla.driftMs % 60000) / 1000)}s REMAIN`
    : "";

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

      {/* Breadcrumb & context bar */}
      <div className="flex flex-wrap items-center justify-between gap-compact-sm text-on-surface-variant">
        <div className="flex items-center gap-1.5 font-mono-data-dense">
          <Link to="/orders" className="text-outline hover:text-on-surface transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">inventory_2</span>
            <span>ORDERS</span>
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold tracking-wider">{order.order_number || `#ORD-${order.id}`}</span>
        </div>
        <div className="flex items-center gap-2 font-mono-micro text-[10px]">
          <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-outline uppercase">Telemetry feed: live</span>
          {driver && (
            <span className="px-2 py-0.5 rounded bg-secondary/10 text-secondary uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              UPLINK STABLE
            </span>
          )}
        </div>
      </div>

      {/* Mission header hero strip */}
      <div className="bg-surface-container rounded-lg p-space-2 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-2 relative overflow-hidden border border-outline-variant/20">
        <div className={`absolute -right-24 -top-24 w-80 h-80 rounded-full blur-3xl pointer-events-none ${sla?.status === "delayed" ? "bg-error/10" : sla?.status === "at_risk" ? "bg-tertiary/10" : "bg-primary/5"}`}></div>

        <div className="flex flex-wrap items-center gap-space-2 z-10">
          <div>
            <div className="flex items-center gap-compact-sm flex-wrap">
              <h1 className="font-headline-lg text-2xl font-bold text-on-surface tracking-tight">
                {order.order_number || `#ORD-${order.id}`}
              </h1>
              <span className={`px-1.5 py-0.5 rounded font-mono-micro text-[10px] font-bold flex items-center gap-1 ${
                order.priority >= 3 ? "bg-error/20 text-error" : order.priority === 2 ? "bg-tertiary/20 text-tertiary" : "bg-surface-container-high text-outline"
              }`}>
                <span className="material-symbols-outlined text-[11px]">emergency</span>
                PRIORITY: {order.priority === 3 ? "CRITICAL" : order.priority === 2 ? "EXPRESS" : "STANDARD"}
              </span>
              <StatusBadge status={order.delivery_status} />
            </div>
            <span className="font-body-dense text-outline mt-1 block">
              {order.pickup_address || `Origin ${order.pickup_latitude.toFixed(3)}, ${order.pickup_longitude.toFixed(3)}`}
              {" → "}
              {order.delivery_address || `Destination ${order.delivery_latitude.toFixed(3)}, ${order.delivery_longitude.toFixed(3)}`}
            </span>
            {driver && (
              <Link to={`/drivers/${driver.id}`} className="inline-flex items-center gap-1.5 mt-1.5 bg-surface-container-lowest px-2 py-1 rounded border border-outline-variant/20 text-secondary hover:border-primary/40">
                <span className="material-symbols-outlined text-xs">local_shipping</span>
                <span className="font-mono-data-dense text-[11px]">{driver.name} · {driver.driver_code || `#DRV-${driver.id}`}</span>
              </Link>
            )}
          </div>

          {/* SLA countdown unit */}
          {sla && sla.driftMs !== null && !isTerminal && (
            <div className="bg-surface-container-lowest px-space-1-5 py-compact-xs rounded border border-outline-variant/20 flex items-center gap-space-1">
              <span className={`material-symbols-outlined text-2xl ${sla.status === "delayed" ? "text-error" : sla.status === "at_risk" ? "text-tertiary" : "text-secondary"}`}>
                timer
              </span>
              <div>
                <span className="font-mono-micro text-[10px] text-outline uppercase tracking-wider">
                  {sla.label}: {new Date(order.delivery_deadline!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {fmtDate(order.delivery_deadline)}
                </span>
                <div className={`font-mono-data-lg text-base font-bold tracking-tight ${sla.status === "delayed" ? "text-error" : sla.status === "at_risk" ? "text-tertiary" : "text-secondary"}`}>
                  {driftText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tactical actions */}
        <div className="flex flex-wrap items-center gap-compact-xs z-10">
          {nextActions.map((action) =>
            action.status === "assign" ? (
              <TacticalButton key={action.status} variant="primary" size="sm" icon={action.icon} onClick={() => setIsAssignOpen(true)}>
                {action.label}
              </TacticalButton>
            ) : action.status === "cancel" ? (
              <TacticalButton key={action.status} variant="danger" size="sm" icon={action.icon} onClick={() => handleTransition("cancelled")} loading={busy}>
                {action.label}
              </TacticalButton>
            ) : (
              <TacticalButton key={action.status} variant={action.variant} size="sm" icon={action.icon} onClick={() => handleTransition(action.status)} loading={busy}>
                {action.label}
              </TacticalButton>
            )
          )}
          {driver && !isTerminal && (
            <TacticalButton variant="secondary" size="sm" icon="alt_route" onClick={() => navigate(`/tracking?driver=${driver.id}`)}>
              Track Vehicle
            </TacticalButton>
          )}
          {isTerminal && (
            <TacticalButton variant="secondary" size="sm" icon="history" onClick={() => navigate("/orders")}>
              Back to Orders
            </TacticalButton>
          )}
          {!confirmDelete ? (
            <TacticalButton variant="danger" size="sm" icon="delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </TacticalButton>
          ) : (
            <div className="flex items-center gap-1 bg-error/10 border border-error/40 rounded px-2 py-1">
              <span className="text-error text-[11px] font-semibold">Confirm delete?</span>
              <TacticalButton variant="danger" size="sm" onClick={handleDelete} loading={busy}>Yes</TacticalButton>
              <TacticalButton variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>No</TacticalButton>
            </div>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-compact-sm">
        {/* Left: timeline + map */}
        <div className="lg:col-span-7 flex flex-col gap-compact-sm">
          {/* Delivery lifecycle stepper */}
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 p-space-1-5">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">conversion_path</span>
                <span className="font-headline-sm text-xs font-bold text-on-surface uppercase tracking-wider">Delivery Lifecycle Stepper</span>
              </div>
              <span className="font-mono-micro text-[10px] text-outline">ORDER #{order.id}</span>
            </div>
            <div className="relative pl-6 space-y-1">
              <div className="absolute left-2.5 top-3 bottom-3 w-0.5 bg-surface-container-highest"></div>
              {LIFECYCLE_STEPS.map((step, idx) => {
                const isDone = order.status === "delivered" || (statusIndex >= 0 && idx <= statusIndex);
                const isCancelledStep = order.status === "cancelled" && idx === 0;
                const reached = isDone || isCancelledStep;
                return (
                  <div key={step.key} className={`relative flex items-start gap-2 group ${reached ? "" : "opacity-50"}`}>
                    <div className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                      isCancelledStep ? "bg-error/20" : reached ? "bg-secondary/20" : "bg-surface-container-highest"
                    }`}>
                      <span className={`material-symbols-outlined text-[13px] ${isCancelledStep ? "text-error" : reached ? "text-secondary" : "text-outline"}`}>
                        {idx === statusIndex && !isTerminal ? "radio_button_checked" : reached ? "check" : "radio_button_unchecked"}
                      </span>
                    </div>
                    <div className={`flex-1 px-2 py-1.5 rounded ${idx === statusIndex && !isTerminal ? "bg-primary/10 border border-primary/30" : "bg-surface-container-lowest border border-outline-variant/15"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-body-medium text-[12px] text-on-surface font-semibold">{step.label}</span>
                        <span className="font-mono-data-dense text-[10px] text-outline">
                          {step.key === "pending" ? `Ingested ${fmtTime(order.created_at)}` : step.key === order.status ? "CURRENT" : reached ? "COMPLETE" : ""}
                        </span>
                      </div>
                      <p className="font-body-dense text-[11px] text-outline">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order geo map */}
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
            <div className="h-9 px-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">map</span>
                <span className="font-headline-sm text-xs font-bold text-on-surface">Origin → Destination Geo-Span</span>
              </div>
              <span className="font-mono-micro text-[10px] text-outline">OSRM ROAD NETWORK</span>
            </div>
            <div className="h-[260px]">
              <FleetMap orders={[order]} center={[order.pickup_latitude, order.pickup_longitude]} zoom={12} />
            </div>
          </div>
        </div>

        {/* Right: telemetry */}
        <div className="lg:col-span-5 flex flex-col gap-compact-sm">
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 p-space-1-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-primary text-lg">monitor_heart</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface uppercase tracking-wider">Mission Telemetry</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Lifecycle Status</div>
                <div className="mt-1"><StatusBadge status={order.status} /></div>
              </div>
              <div className="bg-surface-container rounded p-2 border border-outline-variant/15">
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">SLA Performance</div>
                <div className="mt-1"><StatusBadge status={order.delivery_status} /></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Gross Weight</div>
                <div className="font-mono-data-base text-sm text-on-surface font-semibold mt-0.5">{order.weight} kg</div>
              </div>
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Cargo Priority</div>
                <div className="font-mono-data-base text-sm text-on-surface font-semibold mt-0.5">P-{order.priority}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Consignee</div>
                <div className="text-on-surface font-medium mt-0.5 text-[12px]">{order.customer_name || "Enterprise Client"}</div>
              </div>
              <div>
                <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Handling Route</div>
                <div className="text-on-surface font-medium mt-0.5 text-[12px]">{order.route_id ? `Route #${order.route_id}` : "Unplanned"}</div>
              </div>
            </div>

            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Delivery Deadline</div>
              <div className={`font-mono-data-base text-sm mt-0.5 ${sla?.status === "delayed" ? "text-error" : sla?.status === "at_risk" ? "text-tertiary" : "text-secondary"} font-semibold`}>
                {order.delivery_deadline ? `${fmtDate(order.delivery_deadline)} ${fmtTime(order.delivery_deadline)}` : "No SLA Deadline"}
              </div>
            </div>

            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Optimizer ETA</div>
              <div className="font-mono-data-base text-sm text-on-surface font-semibold mt-0.5">
                {order.estimated_arrival ? `${fmtDate(order.estimated_arrival)} ${fmtTime(order.estimated_arrival)}` : "Not yet planned"}
              </div>
            </div>

            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Origin Coordinates</div>
              <div className="font-mono-data-dense text-[11px] text-primary mt-0.5">
                {order.pickup_latitude.toFixed(6)}, {order.pickup_longitude.toFixed(6)}
              </div>
            </div>
            <div>
              <div className="font-mono-micro text-[9px] text-outline uppercase tracking-wider">Destination Coordinates</div>
              <div className="font-mono-data-dense text-[11px] text-secondary mt-0.5">
                {order.delivery_latitude.toFixed(6)}, {order.delivery_longitude.toFixed(6)}
              </div>
            </div>
          </div>

          {/* Fleet unit card */}
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 p-space-1-5">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-primary text-lg">local_shipping</span>
              <span className="font-headline-sm text-xs font-bold text-on-surface uppercase tracking-wider">Assigned Fleet Unit</span>
            </div>
            {driver ? (
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <Link to={`/drivers/${driver.id}`} className="font-bold text-on-surface text-sm hover:text-primary">{driver.name}</Link>
                  <div className="font-mono text-[10px] text-primary">{driver.driver_code || `#DRV-${driver.id}`} · {driver.vehicle_type || "Van"}</div>
                  <div className="font-mono-micro text-[10px] text-outline mt-1">Capacity: {driver.vehicle_capacity} kg</div>
                </div>
                <StatusBadge status={driver.status} />
              </div>
            ) : (
              <div className="mt-2 text-outline italic text-[12px]">No driver assigned — run awaits dispatch.</div>
            )}
          </div>

          <button
            onClick={() => navigate("/orders")}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors font-body-medium text-xs"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Return to Orders Pipeline
          </button>
        </div>
      </div>

      <AssignOrderModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        order={order}
        drivers={drivers}
        onAssigned={() => {
          setIsAssignOpen(false);
          fetchData();
        }}
      />
    </div>
  );
};