import React, { useEffect, useState } from "react";
import axios from "axios";
// NOTE: useAuth is commented out in this one-file context since it relies on an external file structure
// import { useAuth } from "../context/AuthContext"; 
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000/api";

// Placeholder hook since the actual context file isn't available
const useAuth = () => {
    const token = localStorage.getItem("token");
    // Simulate user object based on token existence
    const user = token ? { id: 'simulated_user_id', username: 'EmployeeUser' } : null;
    return { user };
}

const EmployeeReportList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  // UPDATED STATE: Replaced filterDate with filterFromDate and filterToDate
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Get token outside fetchReports to ensure it's captured
  const token = localStorage.getItem("token");

  const fetchReports = async () => {
    // Use the token for auth instead of user?.id check, as user object is simulated here
    if (!token) {
        setError("Authentication token missing. Please log in.");
        setLoading(false);
        return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.get(
        `${API_URL}/reports/employee/me`,
        {
          headers: { Authorization: `Bearer ${token}` }, // Added headers for authentication
          params: {
            // UPDATED PARAMS: Sending fromDate and toDate
            fromDate: filterFromDate,
            toDate: filterToDate,
            status: filterStatus,
          },
        }
      );
      setReports(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Added token and filters as dependencies so search runs on initial load AND filter changes
    // Removed direct call to fetchReports from buttons to rely on useEffect for consistency after state change
    if (token) {
        fetchReports();
    } else {
        setError("Authentication required.");
        setLoading(false);
    }
    // Added filter states to dependency array so search automatically updates on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFromDate, filterToDate, filterStatus, token]);


  // UPDATED handleReset: Clear both date filters
  const handleReset = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("");
    // The fetch will be automatically triggered by the useEffect dependency array
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "OnTime":
        return "bg-green-100 text-green-700"; // Success/On Time
      case "Late":
        return "bg-red-100 text-red-700"; // Late
      case "QA":
        return "bg-blue-100 text-blue-700"; // Review/Pending QA
      case "HUL":
        return "bg-yellow-100 text-yellow-700"; // Holding for Upload
      case "FUL":
        return "bg-indigo-100 text-indigo-700"; // Final Upload/Completed
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const summarizeReport = (text) => {
    if (!text) return '—';
    try {
      const afterY = text.split('Yesterday task:')[1] || '';
      const y = afterY.split('Today task:')[0]?.trim();
      const afterT = text.split('Today task:')[1] || '';
      const t = afterT.split('Problem:')[0]?.trim();
      const p = (text.split('Problem:')[1] || '').trim();
      const parts = [y, t, p].filter(Boolean);
      return parts.length ? parts.join(', ') : text;
    } catch { return text; }
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
    <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans">
        {/* Tailwind Setup */}
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>{`body { font-family: 'Inter', sans-serif; }`}</style>
        
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <h2 className="text-3xl font-extrabold text-gray-900">
          My Report List
        </h2>
        <button
          onClick={() => navigate("/employee/dashboard")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center shadow-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Dashboard
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
        {/* UPDATED GRID: Changed to grid-cols-4 to fit two dates, status, and buttons */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-6">
            
            {/* From Date Filter */}
            <div className="flex flex-col">
                <label htmlFor="fromDate" className="text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                    id="fromDate"
                    type="date"
                    value={filterFromDate}
                    onChange={(e) => setFilterFromDate(e.target.value)}
                    className="border border-gray-300 rounded-lg p-3 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
            </div>

            {/* To Date Filter */}
            <div className="flex flex-col">
                <label htmlFor="toDate" className="text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                    id="toDate"
                    type="date"
                    value={filterToDate}
                    onChange={(e) => setFilterToDate(e.target.value)}
                    className="border border-gray-300 rounded-lg p-3 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
            </div>

          {/* Status Filter */}
          <div className="flex flex-col">
             <label htmlFor="status" className="text-sm font-medium text-gray-700 mb-1">Status</label>
             <select
                id="status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg p-3 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
             >
                <option value="">All Status</option>
                <option value="OnTime">On Time</option>
                <option value="Late">Late Report</option>
                <option value="QA">QA Fine</option>
                <option value="HUL">Half Unpaid Leave</option>
                <option value="FUL">Full Unpaid Leave</option>
             </select>
          </div>

          {/* Buttons */}
          <div className="flex flex-col pt-6 md:pt-0 justify-end"> {/* Align buttons at the bottom on desktop */}
            <div className="flex gap-2 w-full">
                <button
                  // Fetch reports directly on click (though useEffect also handles state changes)
                  onClick={fetchReports} 
                  className="flex-1 bg-indigo-600 text-white rounded-lg p-3 hover:bg-indigo-700 transition font-semibold shadow-md"
                >
                  Search
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 bg-gray-300 text-gray-800 rounded-lg p-3 hover:bg-gray-400 transition font-semibold shadow-md"
                >
                  Reset
                </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-indigo-600 text-lg font-medium animate-pulse">
            Loading reports...
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-4 text-red-600 font-medium bg-red-50 border border-red-300 rounded-lg mx-auto max-w-lg shadow-sm">
          {error}
        </div>
      )}

      {/* No Data */}
      {!loading && !error && reports.length === 0 && (
        <div className="text-center py-8 text-gray-600 font-medium bg-white rounded-lg shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.25 10.375h3.375M13.5 19.5V12m0 0a3 3 0 0 0-3-3H6.75a3 3 0 0 0-3 3v2.25l2.625 2.625m3.15-4.125l-2.625 2.625M19.5 19.5h-15m5.25 0v-2.25m1.5-2.25V12m0-3.75h1.5A1.125 1.125 0 0 1 15 8.375v1.5m-3 7.5h-1.5A1.125 1.125 0 0 1 9.75 16.125v-1.5m-3-7.5h1.5A1.125 1.125 0 0 1 8.25 7.125v1.5m4.5 10.125v-2.25M6.75 19.5h10.5" />
          </svg>
          No reports found matching your current filters.
        </div>
      )}

      {/* Desktop Table */}
      {!loading && !error && reports.length > 0 && (
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow-lg">
          <table className="min-w-full">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
              <tr>
                <th className="p-4 text-left">Date</th>
                <th className="p-4 text-left">Report Content</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
              {reports.map((report) => (
                <tr
                  key={report.id}
                  className="hover:bg-gray-50 transition"
                  onClick={() => navigate(`/employee/report/${report.id}`)}
                >
                  <td className="p-4 font-medium">
                    {formatYMD(report.report_date)}
                  </td>
                  <td className="p-4 max-w-xs truncate text-sm text-gray-600">
                    {summarizeReport(report.report_text)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusStyle(report.compliance_status)}`}
                    >
                      {report.compliance_status}
                    </span>
                  </td>
                  <td className="p-4 text-indigo-600 font-medium cursor-pointer hover:text-indigo-800">
                    View Details
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card View */}
      {!loading && !error && reports.length > 0 && (
        <div className="md:hidden space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white p-4 rounded-lg shadow border border-gray-100 cursor-pointer hover:shadow-md transition duration-150"
              onClick={() => navigate(`/employee/report/${report.id}`)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-gray-500 font-medium">
                  Report Date: {formatYMD(report.report_date)}
                </span>
                {/* Fixed mobile status styling to use getStatusStyle helper */}
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusStyle(report.compliance_status)}`}
                >
                  {report.compliance_status}
                </span>
              </div>
              <p className="text-gray-700 text-sm mt-2 line-clamp-2">
                {summarizeReport(report.report_text)}
              </p>
              <p className="text-indigo-600 text-xs font-medium mt-3 text-right">
                  Tap to view full report &rarr;
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeReportList;
