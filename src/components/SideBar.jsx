import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  BuildingIcon,
  UsersIcon,
  FileTextIcon,
  CalendarIcon,
  LogOutIcon,
} from "./Icons";

const SideBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // This is the critical check. It ensures we correctly identify the admin role.
  const isAdmin = user && user.role && user.role.toLowerCase() === "admin";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const adminLinks = [
    {
      name: "Dashboard",
      path: "/admin/dashboard",
      icon: <BuildingIcon className="w-5 h-5" />,
    },
    {
      name: "Employees",
      path: "/admin/employees",
      icon: <UsersIcon className="w-5 h-5" />,
    },
    {
      name: "Reports",
      path: "/admin/reports",
      icon: <FileTextIcon className="w-5 h-5" />,
    },
    {
      name: "Leaves",
      path: "/admin/leaves",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
  ];

  const employeeLinks = [
    {
      name: "Dashboard",
      path: "/employee/dashboard",
      icon: <BuildingIcon className="w-5 h-5" />,
    },
    {
      name: "Submit Report",
      path: "/employee/submit-report",
      icon: <FileTextIcon className="w-5 h-5" />,
    },
    {
      name: "Request Leave",
      path: "/employee/request-leave",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
    {
      name: "Leave Records",
      path: "/employee/leave-records",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
    {
      name: "My Reports",
      path: "/employee/report-list",
      icon: <UsersIcon className="w-5 h-5" />,
    },
  ];

  // This line uses the 'isAdmin' check to select the correct set of links.
  const navLinks = isAdmin ? adminLinks : employeeLinks;

  return (
    <aside className="flex flex-col w-64 bg-slate-900 text-slate-300">
      <div className="flex items-center justify-center h-16 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white tracking-wider">EMS</h1>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navLinks.map((link) => (
          <NavLink
            key={link.name}
            to={link.path}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 rounded-lg transition-colors duration-200 text-sm font-medium ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "hover:bg-slate-700 hover:text-white"
              }`
            }
          >
            <span className="mr-3">{link.icon}</span>
            {link.name}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="flex items-center w-full px-4 py-2.5 rounded-lg hover:bg-red-500 hover:text-white transition-colors duration-200 text-sm font-medium"
        >
          <LogOutIcon className="w-5 h-5 mr-3" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default SideBar;
