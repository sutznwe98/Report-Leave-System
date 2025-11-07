import React from "react";
// Assuming this path is correct for your project
import { useAuth } from "../context/AuthContext";

const NavBar = () => {
  const { isAuthenticated, user } = useAuth();

  // Guard clause for unauthenticated state
  if (!isAuthenticated || !user) {
    return (
      <header className="bg-white shadow-md p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        <div className="text-red-500">Please log in.</div>
      </header>
    );
  }

  // Determine dashboard title based on user role
  const getDashboardTitle = () => {
    const role = user.role ? user.role.toLowerCase() : '';
    switch (role) {
      case 'admin':
        return 'Super Admin Dashboard';
      case 'pj lead':
        return 'PJ Lead Dashboard';
      case 'employee':
      default:
        return 'Employee Dashboard';
    }
  };

  return (
    <header className="bg-white shadow-md p-4 flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{getDashboardTitle()}</h1>
      </div>
      <div>
        <span className="text-gray-600 font-bold">Welcome, {user.employee_name || user.name}</span>
      </div>
    </header>
  );
};

export default NavBar;
