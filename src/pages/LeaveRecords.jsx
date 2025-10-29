import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000/api";

const LeaveRecords = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [leavesAll, setLeavesAll] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [error, setError] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const fetchLeavesFromServer = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const endpoint =
        user.role.toLowerCase() === "admin"
          ? `${API_URL}/leaves`
          : `${API_URL}/leaves/employee/me`;

      const [leavesRes, employeesRes] = await Promise.all([
        axios.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          params: user.role.toLowerCase() === "admin" ? {} : { id: user.id },
        }),
        axios.get(`${API_URL}/employees`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const employeesRaw = Array.isArray(employeesRes.data)
        ? employeesRes.data
        : [];
      const employees = employeesRaw.map((emp) => ({
        ...emp,
        teams: Array.isArray(emp.teams)
          ? emp.teams
          : typeof emp.team === "string"
          ? emp.team.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      }));

      const byId = new Map(employees.map((e) => [e.id, e]));
      const byEmail = new Map(employees.map((e) => [e.email, e]));
      const byName = new Map(employees.map((e) => [e.name, e]));

      const enrich = (leave) => {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        const diffDays =
          Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        const possibleIds = [
          leave.employee_id,
          leave.employeeId,
          leave.user_id,
          leave.userId,
        ];
        const possibleEmails = [
          leave.employee_email,
          leave.email,
          leave.user_email,
        ];
        const possibleNames = [
          leave.employee_name,
          leave.name,
          leave.user_name,
        ];

        const foundId = possibleIds.find((id) => id && byId.get(id));
        const foundEmail = possibleEmails.find((em) => em && byEmail.get(em));
        const foundName = possibleNames.find((nm) => nm && byName.get(nm));
        const emp =
          (foundId && byId.get(foundId)) ||
          (foundEmail && byEmail.get(foundEmail)) ||
          (foundName && byName.get(foundName));

        return {
          ...leave,
          total_days: diffDays,
          employee_name:
            leave.employee_name || emp?.name || leave.employee || "Unknown",
          teams:
            Array.isArray(leave.teams) && leave.teams.length
              ? leave.teams
              : emp?.teams || [],
        };
      };

      const dataWithDays = Array.isArray(leavesRes.data)
        ? leavesRes.data.map(enrich)
        : [];
      setLeavesAll(dataWithDays);
      setLeaves(dataWithDays);
    } catch (err) {
      console.error(err);
      setError("Failed to load leave records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeavesFromServer();
  }, []);

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

  const handleSearch = () => applyFilters();

  const handleReset = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("");
    setLeaves(leavesAll);
  };

  const formatYMD = (dt) => {
    if (!dt) return "N/A";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "N/A";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const renderTeams = (obj) => {
    const arr = Array.isArray(obj?.teams)
      ? obj.teams
      : Array.isArray(obj?.employee_teams)
      ? obj.employee_teams
      : typeof obj?.team === "string"
      ? obj.team.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    return arr.length ? arr.join(", ") : "N/A";
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <h2 className="text-3xl font-extrabold text-gray-900">Leave Records</h2>
      </div>

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

      {loading && (
        <div className="text-center py-8">
          <p className="text-indigo-600 text-lg font-medium">
            Loading leave records...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-4 text-red-600 font-medium">{error}</div>
      )}

      {!loading && !error && leaves.length === 0 && (
        <div className="text-center py-8 text-gray-600 font-medium bg-white rounded-lg shadow-md">
          <p>No leave records found matching your current filters.</p>
        </div>
      )}

      {!loading && !error && leaves.length > 0 && (
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow-lg">
          <table className="min-w-full">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-left">Employee</th>
                <th className="py-3 px-4 text-left">Teams</th>
                <th className="py-3 px-4 text-left">Start</th>
                <th className="py-3 px-4 text-left">End</th>
                <th className="py-3 px-4 text-left">Leave Days Count</th>
                <th className="py-3 px-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
              {leaves.map((leave) => (
                <tr key={leave.id} className="border-t">
                  <td className="py-2 px-4">{leave.employee_name}</td>
                  <td className="py-2 px-4">{renderTeams(leave)}</td>
                  <td className="py-2 px-4">{formatYMD(leave.start_date)}</td>
                  <td className="py-2 px-4">{formatYMD(leave.end_date)}</td>
                  <td className="py-2 px-4">{leave.total_days}</td>
                  <td className="py-2 px-4">
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

      {!loading && !error && leaves.length > 0 && (
        <div className="md:hidden space-y-4">
          {leaves.map((leave) => (
            <div
              key={leave.id}
              className="bg-white p-4 rounded-lg shadow border border-gray-100"
            >
              {user.role.toLowerCase() === "admin" && (
                <>
                  <p className="text-sm font-semibold text-gray-800 mb-1">
                    {leave.employee_name || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-600 mb-1">
                    {renderTeams(leave)}
                  </p>
                </>
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
              <p className="text-gray-700 text-sm mb-3">
                <strong>Reason:</strong> {leave.reason}
              </p>
              {user.role.toLowerCase() !== "admin" && (
                <button
                  onClick={() => navigate(`/employee/leaves/${leave.id}`)}
                  className="mt-1 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  View Detail
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaveRecords;
