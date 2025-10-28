import React from "react";
// Assuming this path is correct for your project
import { useAuth } from "../context/AuthContext"; 

const NavBar = () => {
  // CORRECT: Call the hook inside the functional component
  const { user, isAuthenticated, loading: authLoading, token } = useAuth();

  // Guard clause for loading state (good practice)
  if (authLoading) {
    return (
      <header className="bg-white shadow-md p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
        <div className="text-gray-400">Loading user info...</div>
      </header>
    );
  }
  
  // Guard clause for unauthenticated state (good practice)
  if (!isAuthenticated || !user) {
     return (
        <header className="bg-white shadow-md p-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
          <div className="text-red-500">Please log in.</div>
        </header>
     );
  }

  // Render when authenticated and user data is available
  return (
    <header className="bg-white shadow-md p-4 flex justify-between items-center">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
      </div>
      <div>
        <span className="text-gray-600">Welcome, {user.name}</span>
      </div>
    </header>
  );
};

export default NavBar;
