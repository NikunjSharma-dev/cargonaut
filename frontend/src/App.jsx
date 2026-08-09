import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import DriversPage from './pages/DriversPage'
import FleetPage from './pages/FleetPage'
import HubsPage from './pages/HubsPage'
import TrackingPage from './pages/TrackingPage'
import GeofencesPage from './pages/GeofencesPage'
import ShiftsPage from './pages/ShiftsPage'
import MaintenancePage from './pages/MaintenancePage'
import DispatchPage from './pages/DispatchPage'
import AnalyticsPage from './pages/AnalyticsPage'
import DriverViewPage from './pages/DriverViewPage'
import SettingsPage from './pages/SettingsPage'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<DashboardPage />} />
          <Route path="orders"      element={<OrdersPage />} />
          <Route path="dispatch"    element={<DispatchPage />} />
          <Route path="tracking"    element={<TrackingPage />} />
          <Route path="geofences"   element={<GeofencesPage />} />
          <Route path="drivers"     element={<DriversPage />} />
          <Route path="shifts"      element={<ShiftsPage />} />
          <Route path="driver-view" element={<DriverViewPage />} />
          <Route path="fleet"       element={<FleetPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="hubs"        element={<HubsPage />} />
          <Route path="analytics"   element={<AnalyticsPage />} />
          <Route path="settings"    element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
