import React, { useEffect } from "react";
import { Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import PJLeadDashboard from "./pages/PJLeadDashboard";
import TeamLeaveRequests from "./pages/TeamLeaveRequests";
import EmployeeManagement from "./pages/EmployeeManagement";
import EmployeeDetailPage from "./pages/EmployeeDetailPage";
import MorningReports from "./pages/MorningReports";
import SubmitReport from "./pages/SubmitReport";
import RequestLeave from "./pages/RequestLeave";
import LeaveRecords from "./pages/LeaveRecords";
import EmployeeReportList from "./pages/EmployeeReportList";
import LeaveRequestDetail from "./pages/LeaveRequestDetail";
import EmployeeReportDetail from "./pages/EmployeeReportDetail";
import AdminEmployeeReports from "./pages/AdminEmployeeReports";
import QAManagement from "./pages/QAManagement";
import EmployeeQADetail from "./pages/EmployeeQADetail";
import EmployeesBirthday from "./pages/EmployeesBirthday";
import EmployeesAnnual from "./pages/EmployeesAnnual";
import EmployeeLeaveCount from "./pages/EmployeeLeaveCount";

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

  const userRole = user && user.role ? String(user.role).toLowerCase() : "";

  if (!userRole) {
    return <Navigate to="/login" replace />;
  }

  // Determine the user's correct dashboard path for safe redirection
  const isAdmin = userRole === "admin";
  const isPJLead = userRole === "pj lead";
  const userDashboardPath = isAdmin
    ? "/admin/dashboard"
    : isPJLead
    ? "/pj-lead/dashboard"
    : "/employee/dashboard";

  // FIX: Instead of redirecting to the generic '/', which leads to the loop,
  // redirect unauthorized users directly to their designated dashboard path.
  return allowedRoles.includes(userRole) ? (
    <Layout>
      <Outlet />
    </Layout>
  ) : (
    <Navigate to={userDashboardPath} replace />
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

// Wrapper for employee detail page
const EmployeeDetailWrapper = () => {
  const { id } = useParams();
  return <EmployeeDetailPage />;
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

  const userRole = user && user.role ? String(user.role).toLowerCase() : "";
  if (!userRole) return <Navigate to="/login" replace />;

  const isAdmin = userRole === "admin";
  const isPJLead = userRole === "pj lead";
  // This logic is fine, it points '/' to the correct dashboard.
  return (
    <Navigate
      to={
        isAdmin
          ? "/admin/dashboard"
          : isPJLead
          ? "/pj-lead/dashboard"
          : "/employee/dashboard"
      }
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
        <Route
          path="/admin/employees/:id"
          element={<EmployeeDetailWrapper />}
        />{" "}
        {/* ADDED THIS ROUTE */}
        <Route path="/admin/reports" element={<MorningReports />} />
        <Route path="/admin/leaves" element={<LeaveRecords />} />
        <Route path="/admin/employee-leave-count/:employeeName" element={<EmployeeLeaveCount />} />
        <Route path="/admin/reports/employee/:id" element={<AdminEmployeeReports />} />
        <Route path="/admin/leaves/:id" element={<LeaveDetailWrapper />} />
        <Route path="/admin/birthdays" element={<EmployeesBirthday />} />
        <Route path="/admin/annual" element={<EmployeesAnnual />} />
        <Route path="/admin/qa" element={<QAManagement />} />
         <Route path="/admin/qa/:employeeId" element={<EmployeeQADetail />} />
      </Route>

      {/* Employee Routes */}
      <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
        <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
        <Route path="/employee/submit-report" element={<SubmitReport />} />
        <Route path="/employee/request-leave" element={<RequestLeave />} />
        <Route path="/employee/leave-records" element={<LeaveRecords />} />
        <Route path="/employee/report-list" element={<EmployeeReportList />} />
        <Route path="/employee/qa" element={<EmployeeQADetail />} />
        <Route
          path="/employee/report/:id"
          element={<EmployeeReportDetailWrapper />}
        />
      </Route>

      {/* PJ Lead Routes */}
      <Route element={<ProtectedRoute allowedRoles={["pj lead"]} />}>
        <Route path="/pj-lead/dashboard" element={<PJLeadDashboard />} />
        <Route
          path="/pj-lead/team-leave-requests"
          element={<TeamLeaveRequests />}
        />
        <Route path="/pj-lead/submit-report" element={<SubmitReport />} />
        <Route path="/pj-lead/request-leave" element={<RequestLeave />} />
        <Route path="/pj-lead/leave-records" element={<LeaveRecords />} />
        <Route path="/pj-lead/report-list" element={<EmployeeReportList />} />
        <Route path="/pj-lead/qa" element={<EmployeeQADetail />} />

        <Route
          path="/pj-lead/report/:id"
          element={<EmployeeReportDetailWrapper />}
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;
