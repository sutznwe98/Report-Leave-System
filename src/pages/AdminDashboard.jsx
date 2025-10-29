import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
// Using lucide-react for icons (assuming it's available in the environment)
import { List, CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";

const API_URL = "http://localhost:5000/api";

const AdminDashboard = () => {
  const [leaves, setLeaves] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  // Helper to get today's date in YYYY-MM-DD
  const todayDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const today = todayDate();

  const isSameLocalDate = (dt) => {
    if (!dt) return false;
    const d = new Date(dt);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  // Fetch data from API
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Authentication token missing. Please log in.");
        setLoading(false);
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [leavesRes, reportsRes, employeesRes] = await Promise.all([
          axios.get(`${API_URL}/leaves`, { headers }),
          axios.get(`${API_URL}/reports`, { headers }),
          axios.get(`${API_URL}/employees`, { headers }),
        ]);

        const employeesRaw = Array.isArray(employeesRes.data) ? employeesRes.data : [];
        const employees = employeesRaw.map((emp) => ({
          ...emp,
          teams: Array.isArray(emp.teams)
            ? emp.teams
            : (typeof emp.team === 'string'
                ? emp.team.split(',').map((t) => t.trim()).filter(Boolean)
                : []),
        }));

        const byId = new Map(employees.map((e) => [e.id, e]));
        const byEmail = new Map(employees.map((e) => [e.email, e]));
        const byName = new Map(employees.map((e) => [e.name, e]));

        const enrichWithEmployee = (row) => {
          const emp = byId.get(row.employee_id) || byEmail.get(row.employee_email) || byName.get(row.employee_name);
          if (!emp) return row;
          return {
            ...row,
            employee_name: row.employee_name || emp.name || 'N/A',
            teams: Array.isArray(row.teams) && row.teams.length ? row.teams : emp.teams || [],
          };
        };

        const leavesData = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        const reportsData = Array.isArray(reportsRes.data) ? reportsRes.data : [];

        setLeaves(leavesData.map(enrichWithEmployee));
        setReports(reportsData.map(enrichWithEmployee));
      } catch (err) {
        console.error(err);
        setError(
          err.response?.data?.message ||
            "Failed to fetch data. Check API connection."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Navigate to leave detail page
  const handleViewDetails = (leaveId) => {
    navigate(`/admin/leaves/${leaveId}`);
  };

  // Filter only today's reports
  const formatYMD = (dt) => {
    if (!dt) return "N/A";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "N/A";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const extractDate = (dateTimeString) => formatYMD(dateTimeString);

  const extractTime = (dateTimeString) => {
    if (!dateTimeString) return "—";
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return "—";

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? "0" + minutes : minutes;

    return `${hours.toString().padStart(2, "0")}:${minutesStr} ${ampm}`;
  };

  const todaysReports = reports
    .filter((r) => isSameLocalDate(r.report_date) || isSameLocalDate(r.submission_time) || isSameLocalDate(r.created_at))
    .sort((a, b) => new Date(b.submission_time || b.report_date || b.created_at) - new Date(a.submission_time || a.report_date || a.created_at));

  // Helper to determine badge colors
  const getLeaveStatusClasses = (status) => {
    switch (status?.toLowerCase()) {
      case "approved":
        return "bg-green-100 text-green-800 border-green-300";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getReportStatusClasses = (status) => {
    switch ((status || '').toString()) {
      case 'OnTime':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'QA':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'HUL':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'UPL':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'Late':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const summarizeReport = (text) => {
    if (!text) return "—";
    try {
      const afterY = text.split("Yesterday task:")[1] || "";
      const y = afterY.split("Today task:")[0]?.trim();
      const afterT = text.split("Today task:")[1] || "";
      const t = afterT.split("Problem:")[0]?.trim();
      const p = (text.split("Problem:")[1] || "").trim();
      const parts = [y, t, p].filter(Boolean);
      return parts.length ? parts.join(", ") : text;
    } catch {
      return text;
    }
  };

  const daysInclusive = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
  };

  const renderTeams = (obj) => {
    const arr = Array.isArray(obj?.teams)
      ? obj.teams
      : Array.isArray(obj?.employee_teams)
      ? obj.employee_teams
      : (typeof obj?.team === 'string'
        ? obj.team.split(',').map(t => t.trim()).filter(Boolean)
        : []);
    return arr.length ? arr.join(', ') : 'N/A';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="flex flex-col items-center p-8 bg-white rounded-xl shadow-2xl border border-indigo-200">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
          <p className="text-xl font-semibold text-gray-700">
            Loading Dashboard Data...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="p-8 bg-white rounded-xl shadow-2xl border border-red-400 max-w-lg text-center">
          <XCircle className="w-10 h-10 text-red-600 mx-auto mb-4" />
          <p className="text-xl font-bold text-red-800 mb-2">
            Error Retrieving Data
          </p>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <header className="mb-10 pt-4">
          <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
            Admin Dashboard
          </h1>
          <div className="h-1 w-24 bg-purple-500 rounded mt-3"></div>
        </header>

        <div className="grid grid-cols-1 gap-12">
          {/* Leaves Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <List className="w-6 h-6 mr-3 text-purple-600" />
                Leave Requests
              </h2>
              <span className="text-xl font-extrabold text-purple-600 bg-purple-100 px-4 py-1 rounded-full">
                {leaves.filter(l => (l.status || '').toLowerCase() === 'pending').length}
              </span>
            </div>

            <div className="p-0 overflow-x-auto max-h-96">
              {leaves.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Reason
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        End Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Leave Days Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Leave Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider w-1/4">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider w-1/6">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 font-semibold">
                    {leaves.filter(l => (l.status || '').toLowerCase() === 'pending').map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {l.employee_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {renderTeams(l)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {l.reason || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {extractDate(l.start_date) || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {extractDate(l.end_date) || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {daysInclusive(l.start_date, l.end_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {l.leave_type || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span
                            className={`px-3 py-1 text-xs font-semibold rounded-full border ${getLeaveStatusClasses(
                              l.status
                            )}`}
                          >
                            {l.status || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleViewDetails(l.id)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition duration-150 ease-in-out"
                          >
                            Details
                            <ArrowRight className="ml-1 w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="font-medium">No pending leave requests found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Reports Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <List className="w-6 h-6 mr-3 text-purple-600" />
                Compliance Reports
              </h2>
              <span className="text-xl font-extrabold text-purple-600 bg-purple-100 px-4 py-1 rounded-full">
                {todaysReports.length}
              </span>
            </div>

            <div className="p-0 overflow-x-auto max-h-96">
              {(todaysReports.length > 0 ? todaysReports : reports.slice(0, 10)).length > 0 ? (
                <>
                  {todaysReports.length === 0 && (
                    <div className="px-6 py-3 text-xs text-gray-500">No reports for today. Showing latest 10.</div>
                  )}
                  <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Report Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Report
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Report Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider w-1/4">
                        Compliance Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(todaysReports.length > 0 ? todaysReports : reports.slice(0, 10)).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {formatYMD(r.report_date) || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {r.employee_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {renderTeams(r)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {summarizeReport(r.report_text)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {extractTime(r.submission_time || r.created_at || r.report_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span
                            className={`px-3 py-1 text-xs font-semibold rounded-full border ${getReportStatusClasses(
                              r.compliance_status
                            )}`}
                          >
                            {r.compliance_status || "N/A"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="font-medium">No reports for today.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
