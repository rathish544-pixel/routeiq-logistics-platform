export type OrderStatus =
  | "pending"
  | "assigned"
  | "planned"
  | "pickup_pending"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type DeliveryStatus =
  | "pending"
  | "on_time"
  | "at_risk"
  | "delayed"
  | "delivered"
  | "cancelled";

export interface Order {
  id: number;
  order_number: string;
  customer_name?: string;
  pickup_address?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_address?: string;
  delivery_latitude: number;
  delivery_longitude: number;
  weight: number;
  priority: number;
  delivery_deadline?: string | null;
  status: OrderStatus;
  delivery_status: DeliveryStatus;
  assigned_driver_id?: number | null;
  route_id?: number | null;
  estimated_arrival?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderCreate {
  order_number?: string;
  customer_name?: string;
  pickup_address?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_address?: string;
  delivery_latitude: number;
  delivery_longitude: number;
  weight: number;
  priority?: number;
  delivery_deadline?: string | null;
}

export interface OrderUpdate {
  customer_name?: string;
  pickup_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  delivery_address?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  weight?: number;
  priority?: number;
  delivery_deadline?: string | null;
  status?: OrderStatus;
  delivery_status?: DeliveryStatus;
}

export type DriverStatus = "idle" | "assigned" | "in_transit" | "delivering" | "offline";

export interface Driver {
  id: number;
  driver_code?: string;
  name: string;
  phone?: string;
  vehicle_type?: string;
  latitude: number;
  longitude: number;
  vehicle_capacity: number;
  available: boolean;
  status: DriverStatus;
  created_at?: string;
  updated_at?: string;
}

export interface DriverCreate {
  name: string;
  phone?: string;
  vehicle_type?: string;
  latitude: number;
  longitude: number;
  vehicle_capacity: number;
  driver_code?: string;
}

export interface DriverUpdate {
  name?: string;
  phone?: string;
  vehicle_type?: string;
  latitude?: number;
  longitude?: number;
  vehicle_capacity?: number;
  available?: boolean;
  status?: DriverStatus;
}

export interface DriverLocation {
  driver_id: number;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading?: number;
  recorded_at: string;
}

export interface RouteStop {
  stop_sequence: number;
  order_id: number;
  order_number?: string | null;
  customer_name?: string | null;
  order_status?: string;
  stop_type: "pickup" | "delivery";
  latitude: number;
  longitude: number;
  weight?: number;
  priority?: number;
  vehicle_load?: number;
  estimated_arrival?: string | null;
  deadline?: string | null;
  delivery_status?: DeliveryStatus;
  address?: string | null;
  completed?: boolean;
}

export interface OptimizedRoute {
  route_id: number;
  route_code?: string;
  driver_id: number;
  driver_name: string;
  driver_code?: string;
  vehicle_capacity?: number;
  total_weight?: number;
  total_distance_km: number;
  estimated_duration_minutes: number;
  status?: string;
  orders: RouteStop[];
}

export interface OptimizationResult {
  run_id?: number;
  total_drivers: number;
  total_orders: number;
  routes_saved: number;
  execution_time_seconds?: number;
  routes: OptimizedRoute[];
  metrics?: {
    avg_capacity_utilization_pct?: number;
    on_time_compliance_pct?: number;
    total_fleet_distance_km?: number;
    late_orders_count?: number;
  };
}

export interface RouteGeometry {
  routeId: number;
  points: [number, number][]; // [lat, lng]
}

export interface RerouteChangeInfo {
  order_id: number;
  order_number: string | null;
  priority: number;
  previous_eta: string | null;
  new_eta: string;
  eta_delta_minutes: number | null;
  delivery_status: DeliveryStatus;
  delivery_deadline: string | null;
}

export interface DynamicRouteResult {
  driver_id: number;
  driver_name: string;
  vehicle_capacity: number;
  route_id?: number;
  message?: string;
  current_location?: {
    latitude: number;
    longitude: number;
  };
  orders_in_route?: number;
  previous_route?: {
    total_distance_km: number;
    estimated_duration_minutes: number;
  };
  changes?: {
    distance_delta_km: number;
    duration_delta_minutes: number;
    affected_order_ids: number[];
    affected_orders_count: number;
    eta_changes: RerouteChangeInfo[];
    at_risk_order_ids: number[];
    delayed_order_ids: number[];
  };
  route: {
    stops: RouteStop[];
    total_distance_km: number;
    estimated_duration_minutes: number;
  };
}

export interface AssignmentResult {
  order_id: number;
  driver_id: number;
  driver_name: string;
  driver_code?: string;
  distance_to_pickup_km: number;
  estimated_travel_time_minutes: number;
  vehicle_capacity_kg: number;
  order_weight_kg: number;
  capacity_utilization_pct: number;
  score: number;
  reasoning: string;
  score_breakdown?: Record<string, any>;
  status: string;
}

export interface DashboardMetrics {
  orders: {
    total: number;
    pending: number;
    assigned: number;
    planned: number;
    in_transit: number;
    delivered: number;
    delayed: number;
    at_risk: number;
  };
  drivers: {
    total: number;
    available: number;
    assigned: number;
    delivering: number;
    idle: number;
    offline: number;
    utilization_rate_pct: number;
  };
  routes: {
    total: number;
    planned: number;
    active: number;
    completed: number;
    on_schedule: number;
    at_risk: number;
    delayed: number;
  };
  on_time_sla_rate_pct: number;
  benchmark_sla_pct: number;
  delayed_orders_count: number;
  payload_utilization_pct: number;
  avg_transit_time_minutes: number;
  total_distance_km_today: number;
  last_updated: string;
}

export interface SystemAlert {
  id: number;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  order_id?: number | null;
  driver_id?: number | null;
  route_id?: number | null;
  acknowledged: boolean;
  created_at?: string;
}

export interface OperationSettings {
  delay_warning_threshold_p1: number;
  delay_warning_threshold_p2: number;
  delay_warning_threshold_p3: number;
  solver_timeout_seconds: number;
  default_service_time_minutes: number;
  auto_reroute_on_delay: boolean;
  map_center_latitude: number;
  map_center_longitude: number;
  map_zoom_level: number;
}
