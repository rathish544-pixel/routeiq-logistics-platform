import { request } from "./client";
import type { OptimizationResult, OptimizedRoute, DynamicRouteResult } from "../types";

export const optimizationApi = {
  optimizeMultiDriver: () =>
    request<OptimizationResult>("/optimization/multi-driver", { method: "POST" }),

  getRoutes: () =>
    request<{ total_routes: number; routes: OptimizedRoute[] }>("/optimization/routes"),

  getRoute: (id: number) =>
    request<OptimizedRoute>(`/optimization/routes/${id}`),

  getRouteGeometry: (locations: [number, number][]) =>
    request<{ coordinates: [number, number][] }>("/optimization/route-geometry", {
      method: "POST",
      body: JSON.stringify(locations),
    }),

  recalculateRoute: (driverId: number) =>
    request<DynamicRouteResult>(`/routing/driver/${driverId}/recalculate`, {
      method: "POST",
    }),

  getRuns: () =>
    request<{
      total_runs: number;
      runs: {
        run_id: number;
        total_orders: number;
        total_drivers: number;
        routes_count: number;
        total_distance_km: number;
        execution_time_seconds: number;
        status: string;
        summary: any;
        created_at: string;
      }[];
    }>("/optimization/runs"),
};
