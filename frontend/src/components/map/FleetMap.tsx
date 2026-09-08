import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Driver, Order, RouteGeometry } from "../../types";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ─────────────────────────────────────────────
   Leaflet marker helpers
   ───────────────────────────────────────────── */

const createDriverIcon = (driver: Driver, isSelected = false) => {
  const isMoving =
    driver.status === "in_transit" || driver.status === "delivering";

  const ringColor = isSelected
    ? "#38BDF8"
    : isMoving
      ? "#10B981"
      : driver.available
        ? "#3B82F6"
        : "#F59E0B";

  return L.divIcon({
    className: "custom-driver-pin",
    html: `
      <div style="position: relative; width: 28px; height: 28px;">
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #172033;
          border: ${
            isSelected
              ? "3px solid #38BDF8"
              : `2px solid ${ringColor}`
          };
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: ${
            isSelected
              ? "0 0 12px #38BDF8"
              : "0 4px 12px rgba(0,0,0,0.6)"
          };
        ">
          <span style="font-size: 13px; line-height: 1;">🚚</span>
        </div>

        ${
          isMoving
            ? `
              <div style="
                position: absolute;
                top: -3px;
                right: -3px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10B981;
                animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
              "></div>
            `
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
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #003824;
        border: 1.5px solid #10B981;
        color: #34D399;
        font-weight: bold;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
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

  const bg = isDelayed
    ? "#690005"
    : isAtRisk
      ? "#472A00"
      : "#00285D";

  const border = isDelayed
    ? "#EF4444"
    : isAtRisk
      ? "#F59E0B"
      : "#3B82F6";

  const text = isDelayed
    ? "#F87171"
    : isAtRisk
      ? "#FBBF24"
      : "#93C5FD";

  return L.divIcon({
    className: "custom-delivery-pin",
    html: `
      <div style="
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${bg};
        border: 1.5px solid ${border};
        color: ${text};
        font-weight: bold;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      ">
        D
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

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

interface DeliveryRoute {
  driverId: number;
  orderId: number;
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  updatedAt: number;
}

/* ─────────────────────────────────────────────
   Map recenter helper
   ───────────────────────────────────────────── */

const MapRecenter: React.FC<{
  center: [number, number];
  zoom: number;
}> = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, {
      animate: true,
    });
  }, [map, center, zoom]);

  return null;
};

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const earthRadius = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
};

const formatDistance = (km: number) => {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  return `${km.toFixed(1)} km`;
};

