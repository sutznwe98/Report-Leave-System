import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import {
  BuildingIcon,
  UsersIcon,
  FileTextIcon,
  CalendarIcon,
  CheckSquareIcon,
  LogOutIcon,
} from "./Icons";

const SideBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [birthdayCount, setBirthdayCount] = useState(0);
  const [annualCount, setAnnualCount] = useState(0);

  // API base
  const API_URL = "http://localhost:5000/api";

  // Robust role detection: roles may be 'admin', 'super admin', 'project lead', etc.
  const userRole = user && user.role ? user.role.toString().toLowerCase() : "";
  const isAdmin = userRole.includes('admin');
  const isPJLead = userRole.includes('pj') && userRole.includes('lead');

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
    {
      name: "Birthday",
      path: "/admin/birthdays",
      icon: <UsersIcon className="w-5 h-5" />,
      badge: () => birthdayCount,
    },
    {
      name: "Annual",
      path: "/admin/annual",
      icon: <CalendarIcon className="w-5 h-5" />,
      badge: () => annualCount,
    },
    {
      name: "QA",
      path: "/admin/qa",
      icon: <CheckSquareIcon className="w-5 h-5" />,
    },
  ];

  const pjLeadLinks = [
    {
      name: "Dashboard",
      path: "/pj-lead/dashboard",
      icon: <BuildingIcon className="w-5 h-5" />,
    },
    {
      name: "Employees Leave Records",
      path: "/pj-lead/team-leave-requests",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
    {
      name: "Submit Report",
      path: "/pj-lead/submit-report",
      icon: <FileTextIcon className="w-5 h-5" />,
    },
    {
      name: "Request Leave",
      path: "/pj-lead/request-leave",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
    {
      name: "Leave Records",
      path: "/pj-lead/leave-records",
      icon: <CalendarIcon className="w-5 h-5" />,
    },
    {
      name: "My Reports",
      path: "/pj-lead/report-list",
      icon: <UsersIcon className="w-5 h-5" />,
    },
    {
      name: "My QA Records",
      path: "/pj-lead/qa",
      icon: <CheckSquareIcon className="w-5 h-5" />,
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
    {
      name: "My QA Records",
      path: "/employee/qa",
      icon: <CheckSquareIcon className="w-5 h-5" />,
    },

  ];

  // Select the correct set of links based on user role
  const navLinks = isAdmin
    ? adminLinks
    : isPJLead
      ? pjLeadLinks
      : employeeLinks;

  useEffect(() => {
    // Only fetch counts for admin users
    if (!isAdmin) return;

    let mounted = true;
    const fetchCounts = async () => {
      try {
        const token = window.localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const [bRes, aRes] = await Promise.all([
          axios.get(`${API_URL}/notifications/birthdays`, { headers }),
          axios.get(`${API_URL}/notifications/annual`, { headers }),
        ]);
        if (!mounted) return;

        // Rows returned for birthdays/annual (fallback to [] when missing)
        const bRows = bRes.data?.rows || (Array.isArray(bRes.data) ? bRes.data : []);
        const aRows = aRes.data?.rows || (Array.isArray(aRes.data) ? aRes.data : []);

        // For each row, determine whether current admin already sent a wish for that employee
        const filterUnsent = async (rows, occasion) => {
          if (!rows || rows.length === 0) return 0;
          const checks = await Promise.all(rows.map(async (r) => {
            try {
              const res = await axios.get(`${API_URL}/notifications/wishes/${r.id}`, { headers });
              const wishRows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
              const sentByMe = wishRows.some(w => Number(w.created_by) === Number(user?.id) && (w.occasion === occasion || (w.occasion === undefined && String(w.message_template || w.message || '').toLowerCase().includes(occasion === 'birthday' ? 'happy birthday' : 'anniversary'))));
              return sentByMe ? 0 : 1;
            } catch (e) {
              return 1; // if we can't verify, keep it counted
            }
          }));
          return checks.reduce((s, v) => s + v, 0);
        };

        const [bCountRaw, aCountRaw] = await Promise.all([
          filterUnsent(bRows, 'birthday'),
          filterUnsent(aRows, 'anniversary'),
        ]);

        // Debug: log what the server returned vs computed unsent counts
        console.debug('Sidebar: birthdays rows=', Array.isArray(bRows) ? bRows.length : 0, 'annual rows=', Array.isArray(aRows) ? aRows.length : 0, 'computed unsent(b,a)=', bCountRaw, aCountRaw);

        // Fallback: if filterUnsent returned 0 but server returned rows, show the raw row count
        const finalB = (bCountRaw && bCountRaw > 0) ? bCountRaw : (Array.isArray(bRows) ? bRows.length : 0);
        const finalA = (aCountRaw && aCountRaw > 0) ? aCountRaw : (Array.isArray(aRows) ? aRows.length : 0);

        setBirthdayCount(finalB);
        setAnnualCount(finalA);
      } catch (err) {
        console.warn('Could not fetch notification counts for sidebar badges', err.message || err);
      }
    };

    fetchCounts();

    const interval = setInterval(fetchCounts, 1000 * 60 * 5); // refresh every 5 minutes
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAdmin, user?.id]);

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
              `flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors duration-200 text-sm font-medium ${isActive
                ? "bg-blue-600 text-white"
                : "hover:bg-slate-700 hover:text-white"
              }`
            }
          >
            <div className="flex items-center">
              <span className="mr-3">{link.icon}</span>
              <span>{link.name}</span>
            </div>
            {typeof link.badge === 'function' && link.badge() > 0 && (
              <span className="ml-3 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                {link.badge()}
              </span>
            )}
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
