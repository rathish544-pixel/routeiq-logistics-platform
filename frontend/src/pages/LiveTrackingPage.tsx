import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { driversApi } from "../api/drivers";
import { ordersApi } from "../api/orders";
import { optimizationApi } from "../api/optimization";
import type { Driver, Order, RouteGeometry } from "../types";
import { FleetMap } from "../components/map/FleetMap";
import { StatusBadge } from "../components/common/StatusBadge";
import { LoadingState } from "../components/common/States";
import { useWebSocket } from "../hooks/useWebSocket";

export const LiveTrackingPage: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteGeometry[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  const fetchData = async () => {
    try {
      const [drv, ord, rts] = await Promise.all([
        driversApi.list(),
        ordersApi.list(),
        optimizationApi.getRoutes(),
      ]);
      setDrivers(drv);
      setOrders(ord);

      // Deep-link support: /tracking?driver=<id>
      const wanted = searchParams.get("driver");
      if (wanted) {
        const target = drv.find((d) => d.id === parseInt(wanted, 10));
        if (target) setSelectedDriver(target);
      }

      if (rts && rts.routes) {
        const geomPromises = rts.routes.map(async (r) => {
          if (!r.orders || r.orders.length === 0) return null;
          const locs: [number, number][] = r.orders.map((o) => [o.latitude, o.longitude]);
          if (locs.length < 2) return null;
          try {
            const g = await optimizationApi.getRouteGeometry(locs);
            const points: [number, number][] = (g.coordinates || []).map((c: any) => [c[1], c[0]]);
            return { routeId: r.route_id, points };
          } catch {
            return null;
          }
        });
        const geoms = (await Promise.all(geomPromises)).filter(Boolean) as RouteGeometry[];
        setRoutes(geoms);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useWebSocket((msg) => {
    if (msg.event === "driver_location_updated") {
      const updated = msg.data;
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === updated.driver_id
            ? { ...d, latitude: updated.latitude, longitude: updated.longitude }
            : d
        )
      );
    }
  });

  if (loading && drivers.length === 0) return <LoadingState message="ENGAGING LIVE TELEMETRY RADAR..." />;

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col space-y-2 text-xs font-sans">
      <div className="flex items-center justify-between bg-surface-container-low px-3 py-1.5 rounded border border-outline-variant/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base">my_location</span>
          <span className="font-headline-sm text-sm font-bold text-on-surface">Live Fleet Tracking & Telemetry</span>
          <span className="font-mono-micro text-[10px] text-secondary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>
            RADAR ACTIVE (2s REFRESH)
          </span>
        </div>
        <div className="font-mono-micro text-[10px] text-outline">
          {drivers.length} UNITS MONITORED
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0">
        <div className="lg:col-span-9 h-full">
          <FleetMap
            drivers={drivers}
            orders={orders}
            routes={routes}
            selectedDriverId={selectedDriver?.id}
            onSelectDriver={(d) => setSelectedDriver(d)}
          />
        </div>

        <div className="lg:col-span-3 h-full bg-surface-container-low rounded-lg border border-outline-variant/20 overflow-y-auto p-2 space-y-2">
          <div className="font-mono-micro text-[10px] text-outline uppercase font-bold tracking-wider">
            Active Roster
          </div>
          {drivers.map((driver) => (
            <div
              key={driver.id}
              onClick={() => setSelectedDriver(driver)}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                selectedDriver?.id === driver.id
                  ? "bg-surface-container-high border-primary"
                  : "bg-surface-container-lowest border-outline-variant/20 hover:border-outline-variant/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-on-surface text-xs">{driver.name}</span>
                <StatusBadge status={driver.status} size="sm" />
              </div>
              <div className="font-mono text-[10px] text-outline space-y-0.5">
                <div>Code: <b className="text-primary">{driver.driver_code || `#DRV-${driver.id}`}</b></div>
                <div>Payload Max: <b>{driver.vehicle_capacity} kg</b></div>
                <div>Lat/Lon: {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
