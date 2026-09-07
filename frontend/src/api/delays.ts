import { request } from "./client";
import type { SystemAlert } from "../types";

export interface DelaySummary {
  total_checked: number;
  on_time_count: number;
  at_risk_count: number;
  delayed_count: number;
  orders: {
    order_id: number;
    order_number: string;
    priority: number;
    delay_status: string;
    delay_minutes: number;
    message: string;
    deadline?: string;
    estimated_arrival?: string;
  }[];
}

export const delaysApi = {
  getSummary: () => request<DelaySummary>("/delays/summary"),

  checkOrder: (orderId: number) =>
    request<any>(`/delays/order/${orderId}`),

  triggerScan: () =>
    request<DelaySummary>("/delays/scan", { method: "POST" }),

  getAlerts: () =>
    request<SystemAlert[]>("/delays/alerts"),

  acknowledgeAlert: (alertId: number) =>
    request<{ message: string; alert_id: number }>(`/delays/alerts/${alertId}/ack`, {
      method: "PATCH",
    }),
};
