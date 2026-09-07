import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Driver, Order, RouteGeometry } from "../../types";

// Leaflet DivIcon helpers
const createDriverIcon = (driver: Driver, isSelected = false) => {
  const isMoving = driver.status === "in_transit" || driver.status === "delivering";
  const ringColor = isSelected ? "#38BDF8" : isMoving ? "#10B981" : driver.available ? "#3B82F6" : "#F59E0B";

  return L.divIcon({
    className: "custom-driver-pin",
    html: `
      <div style="position: relative; width: 28px; height: 28px;">
        <div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: #172033; border: ${isSelected ? "3px solid #38BDF8" : `2px solid ${ringColor}`};
          display: flex; align-items: center; justify-content: center;
          box-shadow: ${isSelected ? "0 0 12px #38BDF8" : "0 4px 12px rgba(0,0,0,0.6)"};
        ">
          <span style="font-size: 13px; line-height: 1;">🚚</span>
        </div>
        ${
          isMoving
            ? `<div style="position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : ""
        }
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const createPickupIcon = (_order: Order) =>
  L.divIcon({
    className: "custom-pickup-pin",
    html: `
      <div style="
        width: 20px; height: 20px; border-radius: 50%;
        background: #003824; border: 1.5px solid #10B981;
        color: #34D399; font-weight: bold; font-size: 10px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      ">
        P
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

const createDeliveryIcon = (order: Order) => {
  const isDelayed = order.delivery_status === "delayed";
  const isAtRisk = order.delivery_status === "at_risk";
  const bg = isDelayed ? "#690005" : isAtRisk ? "#472A00" : "#00285D";
  const border = isDelayed ? "#EF4444" : isAtRisk ? "#F59E0B" : "#3B82F6";
  const text = isDelayed ? "#F87171" : isAtRisk ? "#FBBF24" : "#93C5FD";

  return L.divIcon({
    className: "custom-delivery-pin",
    html: `
      <div style="
        width: 20px; height: 20px; border-radius: 50%;
        background: ${bg}; border: 1.5px solid ${border};
        color: ${text}; font-weight: bold; font-size: 10px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      ">
        D
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

interface FleetMapProps {
  drivers?: Driver[];
  orders?: Order[];
  routes?: RouteGeometry[];
  dynamicRoutes?: RouteGeometry[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  selectedDriverId?: number | null;
  onSelectDriver?: (driver: Driver) => void;
  onRecalculateRoute?: (driverId: number) => void;
}

export const FleetMap: React.FC<FleetMapProps> = ({
  drivers = [],
  orders = [],
  routes = [],
  dynamicRoutes = [],
  center = [11.0168, 76.9558], // Coimbatore base or first driver position
  zoom = 13,
  height = "100%",
  selectedDriverId = null,
  onSelectDriver,
  onRecalculateRoute,
}) => {
  // Use first driver or order coordinate if available
  const mapCenter: [number, number] =
    drivers.length > 0
      ? [drivers[0].latitude, drivers[0].longitude]
      : orders.length > 0
      ? [orders[0].pickup_latitude, orders[0].pickup_longitude]
      : center;

  return (
    <div style={{ height, width: "100%", position: "relative" }} className="rounded-lg overflow-hidden border border-outline-variant/30">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Polylines: Planned Routes */}
        {routes.map((rg) => (
          <Polyline
            key={`route-${rg.routeId}`}
            positions={rg.points}
            pathOptions={{
              color: "#3B82F6",
              weight: 3.5,
              opacity: 0.85,
            }}
          />
        ))}

        {/* Polylines: Dynamically Recalculated Routes */}
        {dynamicRoutes.map((dr) => (
          <Polyline
            key={`dynamic-route-${dr.routeId}`}
            positions={dr.points}
            pathOptions={{
              color: "#10B981",
              weight: 4,
              opacity: 0.95,
              dashArray: "6, 6",
            }}
          />
        ))}

        {/* Drivers Markers */}
        {drivers.map((driver) => (
          <Marker
            key={`driver-${driver.id}`}
            position={[driver.latitude, driver.longitude]}
            icon={createDriverIcon(driver, selectedDriverId === driver.id)}
            eventHandlers={{
              click: () => onSelectDriver && onSelectDriver(driver),
            }}
          >
            <Popup>
              <div className="p-1 text-left font-sans">
                <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-1 mb-1">
                  <span className="font-bold text-xs text-white">{driver.name}</span>
                  <span className="font-mono text-[10px] text-[#60A5FA] bg-[#2563EB]/20 px-1 py-0.5 rounded">
                    {driver.driver_code || `#DRV-${driver.id}`}
                  </span>
                </div>
                <div className="text-[11px] text-gray-300 space-y-0.5">
                  <p>Capacity: <b className="text-white">{driver.vehicle_capacity} kg</b></p>
                  <p>Status: <span className="capitalize">{driver.status}</span></p>
                  <p className="font-mono text-[10px] text-gray-400">
                    {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                  </p>
                </div>
                {onRecalculateRoute && (
                  <button
                    onClick={() => onRecalculateRoute(driver.id)}
                    className="mt-2 w-full bg-[#2563EB] hover:bg-[#3B82F6] text-white py-1 px-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>Recalculate Optimal Route</span>
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Order Pickup Markers */}
        {orders.map((order) => (
          <Marker
            key={`pickup-${order.id}`}
            position={[order.pickup_latitude, order.pickup_longitude]}
            icon={createPickupIcon(order)}
          >
            <Popup>
              <div className="p-1 text-left">
                <span className="font-bold text-xs text-white">Pickup: {order.order_number || `#ORD-${order.id}`}</span>
                <p className="text-[11px] text-gray-300 mt-1">Weight: {order.weight} kg | Priority: {order.priority}</p>
                {order.pickup_address && <p className="text-[10px] text-gray-400">{order.pickup_address}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Order Delivery Markers */}
        {orders.map((order) => (
          <Marker
            key={`delivery-${order.id}`}
            position={[order.delivery_latitude, order.delivery_longitude]}
            icon={createDeliveryIcon(order)}
          >
            <Popup>
              <div className="p-1 text-left">
                <span className="font-bold text-xs text-white">Delivery: {order.order_number || `#ORD-${order.id}`}</span>
                <p className="text-[11px] text-gray-300 mt-1">Status: <b className="capitalize">{order.delivery_status}</b></p>
                {order.delivery_address && <p className="text-[10px] text-gray-400">{order.delivery_address}</p>}
                {order.delivery_deadline && (
                  <p className="text-[10px] text-yellow-400 mt-1">
                    Deadline: {new Date(order.delivery_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-2 left-2 z-1000 bg-[#172033]/90 backdrop-blur-xs px-2 py-1.5 rounded border border-[#26354A] font-mono-micro text-[10px] flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block"></span>
          <span>Planned</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block"></span>
          <span>Dynamic Reroute</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block"></span>
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block"></span>
          <span>Delivery</span>
        </div>
      </div>
    </div>
  );
};
