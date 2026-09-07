import { request } from "./client";
import type { Driver, DriverCreate, DriverUpdate, DriverLocation } from "../types";

export const driversApi = {
  list: () => request<Driver[]>("/drivers/"),

  get: (id: number) => request<Driver>(`/drivers/${id}`),

  create: (data: DriverCreate) =>
    request<Driver>("/drivers/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: DriverUpdate) =>
    request<Driver>(`/drivers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  toggleStatus: (id: number, status: string, available: boolean) =>
    request<Driver>(`/drivers/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, available }),
    }),

  getLocation: (id: number) =>
    request<DriverLocation>(`/tracking/driver/${id}/location`),

  getHistory: (id: number) =>
    request<{ driver_id: number; driver_name: string; total_points: number; locations: DriverLocation[] }>(
      `/tracking/driver/${id}/history`
    ),

  getMission: (id: number) =>
    request<DriverMission>(`/drivers/${id}/mission`),
};

export interface DriverMission {
  driver: Driver;
  current_route: {
    route_id: number;
    total_distance_km: number;
    estimated_duration_minutes: number;
    status: string | null;
    orders: MissionOrder[];
  } | null;
}

export interface MissionOrder {
  order_id: number;
  order_number: string | null;
  stop_sequence: number;
  stop_type: string;
  status: string;
  delivery_status: string;
  weight: number;
  priority: number;
  delivery_deadline: string | null;
  estimated_arrival: string | null;
  delivery_address: string | null;
  delivery_latitude: number;
  delivery_longitude: number;
  pickup_address: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
}
