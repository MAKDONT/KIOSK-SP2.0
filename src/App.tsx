import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import KioskView from "./components/KioskView";
import Login from "./components/Login";
import FacultyDashboard from "./components/FacultyDashboard";
import StudentTracking from "./components/StudentTracking";
import AdminDashboard from "./components/AdminDashboard";
import StaffLogin from "./components/StaffLogin";
import AdminLogin from "./components/AdminLogin";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/kiosk" element={<KioskView />} />
          <Route path="/faculty/:id" element={<FacultyDashboard />} />
          <Route path="/student/:id" element={<StudentTracking />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          {/* Redirect old routes */}
          <Route path="/faculty" element={<Navigate to="/staff/login" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