const formatDuration = (minutes: number) => {
  if (minutes < 1) {
    return "<1 min";
  }

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${mins} min`;
};

/* ─────────────────────────────────────────────
   Main Fleet Map
   ───────────────────────────────────────────── */

export const FleetMap: React.FC<FleetMapProps> = ({
  drivers = [],
  orders = [],
  routes = [],
  dynamicRoutes = [],
  center = [11.0168, 76.9558],
  zoom = 13,
  height = "100%",
  selectedDriverId = null,
  onSelectDriver,
  onRecalculateRoute,
}) => {
  const [deliveryRoutes, setDeliveryRoutes] = useState<
    DeliveryRoute[]
  >([]);

  const [routeLoading, setRouteLoading] = useState(false);

  /* ─────────────────────────────────────────
     Current map center
     ───────────────────────────────────────── */

  const mapCenter: [number, number] = useMemo(() => {
    if (selectedDriverId !== null && selectedDriverId !== undefined) {
      const selectedDriver = drivers.find(
        (driver) => driver.id === selectedDriverId
      );

      if (selectedDriver) {
        return [
          selectedDriver.latitude,
          selectedDriver.longitude,
        ];
      }
    }

    if (drivers.length > 0) {
      return [
        drivers[0].latitude,
        drivers[0].longitude,
      ];
    }

    if (orders.length > 0) {
      return [
        orders[0].pickup_latitude,
        orders[0].pickup_longitude,
      ];
    }

    return center;
  }, [drivers, orders, center, selectedDriverId]);

  /* ─────────────────────────────────────────
     Assigned active delivery pairs
     ───────────────────────────────────────── */

  const activeDeliveryPairs = useMemo(() => {
    const pairs: {
      driver: Driver;
      order: Order;
    }[] = [];

    for (const order of orders) {
      if (
        order.assigned_driver_id === null ||
        order.assigned_driver_id === undefined
      ) {
        continue;
      }

      if (
        order.delivery_status === "delivered" ||
        order.delivery_status === "cancelled"
      ) {
        continue;
      }

      const driver = drivers.find(
        (item) => item.id === order.assigned_driver_id
      );

      if (!driver) {
        continue;
      }

      pairs.push({
        driver,
        order,
      });
    }

    return pairs;
  }, [drivers, orders]);

  /* ─────────────────────────────────────────
     Fetch actual road-following routes
     ───────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    const fetchDeliveryRoutes = async () => {
      if (activeDeliveryPairs.length === 0) {
        setDeliveryRoutes([]);
        return;
      }

      setRouteLoading(true);

      try {
        const results = await Promise.all(
          activeDeliveryPairs.map(async ({ driver, order }) => {
            try {
              /*
               * First get actual road geometry from our backend.
               *
               * Backend endpoint:
               * POST /optimizer/route-geometry
               *
               * Input:
               * [[driverLat, driverLon], [deliveryLat, deliveryLon]]
               *
               * Output:
               * {
               *   coordinates: [[lon, lat], ...]
               * }
               */

              const response = await fetch(
                `${API_URL}/optimizer/route-geometry`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify([
                    [
                      driver.latitude,
                      driver.longitude,
                    ],
                    [
                      order.delivery_latitude,
                      order.delivery_longitude,
                    ],
                  ]),
                }
              );

              if (!response.ok) {
                throw new Error(
                  `Route geometry failed: ${response.status}`
                );
              }

              const data = await response.json();

              const rawCoordinates = Array.isArray(
                data?.coordinates
              )
                ? data.coordinates
                : [];

              const coordinates: [number, number][] =
                rawCoordinates
                  .filter(
                    (point: unknown) =>
                      Array.isArray(point) &&
                      point.length >= 2 &&
                      Number.isFinite(Number(point[0])) &&
                      Number.isFinite(Number(point[1]))
                  )
                  .map(
                    (point: [number, number]) =>
                      [
                        Number(point[1]),
                        Number(point[0]),
                      ] as [number, number]
                  );

              /*
               * Calculate distance from the returned road geometry.
               * This follows the actual road shape rather than a
               * straight driver-to-delivery line.
               */

              let distanceKm = 0;

              for (let i = 1; i < coordinates.length; i++) {
                const previous = coordinates[i - 1];
                const current = coordinates[i];

                distanceKm += haversineDistanceKm(
                  previous[0],
                  previous[1],
                  current[0],
                  current[1]
                );
              }

              /*
               * Estimate travel duration.
               *
               * OSRM geometry endpoint currently returns only
               * coordinates, so use an urban average speed.
               * 25 km/h is a practical default for city delivery.
               */

              const averageSpeedKmh = 25;

              const durationMinutes =
                (distanceKm / averageSpeedKmh) * 60;

              return {
                driverId: driver.id,
                orderId: order.id,
                coordinates,
                distanceKm,
                durationMinutes,
                updatedAt: Date.now(),
              } satisfies DeliveryRoute;
            } catch (error) {
              console.warn(
                `Unable to calculate delivery route for order ${order.id}`,
                error
              );

              /*
               * Fallback route.
               * This guarantees the driver and delivery marker
               * are still visually connected even if OSRM fails.
               */

              const distanceKm = haversineDistanceKm(
                driver.latitude,
                driver.longitude,
                order.delivery_latitude,
                order.delivery_longitude
              );

              const averageSpeedKmh = 25;

              return {
                driverId: driver.id,
                orderId: order.id,
                coordinates: [
                  [
                    driver.latitude,
                    driver.longitude,
                  ],
                  [
                    order.delivery_latitude,
                    order.delivery_longitude,
                  ],
                ],
                distanceKm,
                durationMinutes:
                  (distanceKm / averageSpeedKmh) * 60,
                updatedAt: Date.now(),
              } satisfies DeliveryRoute;
            }
          })
        );

        if (!cancelled) {
          setDeliveryRoutes(results);
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    };

    fetchDeliveryRoutes();

    /*
     * Recalculate every 10 seconds.
     *
     * This works together with the telemetry stream:
     * driver coordinates change → route is recalculated.
     */

    const interval = window.setInterval(
      fetchDeliveryRoutes,
      10000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeDeliveryPairs]);

  /* ─────────────────────────────────────────
     Route lookup helpers
     ───────────────────────────────────────── */

  const getDeliveryRoute = (
    driverId: number,
    orderId: number
  ) =>
    deliveryRoutes.find(
      (route) =>
        route.driverId === driverId &&
        route.orderId === orderId
    );

  /* ─────────────────────────────────────────
     Render
     ───────────────────────────────────────── */

  return (
    <div
      style={{
        height,
        width: "100%",
        position: "relative",
      }}
      className="rounded-lg overflow-hidden border border-outline-variant/30"
    >
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{
          height: "100%",
          width: "100%",
        }}
        scrollWheelZoom={true}
      >
        <MapRecenter
          center={mapCenter}
          zoom={zoom}
        />

        {/* OpenStreetMap - No API key required */}

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ─────────────────────────────────────
            Planned Routes
        ───────────────────────────────────── */}

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

        {/* ─────────────────────────────────────
            Dynamic Rerouted Routes
        ───────────────────────────────────── */}

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

        {/* ─────────────────────────────────────
            Driver → Delivery Actual Road Routes
        ───────────────────────────────────── */}

        {deliveryRoutes.map((route) => {
          if (route.coordinates.length < 2) {
            return null;
          }

          return (
            <Polyline
              key={`delivery-route-${route.driverId}-${route.orderId}`}
              positions={route.coordinates}
              pathOptions={{
                color: "#FACC15",
                weight: 5,
                opacity: 0.95,
              }}
            />
          );
        })}

        {/* ─────────────────────────────────────
            Driver Markers
        ───────────────────────────────────── */}

        {drivers.map((driver) => (
          <Marker
            key={`driver-${driver.id}`}
            position={[
              driver.latitude,
              driver.longitude,
            ]}
            icon={createDriverIcon(
              driver,
              selectedDriverId === driver.id
            )}
            eventHandlers={{
              click: () => {
                if (onSelectDriver) {
                  onSelectDriver(driver);
                }
              },
            }}
          >
            <Popup>
              <div className="p-1 text-left font-sans min-w-[180px]">
                <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-1 mb-1">
                  <span className="font-bold text-xs text-white">
                    {driver.name}
                  </span>

                  <span className="font-mono text-[10px] text-[#60A5FA] bg-[#2563EB]/20 px-1 py-0.5 rounded">
                    {driver.driver_code ||
                      `#DRV-${driver.id}`}
                  </span>
                </div>

                <div className="text-[11px] text-gray-300 space-y-0.5">
                  <p>
                    Capacity:{" "}
                    <b className="text-white">
                      {driver.vehicle_capacity} kg
                    </b>
                  </p>

                  <p>
                    Status:{" "}
                    <span className="capitalize">
                      {driver.status}
                    </span>
                  </p>

                  <p className="font-mono text-[10px] text-gray-400">
                    {driver.latitude.toFixed(4)},{" "}
                    {driver.longitude.toFixed(4)}
                  </p>
                </div>

                {/* Driver delivery information */}

                {orders
                  .filter(
                    (order) =>
                      order.assigned_driver_id ===
                        driver.id &&
                      order.delivery_status !==
                        "delivered" &&
                      order.delivery_status !==
                        "cancelled"
                  )
                  .map((order) => {
                    const deliveryRoute =
                      getDeliveryRoute(
                        driver.id,
                        order.id
                      );

                    return (
                      <div
                        key={`driver-order-${order.id}`}
                        className="mt-2 pt-2 border-t border-outline-variant/30"
                      >
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">
                          Active Delivery
                        </div>

                        <div className="text-xs font-bold text-white mt-0.5">
                          {order.order_number ||
                            `#ORD-${order.id}`}
                        </div>

                        {deliveryRoute && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex justify-between gap-3">
                              <span className="text-gray-400">
                                Distance
                              </span>
                              <b className="text-[#FACC15]">
                                {formatDistance(
                                  deliveryRoute.distanceKm
                                )}
                              </b>
                            </div>

                            <div className="flex justify-between gap-3">
                              <span className="text-gray-400">
                                ETA
                              </span>
                              <b className="text-[#34D399]">
                                {formatDuration(
                                  deliveryRoute.durationMinutes
                                )}
                              </b>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {onRecalculateRoute && (
                  <button
                    onClick={() =>
                      onRecalculateRoute(driver.id)
                    }
                    className="mt-2 w-full bg-[#2563EB] hover:bg-[#3B82F6] text-white py-1 px-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>
                      Recalculate Optimal Route
                    </span>
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ─────────────────────────────────────
            Order Pickup Markers
        ───────────────────────────────────── */}

        {orders.map((order) => (
          <Marker
            key={`pickup-${order.id}`}
            position={[
              order.pickup_latitude,
              order.pickup_longitude,
            ]}
            icon={createPickupIcon(order)}
          >
            <Popup>
              <div className="p-1 text-left">
                <span className="font-bold text-xs text-white">
                  Pickup:{" "}
                  {order.order_number ||
                    `#ORD-${order.id}`}
                </span>

                <p className="text-[11px] text-gray-300 mt-1">
                  Weight: {order.weight} kg | Priority:{" "}
                  {order.priority}
                </p>

                {order.pickup_address && (
                  <p className="text-[10px] text-gray-400">
                    {order.pickup_address}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ─────────────────────────────────────
            Order Delivery Markers
        ───────────────────────────────────── */}

        {orders.map((order) => {
          const assignedDriver =
            order.assigned_driver_id !== null &&
            order.assigned_driver_id !== undefined
              ? drivers.find(
                  (driver) =>
                    driver.id ===
                    order.assigned_driver_id
                )
              : undefined;

          const deliveryRoute =
            assignedDriver
              ? getDeliveryRoute(
                  assignedDriver.id,
                  order.id
                )
              : undefined;

          return (
            <Marker
              key={`delivery-${order.id}`}
              position={[
                order.delivery_latitude,
                order.delivery_longitude,
              ]}
              icon={createDeliveryIcon(order)}
            >
              <Popup>
                <div className="p-1 text-left min-w-[190px]">
                  <span className="font-bold text-xs text-white">
                    Delivery:{" "}
                    {order.order_number ||
                      `#ORD-${order.id}`}
                  </span>

                  <p className="text-[11px] text-gray-300 mt-1">
                    Status:{" "}
                    <b className="capitalize">
                      {order.delivery_status}
                    </b>
                  </p>

                  {order.delivery_address && (
                    <p className="text-[10px] text-gray-400">
                      {order.delivery_address}
                    </p>
                  )}

                  {assignedDriver && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/30">
                      <p className="text-[10px] text-gray-400">
                        Driver
                      </p>

                      <p className="text-xs font-bold text-white">
                        {assignedDriver.name}
                      </p>
                    </div>
                  )}

                  {deliveryRoute && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/30 space-y-1">
                      <div className="flex justify-between gap-3 text-[10px]">
                        <span className="text-gray-400">
                          Road Distance
                        </span>

                        <b className="text-[#FACC15]">
                          {formatDistance(
                            deliveryRoute.distanceKm
                          )}
                        </b>
                      </div>

                      <div className="flex justify-between gap-3 text-[10px]">
                        <span className="text-gray-400">
                          Travel Time
                        </span>

                        <b className="text-[#34D399]">
                          {formatDuration(
                            deliveryRoute.durationMinutes
                          )}
                        </b>
                      </div>
                    </div>
                  )}

                  {order.delivery_deadline && (
                    <p className="text-[10px] text-yellow-400 mt-2">
                      Deadline:{" "}
                      {new Date(
                        order.delivery_deadline
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ─────────────────────────────────────────
          Top Route Status
      ───────────────────────────────────────── */}

      {activeDeliveryPairs.length > 0 && (
        <div className="absolute top-2 right-2 z-[1000] bg-[#172033]/95 backdrop-blur-sm px-3 py-2 rounded border border-[#26354A] shadow-lg">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                routeLoading
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-green-400"
              }`}
            />

            <span className="font-mono text-[10px] text-white uppercase tracking-wide">
              {routeLoading
                ? "CALCULATING ROAD ROUTE"
                : "ROAD ROUTE LIVE"}
            </span>
          </div>

          <div className="font-mono text-[9px] text-gray-400 mt-1">
            {activeDeliveryPairs.length} active delivery
            {activeDeliveryPairs.length !== 1
              ? " routes"
              : " route"}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────
          Map Legend
      ───────────────────────────────────────── */}

      <div className="absolute bottom-2 left-2 z-[1000] bg-[#172033]/90 backdrop-blur-xs px-2 py-1.5 rounded border border-[#26354A] font-mono-micro text-[10px] flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block" />
          <span>Planned</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block" />
          <span>Dynamic</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-[#FACC15] inline-block" />
          <span>Driver → Delivery</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" />
          <span>Pickup</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" />
          <span>Delivery</span>
        </div>
      </div>
    </div>
  );
};

export default FleetMap;
