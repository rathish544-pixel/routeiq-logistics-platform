import { request } from "./client";
import type { Order, OrderCreate, OrderUpdate } from "../types";

export const ordersApi = {
  list: (params?: { status?: string; search?: string; skip?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.skip) query.set("skip", params.skip.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    const qs = query.toString();
    return request<Order[]>(`/orders${qs ? `?${qs}` : ""}`);
  },

  get: (id: number) => request<Order>(`/orders/${id}`),

  create: (data: OrderCreate) =>
    request<Order>("/orders/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: OrderUpdate) =>
    request<Order>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, status: string) =>
    request<{ message: string; order_id: number; status: string; delivery_status: string }>(
      `/orders/${id}/status?status=${encodeURIComponent(status)}`,
      { method: "PATCH" }
    ),

  delete: (id: number) =>
    request<{ message: string }>(`/orders/${id}`, { method: "DELETE" }),
};
