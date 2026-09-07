import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { AppLayout } from "./components/layout/AppLayout";
import { LoadingState } from "./components/common/States";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailsPage = lazy(() => import("./pages/OrderDetailsPage").then((m) => ({ default: m.OrderDetailsPage })));
const DriversPage = lazy(() => import("./pages/DriversPage").then((m) => ({ default: m.DriversPage })));
const DriverDetailsPage = lazy(() => import("./pages/DriverDetailsPage").then((m) => ({ default: m.DriverDetailsPage })));
const OptimizationPage = lazy(() => import("./pages/OptimizationPage").then((m) => ({ default: m.OptimizationPage })));
const RouteDetailsPage = lazy(() => import("./pages/RouteDetailsPage").then((m) => ({ default: m.RouteDetailsPage })));
const LiveTrackingPage = lazy(() => import("./pages/LiveTrackingPage").then((m) => ({ default: m.LiveTrackingPage })));
const DelaysPage = lazy(() => import("./pages/DelaysPage").then((m) => ({ default: m.DelaysPage })));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <LoadingState message="VERIFYING SESSION..." />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const PageLoader: React.FC = () => (
  <div className="py-8">
    <LoadingState message="LOADING OPERATIONAL VIEW..." />
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderId" element={<OrderDetailsPage />} />
              <Route path="drivers" element={<DriversPage />} />
              <Route path="drivers/:driverId" element={<DriverDetailsPage />} />
              <Route path="optimization" element={<OptimizationPage />} />
              <Route path="optimization/routes/:routeId" element={<RouteDetailsPage />} />
              <Route path="tracking" element={<LiveTrackingPage />} />
              <Route path="delays" element={<DelaysPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}