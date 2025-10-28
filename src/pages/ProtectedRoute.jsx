import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return <p>Loading authentication...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ✅ FIX: Guard undefined roles
  if (allowedRoles && !allowedRoles.some(role => user.role?.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
