import { request } from "./client";
import type { DashboardMetrics } from "../types";

export const analyticsApi = {
  getDashboardMetrics: () =>
    request<DashboardMetrics>("/analytics/dashboard"),

  getPerformance: () =>
    request<any>("/analytics/performance"),

  getComparison: () =>
    request<any>("/analytics/comparison"),
};
