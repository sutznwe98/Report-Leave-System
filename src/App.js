import React from "react";
import { Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeManagement from "./pages/EmployeeManagement";
import MorningReports from "./pages/MorningReports";
import SubmitReport from "./pages/SubmitReport";
import RequestLeave from "./pages/RequestLeave";
import LeaveRecords from "./pages/LeaveRecords";
import EmployeeReportList from "./pages/EmployeeReportList";
import LeaveRequestDetail from "./pages/LeaveRequestDetail"; // ✅ Import fixed
import EmployeeReportDetail from "./pages/EmployeeReportDetail";

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

// Protected route wrapper
const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        Loading...
      </div>
    );

  if (!user) return <Navigate to="/login" replace />;

  const userRole = user.role.toLowerCase();

  return allowedRoles.includes(userRole) ? (
    <Layout>
      <Outlet />
    </Layout>
  ) : (
    <Navigate to="/" replace />
  );
};

// Wrapper to extract :id param for leave detail page
const LeaveDetailWrapper = () => {
  const { id } = useParams(); // Get ID from URL
  return <LeaveRequestDetail leaveId={id} />; // Pass to component
};

// Wrapper for employee report detail page
const EmployeeReportDetailWrapper = () => {
  const { id } = useParams();
  return <EmployeeReportDetail reportId={id} />;
};

// Redirect root path based on role
const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = user.role.toLowerCase() === "admin";
  return (
    <Navigate
      to={isAdmin ? "/admin/dashboard" : "/employee/dashboard"}
      replace
    />
  );
};

// Main Routes
const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        Loading application...
      </div>
    );

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Admin Routes */}
      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/employees" element={<EmployeeManagement />} />
        <Route path="/admin/reports" element={<MorningReports />} />
        <Route path="/admin/leaves" element={<LeaveRecords />} />
        <Route path="/admin/leaves/:id" element={<LeaveDetailWrapper />} />
      </Route>

      {/* Employee Routes */}
      <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
        <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
        <Route path="/employee/submit-report" element={<SubmitReport />} />
        <Route path="/employee/request-leave" element={<RequestLeave />} />
        <Route path="/employee/leave-records" element={<LeaveRecords />} />
        <Route path="/employee/report-list" element={<EmployeeReportList />} />
        <Route path="/employee/report/:id" element={<EmployeeReportDetailWrapper />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;
