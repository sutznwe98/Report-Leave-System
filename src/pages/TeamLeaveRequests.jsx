import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://localhost:5000/api";

const TeamLeaveRequests = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all"); // all, approved, rejected

  const { user, loading: authLoading } = useAuth();

  const formatYMD = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const fetchLeaves = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setLoading(false);
      return;
    }

    setRefreshing(true);
    try {
      const response = await axios.get(`${API_URL}/leaves/pj-lead/updated`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      // Handle the response format: { success: boolean, data: array, count: number }
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setLeaves(response.data.data);
        setError(null);
      } else {
        console.warn("Unexpected response format:", response.data);
        setLeaves([]);
        setError("Unexpected response format from server");
      }
    } catch (err) {
      console.error("Failed to fetch updated leaves", err);
      setError(err.response?.data?.message || "Failed to fetch leave requests.");
      setLeaves([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    if (user) {
      fetchLeaves();
    } else {
      setLoading(false);
    }
  }, [user, authLoading, fetchLeaves]);

  const filteredLeaves = leaves.filter((l) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "approved") return l.pj_lead_status === "Approved";
    if (filterStatus === "rejected") return l.pj_lead_status === "Rejected";
    return true;
  });

  const approvedCount = leaves.filter((l) => l.pj_lead_status === "Approved").length;
  const rejectedCount = leaves.filter((l) => l.pj_lead_status === "Rejected").length;
  const totalCount = leaves.length;

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans text-center">
        <h1 className="text-4xl font-extrabold text-indigo-800 mb-8 pt-10">
          Team Leave Requests
        </h1>
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
        <p className="text-lg font-medium text-indigo-600 mt-4">
          Loading leave requests...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Leave Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            View all updated leave requests from your team members
          </p>
        </div>
        <button
          onClick={fetchLeaves}
          disabled={refreshing}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 mb-6 rounded-xl bg-red-100 border border-red-400 text-red-700 font-bold shadow-lg">
          <XCircle className="inline w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Updated</div>
          <div className="text-3xl font-bold mt-1 text-indigo-600">
            {totalCount}
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border border-green-200">
          <div className="text-sm text-gray-500">Approved</div>
          <div className="text-3xl font-bold mt-1 text-green-600">
            {approvedCount}
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border border-red-200">
          <div className="text-sm text-gray-500">Rejected</div>
          <div className="text-3xl font-bold mt-1 text-red-600">
            {rejectedCount}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4 bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter by Status:</span>
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === "all"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilterStatus("approved")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === "approved"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilterStatus("rejected")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === "rejected"
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-5 border-b">
          <div className="text-xl font-bold">Updated Leave Requests</div>
          <p className="text-sm text-gray-500">
            Leave requests that have been approved or rejected by you
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm bg-gray-50">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">From Date</th>
                <th className="px-5 py-3">To Date</th>
                <th className="px-5 py-3">Leave Days</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Updated At</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {filteredLeaves
                .sort((a, b) => {
                  // Sort by most recently updated first
                  const dateA = new Date(a.updated_at || a.created_at || 0);
                  const dateB = new Date(b.updated_at || b.created_at || 0);
                  return dateB - dateA;
                })
                .map((l) => {
                  const start = l.start_date ? new Date(l.start_date) : null;
                  const end = l.end_date ? new Date(l.end_date) : null;
                  const days =
                    start && end
                      ? Math.ceil(
                        (end.getTime() - start.getTime()) /
                        (1000 * 60 * 60 * 24)
                      ) + 1
                      : 0;
                  const status = l.pj_lead_status || "Pending";
                  const updatedAt = l.updated_at || l.created_at;

                  return (
                    <tr key={l.id} className="border-t text-sm hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-gray-800">
                          {l.employee_name || "Unknown"}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {start ? formatYMD(start) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {end ? formatYMD(end) : "—"}
                      </td>
                      <td className="px-5 py-3">{days} day{days !== 1 ? "s" : ""}</td>
                      <td className="px-5 py-3 truncate max-w-xs" title={l.reason || ""}>
                        {l.reason || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 text-xs rounded-full border text-gray-700 bg-gray-50">
                          {l.leave_type || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${status === "Pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : status === "Approved"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {updatedAt ? formatYMD(updatedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              {filteredLeaves.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    <div className="flex flex-col items-center">
                      <p className="text-lg mb-2">
                        {filterStatus === "all"
                          ? "No updated leave requests found."
                          : `No ${filterStatus} leave requests found.`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {filterStatus === "all"
                          ? "Approved or rejected leave requests will appear here."
                          : "Try selecting a different filter."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeamLeaveRequests;

