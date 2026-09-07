import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ordersApi } from "../api/orders";
import { driversApi } from "../api/drivers";
import type { Order, Driver } from "../types";
import { StatusBadge } from "../components/common/StatusBadge";
import { TacticalButton } from "../components/common/TacticalButton";
import { LoadingState, EmptyState, ErrorState } from "../components/common/States";
import { CreateOrderModal } from "../components/orders/CreateOrderModal";
import { AssignOrderModal } from "../components/assignments/AssignOrderModal";
import { useRefreshSignal } from "../hooks/useRefreshSignal";

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

  const fetchOrders = async () => {
    try {
      const [orderList, driverList] = await Promise.all([
        ordersApi.list(),
        driversApi.list(),
      ]);
      setOrders(orderList);
      setDrivers(driverList);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Reflect global search queries (e.g. from the header search bar)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearch(q);
  }, [searchParams]);

  // Refetch when shared data changes (e.g. order created via header quick action)
  useRefreshSignal(fetchOrders);

  const handleStatusTransition = async (orderId: number, nextStatus: string) => {
    try {
      await ordersApi.updateStatus(orderId, nextStatus);
      fetchOrders();
    } catch (err: any) {
      alert(`Invalid transition: ${err.message}`);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (priorityFilter !== "all" && o.priority.toString() !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const numMatch = (o.order_number || "").toLowerCase().includes(q);
      const custMatch = (o.customer_name || "").toLowerCase().includes(q);
      const addrMatch = (o.delivery_address || "").toLowerCase().includes(q);
      if (!numMatch && !custMatch && !addrMatch) return false;
    }
    return true;
  });

  if (loading) return <LoadingState message="FETCHING ORDER PIPELINE TELEMETRY..." />;

  return (
    <div className="space-y-space-1-5 text-xs font-sans">
      {error && <ErrorState message={error} onRetry={fetchOrders} />}

      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-compact-sm bg-surface-container-low px-space-1-5 py-space-1 rounded border border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-lg font-bold text-on-surface">Orders Management</h1>
            <span className="font-mono-micro text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-secondary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              INGESTION FEED ACTIVE
            </span>
          </div>
          <p className="font-body-default text-xs text-outline mt-0.5">
            Real-Time Order Ingestion, Dispatch Pipeline & SLA Verification
          </p>
        </div>

        <div className="flex items-center gap-compact-xs">
          <TacticalButton variant="primary" size="sm" icon="add" onClick={() => setIsCreateOpen(true)}>
            Create Order
          </TacticalButton>
        </div>
      </div>

      {/* Filter and Search Ribbon */}
      <div className="bg-surface-container-lowest p-space-1 rounded border border-outline-variant/20 flex flex-wrap items-center justify-between gap-compact-sm">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <span className="material-symbols-outlined text-outline text-base">search</span>
          <input
            type="text"
            placeholder="Filter by Order #, Consignee, Delivery Destination..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-2.5 py-1 text-on-surface font-mono-data-dense outline-none text-xs focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-compact-sm font-mono-micro text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-outline uppercase">STATUS:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-container-low border border-outline-variant/30 rounded px-2 py-1 text-on-surface outline-none cursor-pointer"
            >
              <option value="all">All Statuses ({orders.length})</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="planned">Planned</option>
              <option value="pickup_pending">Pickup Pending</option>
              <option value="picked_up">Picked Up</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-outline uppercase">PRIORITY:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-surface-container-low border border-outline-variant/30 rounded px-2 py-1 text-on-surface outline-none cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="1">Priority 1 (Standard)</option>
              <option value="2">Priority 2 (Express)</option>
              <option value="3">Priority 3 (Critical SLA)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <EmptyState
            title="No Orders Match Search Query"
            description="Clear filters or ingest a new dispatch order into the system."
            actionLabel="Create Order"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-lowest text-outline font-label-standard text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-2 px-3">Order ID</th>
                  <th className="py-2 px-3">Consignee</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">SLA Status</th>
                  <th className="py-2 px-3">Weight</th>
                  <th className="py-2 px-3">Priority</th>
                  <th className="py-2 px-3">Delivery Deadline</th>
                  <th className="py-2 px-3">Assigned Driver</th>
                  <th className="py-2 px-3 text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono-data-dense text-[11px]">
                {filteredOrders.map((order) => {
                  const assignedDriver = drivers.find((d) => d.id === order.assigned_driver_id);
                  return (
                    <tr key={order.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-2 px-3 font-bold text-primary cursor-pointer hover:underline" onClick={() => navigate(`/orders/${order.id}`)}>
                        {order.order_number || `#ORD-${order.id}`}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <div className="text-on-surface font-medium">{order.customer_name || "Enterprise Client"}</div>
                        <div className="text-[10px] text-outline truncate max-w-[160px]">{order.delivery_address || `${order.delivery_latitude.toFixed(3)}, ${order.delivery_longitude.toFixed(3)}`}</div>
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={order.delivery_status} />
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {order.weight} kg
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded font-mono-micro text-[10px] font-bold ${
                          order.priority >= 3 ? "bg-error/20 text-error" : order.priority === 2 ? "bg-tertiary/20 text-tertiary" : "bg-surface-container-high text-outline"
                        }`}>
                          P-{order.priority}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px] text-on-surface-variant">
                        {order.delivery_deadline ? new Date(order.delivery_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "N/A"}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        {assignedDriver ? (
                          <button
                            onClick={() => navigate(`/drivers/${assignedDriver.id}`)}
                            className="text-secondary font-medium hover:underline"
                          >
                            {assignedDriver.name}
                          </button>
                        ) : (
                          <span className="text-outline italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right space-x-1 font-sans">
                        {order.status === "pending" && (
                          <TacticalButton variant="primary" size="sm" onClick={() => setAssigningOrder(order)}>
                            Assign
                          </TacticalButton>
                        )}
                        {order.status === "assigned" && (
                          <TacticalButton variant="secondary" size="sm" onClick={() => handleStatusTransition(order.id, "pickup_pending")}>
                            Mark Staged
                          </TacticalButton>
                        )}
                        {order.status === "pickup_pending" && (
                          <TacticalButton variant="secondary" size="sm" onClick={() => handleStatusTransition(order.id, "picked_up")}>
                            Confirm Pickup
                          </TacticalButton>
                        )}
                        {order.status === "picked_up" && (
                          <TacticalButton variant="secondary" size="sm" onClick={() => handleStatusTransition(order.id, "out_for_delivery")}>
                            Dispatch
                          </TacticalButton>
                        )}
                        {order.status === "out_for_delivery" && (
                          <TacticalButton variant="secondary" size="sm" onClick={() => handleStatusTransition(order.id, "delivered")}>
                            Complete
                          </TacticalButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateOrderModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onOrderCreated={fetchOrders} />
      <AssignOrderModal isOpen={!!assigningOrder} onClose={() => setAssigningOrder(null)} order={assigningOrder} drivers={drivers} onAssigned={fetchOrders} />
    </div>
  );
};
