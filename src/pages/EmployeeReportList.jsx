import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000/api";

const EmployeeReportList = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  // UPDATED STATE: Replaced filterDate with filterFromDate and filterToDate
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // token comes from AuthContext; fallback to localStorage for safety
  const authToken = token || localStorage.getItem("token");

  const fetchReports = async () => {
    if (!authToken || !user?.id) {
      setError("Authentication required. Please log in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.get(`${API_URL}/reports/employee/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          id: typeof user.id === "string" ? parseInt(user.id, 10) : user.id,
          fromDate: filterFromDate,
          toDate: filterToDate,
          status: filterStatus,
        },
      });
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
    if (authToken && user?.id) {
      fetchReports();
    } else {
      setError("Authentication required.");
      setLoading(false);
    }
    // Added filter states to dependency array so search automatically updates on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFromDate, filterToDate, filterStatus, authToken, user?.id]);

  // UPDATED handleReset: Clear both date filters
  const handleReset = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("");
    // The fetch will be automatically triggered by the useEffect dependency array
  };

  const handleOpenModal = (report) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "OnTime":
        return "bg-green-100 text-green-700"; // On time
      case "QA":
        return "bg-yellow-100 text-yellow-700"; // QA fine (late but <= 10:00)
      case "HUL":
        return "bg-orange-100 text-orange-700"; // Half unpaid leave (10:01-12:30)
      case "UPL":
        return "bg-red-100 text-red-700"; // Full unpaid leave (after 12:30)
      default:
        return "bg-gray-100 text-gray-500";
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

  const parseSections = (text) => {
    if (!text) return [{ label: null, content: 'No content available' }];
    const s = String(text).replace(/\r\n/g, '\n');
    const regex = /(Yesterday task:|Today task:|Problem:)/gi;
    let match;
    const indices = [];
    while ((match = regex.exec(s)) !== null) {
      indices.push({ idx: match.index, label: match[0] });
    }
    if (indices.length === 0) return [{ label: null, content: s }];
    const parts = [];
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i].idx;
      const label = indices[i].label.replace(/:$/,'');
      const end = i + 1 < indices.length ? indices[i+1].idx : s.length;
      const content = s.slice(start + indices[i].label.length, end).trim();
      parts.push({ label: label.trim(), content });
    }
    if (indices[0].idx > 0) {
      const leading = s.slice(0, indices[0].idx).trim();
      if (leading) parts.unshift({ label: null, content: leading });
    }
    return parts;
  };

  const formatYMD = (dt) => {
    if (!dt) return "-";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "-";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatTime = (dt) => {
    if (!dt) return "-";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "-";
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${String(h).padStart(2, "0")}:${mm} ${ampm}`;
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans">
      {/* Tailwind Setup */}
      <script src="https://cdn.tailwindcss.com"></script>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`body { font-family: 'Inter', sans-serif; }`}</style>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <h2 className="text-3xl font-extrabold text-gray-900">
          My Report List
        </h2>
        {/* <button
          onClick={() => navigate("/employee/dashboard")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center shadow-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Dashboard
        </button> */}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
        {/* UPDATED GRID: Changed to grid-cols-4 to fit two dates, status, and buttons */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-6">
          {/* From Date Filter */}
          <div className="flex flex-col">
            <label
              htmlFor="fromDate"
              className="text-base font-medium text-gray-700 mb-1"
            >
              From Date
            </label>
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
            <label
              htmlFor="toDate"
              className="text-sm font-medium text-gray-700 mb-1"
            >
              To Date
            </label>
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
            <label
              htmlFor="status"
              className="text-sm font-medium text-gray-700 mb-1"
            >
              Status
            </label>
            <select
              id="status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg p-3 w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            >
              <option value="">All Status</option>
              <option value="OnTime">On Time</option>
              <option value="QA">QA Fine</option>
              <option value="HUL">Half Unpaid Leave</option>
              <option value="UPL">Full Unpaid Leave</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex flex-col pt-6 md:pt-0 justify-end">
            {" "}
            {/* Align buttons at the bottom on desktop */}
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
                className="flex-1 bg-red-600 text-white rounded-lg p-3 hover:bg-red-700 transition font-semibold shadow-md"
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
                <th className="p-4 text-left">Time</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 transition">
                  <td className="p-4 font-medium">
                    {formatYMD(report.report_date)}
                  </td>
                  <td className="p-4 max-w-xs truncate text-sm text-gray-600">
                    {summarizeReport(report.report_text)}
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {formatTime(
                      report.submission_time ||
                        report.created_at ||
                        report.report_date
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusStyle(
                        report.compliance_status
                      )}`}
                    >
                      {report.compliance_status}
                    </span>
                  </td>
                  <td
                    onClick={() => handleOpenModal(report)}
                    className="p-4 text-indigo-600 font-medium cursor-pointer hover:text-indigo-800"
                  >
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
                  className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusStyle(
                    report.compliance_status
                  )}`}
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
      {/* Report Detail Modal */}
      {isModalOpen && selectedReport && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleCloseModal}></div>
            <div className="relative w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-2xl font-bold text-gray-900">Report Details</h3>
                <button
                  onClick={handleCloseModal}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  <div className="py-2 border-b border-gray-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-medium text-gray-600">
                          Date
                        </div>
                        <div className="text-sm font-semibold text-gray-800">
                          {formatYMD(selectedReport.report_date)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-600">
                          Time
                        </div>
                        <div className="text-sm font-semibold text-gray-800">
                          {formatTime(
                            selectedReport.submission_time ||
                              selectedReport.created_at ||
                              selectedReport.report_date
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-medium text-gray-600">
                        Status
                      </div>
                      <div className="mt-1">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            selectedReport.compliance_status === "OnTime"
                              ? "bg-green-100 text-green-700"
                              : selectedReport.compliance_status === "QA"
                              ? "bg-yellow-100 text-yellow-700"
                              : selectedReport.compliance_status === "HUL"
                              ? "bg-orange-100 text-orange-700"
                              : selectedReport.compliance_status === "UPL"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {selectedReport.compliance_status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">
                      Report Content
                    </h4>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                        {parseSections(selectedReport.report_text).map((sec, idx) => (
                          <div key={idx} className="mb-4">
                            {sec.label && (
                              <div className="text-lg font-semibold text-gray-800 mb-1">{sec.label}:</div>
                            )}
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{sec.content || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeReportList;
