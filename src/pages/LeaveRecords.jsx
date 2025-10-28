import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000/api";

const LeaveRecords = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [leavesAll, setLeavesAll] = useState([]); // raw data fetched from server
  const [leaves, setLeaves] = useState([]); // filtered data shown in UI
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [error, setError] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  // Fetch once from server (no query params) and store raw results
  const fetchLeavesFromServer = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const endpoint =
        user.role.toLowerCase() === "admin"
          ? `${API_URL}/leaves`
          : `${API_URL}/leaves/employee/me`;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const dataWithDays = response.data.map((leave) => {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1; // inclusive count
        return { ...leave, total_days: diffDays };
      });

      setLeavesAll(dataWithDays);
      setLeaves(dataWithDays); // initially show everything
    } catch (err) {
      console.error(err);
      setError("Failed to load leave records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeavesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply local filters to leavesAll
  const applyFilters = () => {
    let filtered = [...leavesAll];

    if (filterFromDate) {
      filtered = filtered.filter((l) => {
        const start = l.start_date ? l.start_date.slice(0, 10) : "";
        const end = l.end_date ? l.end_date.slice(0, 10) : "";
        return start >= filterFromDate || end >= filterFromDate;
      });
    }

    if (filterToDate) {
      filtered = filtered.filter((l) => {
        const start = l.start_date ? l.start_date.slice(0, 10) : "";
        const end = l.end_date ? l.end_date.slice(0, 10) : "";
        return start <= filterToDate || end <= filterToDate;
      });
    }

    if (filterStatus) {
      filtered = filtered.filter(
        (l) => (l.status || "").toLowerCase() === filterStatus.toLowerCase()
      );
    }

    setLeaves(filtered);
  };

  // Called when user clicks Search
  const handleSearch = () => {
    applyFilters();
  };

  const handleReset = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("");
    setLeaves(leavesAll);
  };

  const formatYMD = (dt) => {
    if (!dt) return 'N/A';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return 'N/A';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <h2 className="text-3xl font-extrabold text-gray-900">Leave Records</h2>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              From
            </label>
            <input
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              To
            </label>
            <input
              type="date"
              value={filterToDate}
              onChange={(e) => setFilterToDate(e.target.value)}
              className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
            >
              <option value="">All Status</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <button
              onClick={handleSearch}
              className="flex-1 bg-indigo-600 text-white rounded-lg p-2 hover:bg-indigo-700 transition"
            >
              Search
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-gray-300 text-gray-800 rounded-lg p-2 hover:bg-gray-400 transition"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-indigo-600 text-lg font-medium">
            Loading leave records...
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-4 text-red-600 font-medium">{error}</div>
      )}

      {/* No Data */}
      {!loading && !error && leaves.length === 0 && (
        <div className="text-center py-8 text-gray-600 font-medium bg-white rounded-lg shadow-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 mx-auto mb-2 text-gray-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.25 10.375h3.375M13.5 19.5V12m0 0a3 3 0 0 0-3-3H6.75a3 3 0 0 0-3 3v2.25l2.625 2.625m3.15-4.125l-2.625 2.625M19.5 19.5h-15m5.25 0v-2.25m1.5-2.25V12m0-3.75h1.5A1.125 1.125 0 0 1 15 8.375v1.5m-3 7.5h-1.5A1.125 1.125 0 0 1 9.75 16.125v-1.5m-3-7.5h1.5A1.125 1.125 0 0 1 8.25 7.125v1.5m4.5 10.125v-2.25M6.75 19.5h10.5"
            />
          </svg>
          No leave records found matching your current filters.
        </div>
      )}
      {/* Desktop Table */}
      {!loading && !error && leaves.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow overflow-hidden">
            <thead className="bg-gray-100 text-gray-600 uppercase text-sm">
              <tr>
                {user.role.toLowerCase() === "admin" && (
                  <th className="p-4 text-left">Employee</th>
                )}
                <th className="p-4 text-left">Reason</th>
                <th className="p-4 text-left">Start Date</th>
                <th className="p-4 text-left">End Date</th>
                <th className="p-4 text-left">Leave Type</th>
                <th className="p-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 font-semibold">
              {leaves.map((leave) => (
                <tr
                  key={leave.id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  {user.role.toLowerCase() === "admin" && (
                    <td className="p-4">{leave.employee_name || "Unknown"}</td>
                  )}
                  <td className="p-4">{leave.reason}</td>
                  <td className="p-4">
                    {formatYMD(leave.start_date)}
                  </td>
                  <td className="p-4">
                    {formatYMD(leave.end_date)}
                  </td>
                  <td className="p-4">{leave.leave_type}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        leave.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : leave.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {leave.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card View */}
      {!loading && !error && leaves.length > 0 && (
        <div className="md:hidden space-y-4">
          {leaves.map((leave) => (
            <div
              key={leave.id}
              className="bg-white p-4 rounded-lg shadow border border-gray-100"
            >
              {user.role.toLowerCase() === "admin" && (
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  {leave.employee_name || "Unknown"}
                </p>
              )}
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-800 font-semibold">
                  {formatYMD(leave.start_date)} - {formatYMD(leave.end_date)}
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    leave.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : leave.status === "pending"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {leave.status}
                </span>
              </div>
              <p className="text-gray-700 text-sm mb-1">
                <strong>Type:</strong> {leave.leave_type}
              </p>
              <p className="text-gray-700 text-sm">
                <strong>Reason:</strong> {leave.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaveRecords;
