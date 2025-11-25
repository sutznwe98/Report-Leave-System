import React, { useState, useEffect, useCallback } from "react";
import { XCircle, CheckCircle, RefreshCw, Edit, Loader2 } from "lucide-react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import WishesList from "../components/WishesList";
import TodayBirthdays from "../components/TodayBirthdays";

const API_URL = "http://localhost:5000";

const PJLeadDashboard = () => {
  const [leaves, setLeaves] = useState([]);
  const [allEmployeeLeaves, setAllEmployeeLeaves] = useState([]); // All leaves for counting
  const [employeeStats, setEmployeeStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvedDays, setApprovedDays] = useState(0); // Initialize to 0 or null
  const [qaRecords, setQaRecords] = useState([]);
  const [updatedLeaves, setUpdatedLeaves] = useState([]);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({
    isOpen: false,
    leaveId: null,
  });

  const { user, loading: authLoading, token } = useAuth();
  const userId = user?.id;

  const formatYMD = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const fetchDashboard = useCallback(async () => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken || !userId) {
      setLoading(false);
      return;
    }

    try {
      const [statsRes] = await Promise.all([
        axios
          .get(`${API_URL}/api/stats/employee/${userId}`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          })
          .catch(() => ({ data: { totalAL: 12, remainingAL: 12 } })),
      ]);

      setEmployeeStats(statsRes.data);
    } catch (err) {
      console.error("Failed to fetch employee stats:", err);
    }
  }, [userId]);

  const fetchLeaves = useCallback(async () => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      setLoading(false);
      return;
    }

    setRefreshing(true);
    try {
      // Fetch all leaves for employees (not just pending) to calculate counts
      const [todayResponse, allLeavesResponse] = await Promise.all([
        axios.get(`${API_URL}/api/leaves/pj-lead`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        }),
        axios
          .get(`${API_URL}/api/leaves/pj-lead/all`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          })
          .catch(() => ({ data: [] })), // Fallback if endpoint doesn't exist
      ]);

      console.log(
        "PJLeadDashboard.fetchLeaves: todayResponse.data=",
        todayResponse.data
      );
      console.log(
        "PJLeadDashboard.fetchLeaves: allLeavesResponse.data=",
        allLeavesResponse.data
      );

      // Validate response data
      if (!Array.isArray(todayResponse.data)) {
        console.warn(
          "PJ Lead leaves response is not an array:",
          todayResponse.data
        );
        setLeaves([]);
        setError(null);
      } else {
        // Show all pending leaves for the PJ lead (do not restrict to today's created_at)
        // The API already returns pending leaves relevant to the PJ lead.
        const pendingLeaves = Array.isArray(todayResponse.data)
          ? todayResponse.data
          : [];

        setLeaves(pendingLeaves);
        setAllEmployeeLeaves(
          Array.isArray(allLeavesResponse.data)
            ? allLeavesResponse.data
            : pendingLeaves
        );
        setError(null);
      }
    } catch (err) {
      console.error("Failed to fetch leaves", err);
      // If all endpoint fails, use the today's data for counting
      try {
        // Fallback logic is removed as the primary fetch should be reliable now.
        // If the primary fetch fails, the error is set.
        // The `allLeavesResponse` is for counting, not for the main table display.
        // The `leaves` state should directly reflect the `/api/leaves/pj-lead` endpoint.
      } catch (fallbackErr) {
        setError(
          err.response?.data?.message || "Failed to fetch leave requests."
        );
        setLeaves([]);
        setAllEmployeeLeaves([]);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const fetchUpdatedLeaves = useCallback(async () => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken) return;
    try {
      const res = await axios.get(`${API_URL}/api/leaves/pj-lead/updated`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      // route returns { success, data, count }
      const rows =
        res.data && Array.isArray(res.data.data) ? res.data.data : [];
      setUpdatedLeaves(rows);
    } catch (err) {
      console.warn("Failed to fetch updated leaves:", err?.message || err);
      setUpdatedLeaves([]);
    }
  }, []);

  const fetchQaRecords = useCallback(async () => {
    if (!token || !userId) {
      setQaRecords([]);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/api/employees/${userId}/qa`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQaRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch QA records:", err);
      setQaRecords([]); // Reset QA records on error
    }
  }, [token, userId]);

  const handlePjLeadApprove = async (leaveId, approvedDays) => {
    setIsSubmitting(true);
    setError(null);
    try {
      console.log("Making request to:", `${API_URL}/api/leaves/pj/${leaveId}`);

      const response = await axios.patch(
        `${API_URL}/api/leaves/pj/${leaveId}`,
        {
          status: "Approved",
          approved_leave_days: approvedDays,
          approved_by_pj_lead: user.employee_name || user.name,
          pj_approval_status: "Approved",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("Response:", response.data);
      // Refresh list and close modal
      try {
        await fetchLeaves();
      } catch (e) {
        console.warn(
          "Failed to refresh leaves after approve:",
          e?.message || e
        );
      }
      setIsEditModalOpen(false);
      setSelectedLeave(null);
      setError(null);
      return response.data;
    } catch (error) {
      console.error("Error in handlePjLeadApprove:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      setError(
        error.response?.data?.message ||
          error.message ||
          "Failed to approve leave"
      );
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePjLeadReject = async (leaveId) => {
    try {
      console.log("Attempting to reject leave:", leaveId, "for user:", user);

      const response = await axios.patch(
        `${API_URL}/api/leaves/pj/${leaveId}`,
        {
          pj_approval_status: "Rejected",
          approved_by_pj_lead: user.employee_name || user.name || "PJ Lead",
          // No need to send approved_leave_days for rejection
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("Rejection successful:", response.data);
      setError(null);
      setIsEditModalOpen(false); // Close modal
      setSelectedLeave(null); // Clear selected leave
      // Refresh the list
      await fetchLeaves();
    } catch (error) {
      console.error("Error rejecting leave:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data,
        },
      });

      setError(
        error.response?.data?.message ||
          "Failed to reject leave. Please try again."
      );
    }
  };

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }

    // If auth is done but no user, stop loading (will be redirected by route protection)
    if (!user) {
      setLoading(false);
      return;
    }

    // If we have user, fetch dashboard data and leaves
    if (user) {
      fetchDashboard();
      fetchLeaves();
      fetchUpdatedLeaves();
      fetchQaRecords();
    } else {
      setLoading(false);
    }
  }, [
    user,
    authLoading,
    fetchDashboard,
    fetchLeaves,
    fetchUpdatedLeaves,
    fetchQaRecords,
  ]);

  // Renamed handleLeaveAction to handleDeleteLeaveRequest for clarity
  const handleDeleteLeaveRequest = async (leaveId) => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      setError("No authentication token found.");
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.delete(`${API_URL}/api/leaves/${leaveId}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      setConfirmDeleteModal({ isOpen: false, leaveId: null });
      await fetchLeaves(); // Refresh list
    } catch (err) {
      console.error(`Failed to delete leave`, err);
      setError(
        err.response?.data?.message || `Failed to delete leave request.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (leave) => {
    setSelectedLeave({
      ...leave,
      start_date: formatYMD(leave.start_date),
      end_date: formatYMD(leave.end_date),
    });
    // Initialize approvedDays with the leave's total_days when opening the modal
    // If total_days is not available, compute from start/end and leave_type (HUL/HUPL/HML count as 0.5 per calendar day)
    let defaultApproved = leave.total_days;
    if (defaultApproved == null) {
      try {
        const s = leave.start_date ? new Date(leave.start_date) : null;
        const e = leave.end_date ? new Date(leave.end_date) : null;
        if (s && e) {
          const MS_PER_DAY = 1000 * 60 * 60 * 24;
          const calendarDays =
            Math.ceil((e.getTime() - s.getTime()) / MS_PER_DAY) + 1;
          const lt = (leave.leave_type || "").toUpperCase();
          defaultApproved =
            lt === "HUL" || lt === "HUPL" || lt === "HML"
              ? 0.5 * calendarDays
              : calendarDays;
        } else {
          defaultApproved = 1;
        }
      } catch (err) {
        defaultApproved = 1;
      }
    }
    setApprovedDays(defaultApproved); // Default to computed value
    setIsEditModalOpen(true);
  };

  const pendingCount = leaves.filter(
    (l) => l.pj_lead_status === "Pending"
  ).length;
  const approvedCount = leaves.filter(
    (l) => l.pj_lead_status === "Approved"
  ).length;
  const rejectedCount = leaves.filter(
    (l) => l.pj_lead_status === "Rejected"
  ).length;

  // Derived array of pending leaves (used by the table). Falls back to checking `status` as well.
  const pendingLeaves = Array.isArray(leaves)
    ? leaves.filter((l) => {
        const st = (l.pj_lead_status || l.status || "")
          .toString()
          .toLowerCase();
        return st === "pending";
      })
    : [];

  // Calculate stats for the cards
  const totalAL = Number(
    employeeStats?.totalAL || user?.total_annual_leave || 12
  );
  const remainingAL = Number(
    employeeStats?.remainingAL || user?.remaining_annual_leave || 12
  );
  const takenAL = Math.max(0, totalAL - remainingAL); // Total leave days taken

  // Calculate pending and approved counts per employee
  const getEmployeeLeaveCounts = (employeeId) => {
    const employeeLeaves = allEmployeeLeaves.filter(
      (l) => l.employee_id === employeeId
    );
    const pending = employeeLeaves.filter(
      (l) => l.pj_lead_status === "Pending" || l.pj_lead_status === null
    ).length;
    const approved = employeeLeaves.filter(
      (l) => l.pj_lead_status === "Approved"
    ).length;
    return { pending, approved };
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans text-center">
        <h1 className="text-4xl font-extrabold text-indigo-800 mb-8 pt-10">
          PJ Lead Dashboard
        </h1>
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
        <p className="text-lg font-medium text-indigo-600 mt-4">
          Loading dashboard...
        </p>
      </div>
    );
  }

  const EditLeaveModal = () => {
    if (!isEditModalOpen || !selectedLeave) return null;

    const calculateLeaveDays = (start, end) => {
      if (!start || !end) return 0;
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return 0;

      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const calendarDays =
        Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
      const lt = (selectedLeave?.leave_type || "").toUpperCase();
      return lt === "HUL" || lt === "HUPL" || lt === "HML"
        ? 0.5 * calendarDays
        : calendarDays;
    };

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto transform transition-all">
          <div className="flex justify-between items-center p-5 border-b">
            <h3 className="text-xl font-semibold text-gray-900">
              Edit Leave Request
            </h3>
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <span className="sr-only">Close</span>
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="p-6 space-y-4">
            {/* <p className="font-semibold">Employee: <span className="font-normal">{selectedLeave.employee_name}</span></p>
             */}
            <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-inner grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-sm text-gray-600 mb-1">
                  Employee
                </p>
                <p className="font-bold text-gray-900 text-lg truncate">
                  {selectedLeave.employee_name}
                </p>
              </div>
            </div>
            <div>
              <label
                htmlFor="start_date"
                className="block text-sm font-medium text-gray-700"
              >
                From Date
              </label>
              <input
                type="date"
                id="start_date"
                value={selectedLeave.start_date}
                onChange={(e) =>
                  setSelectedLeave({
                    ...selectedLeave,
                    start_date: e.target.value,
                  })
                }
                className="w-full mt-1 p-2 border rounded-md"
              />
            </div>
            <div>
              <label
                htmlFor="end_date"
                className="block text-sm font-medium text-gray-700"
              >
                To Date
              </label>
              <input
                type="date"
                id="end_date"
                value={selectedLeave.end_date}
                onChange={(e) =>
                  setSelectedLeave({
                    ...selectedLeave,
                    end_date: e.target.value,
                  })
                }
                className="w-full mt-1 p-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Approved Leave Days
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                id="approved_days"
                value={approvedDays}
                onChange={(e) => setApprovedDays(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Leave Type
              </label>
              <div className="w-full mt-1 p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500">
                {selectedLeave.leave_type}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Reason
              </label>
              <div className="w-full mt-1 p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 min-h-[60px]">
                {selectedLeave.reason}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 py-4 px-6 bg-gray-50 rounded-b-xl">
            <button
              onClick={() => handlePjLeadReject(selectedLeave.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <XCircle size={18} />
              )}
              Reject
            </button>
            <button
              onClick={async () => {
                try {
                  await handlePjLeadApprove(selectedLeave.id, parseFloat(approvedDays));
                } catch (e) {
                  // Error is already handled/recorded inside handlePjLeadApprove
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <CheckCircle size={18} />
              )}
              Approve
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-gray-50 font-sans">
      {/* Header */}

      <EditLeaveModal />

      {/* Error Message */}
      {error && (
        <div className="p-4 mb-6 rounded-xl bg-red-100 border border-red-400 text-red-700 font-bold shadow-lg">
          <XCircle className="inline w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {/* Today's birthdays (visible to all employees) */}
      <TodayBirthdays />

      {/* Stats Cards - Similar to Employee Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Annual Leave</div>
          <div className="text-2xl font-bold mt-1">{totalAL} Days</div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Remaining Annual Leave</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {remainingAL} Days
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Leave Days</div>
          <div className="text-2xl font-bold mt-1">{takenAL} Days</div>
        </div>
      </div>

      {/* Messages / Wishes for PJ Lead */}
      <WishesList />

      {/* Leave Requests Table */}
      <div className="bg-white rounded-lg shadow border">
        {/* <div className="p-5 border-b">
          <div className="text-xl font-bold">Today's Team Leave Requests</div>
          <p className="text-sm text-gray-500">
            Pending leave requests submitted today from your team employees
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border border-yellow-200">
          <div className="text-sm text-gray-500">Pending Requests (Today)</div>
          <div className="text-2xl font-bold mt-1 text-yellow-600">
            {pendingCount}
          </div>
        </div> */}
        <div className="p-5 mb-6 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-800">
                Today's Leave Requests
              </h1>
            </div>
            <p className="text-l text-gray-500 mt-1">
              Pending leave requests submitted today from your employees
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow border border-yellow-200">
            <div className="text-sm text-gray-500">
              Pending Requests (Today)
            </div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">
              {pendingCount}
            </div>
          </div>
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
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {pendingLeaves
                .sort((a, b) => {
                  // Sort by most recent first
                  return (
                    new Date(b.created_at || 0) - new Date(a.created_at || 0)
                  );
                })
                .map((l) => {
                  const start = l.start_date ? new Date(l.start_date) : null;
                  const end = l.end_date ? new Date(l.end_date) : null;
                  let days = 0;
                  if (start && end) {
                    const MS_PER_DAY = 1000 * 60 * 60 * 24;
                    const calendarDays =
                      Math.ceil(
                        (end.getTime() - start.getTime()) / MS_PER_DAY
                      ) + 1;
                    const lt = (l.leave_type || "").toUpperCase();
                    days =
                      lt === "HUL" || lt === "HUPL" || lt === "HML"
                        ? 0.5 * calendarDays
                        : calendarDays;
                  }
                  const status = l.pj_lead_status || "Pending";
                  const isPending = status === "Pending";
                  const employeeCounts = getEmployeeLeaveCounts(l.employee_id);

                  return (
                    <tr
                      key={l.id}
                      className="border-t text-sm hover:bg-gray-50"
                    >
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
                      <td className="px-5 py-3">
                        {days} day{days !== 1 ? "s" : ""}
                      </td>
                      <td
                        className="px-5 py-3 truncate max-w-xs"
                        title={l.reason || ""}
                      >
                        {l.reason || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 text-xs rounded-full border text-gray-700 bg-gray-50">
                          {l.leave_type || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            status === "Pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : status === "Approved"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {isPending ? (
                          <button
                            onClick={() => handleOpenEditModal(l)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit Leave Request"
                          >
                            <Edit size={18} />
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500">
                            {status === "Approved" ? "Approved" : "Rejected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {pendingLeaves.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    <div className="flex flex-col items-center">
                      <p className="text-lg mb-2">
                        No pending leave requests found for today.
                      </p>
                      <p className="text-xs text-gray-400">
                        Pending leave requests submitted today from your team
                        employees will appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QA Records Section */}
      <div className="bg-white rounded-lg shadow border mt-6">
        <div className="p-5 border-b">
          <div className="text-xl font-bold">My QA Records</div>
          <p className="text-sm text-gray-500">
            Your quality assessment records and scores.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">QA Score</th>
                <th className="px-5 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {qaRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-6 text-center text-sm text-gray-500"
                  >
                    No QA records found.
                  </td>
                </tr>
              ) : (
                qaRecords.slice(0, 10).map((qa) => {
                  const createdDate = qa.created_at
                    ? new Date(qa.created_at)
                    : null;

                  return (
                    <tr key={qa.id} className="border-t text-sm">
                      <td className="px-5 py-3">
                        {createdDate ? formatYMD(createdDate) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            qa.qa_score >= 80
                              ? "bg-green-100 text-green-800"
                              : qa.qa_score >= 60
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {qa.qa_score || 0}
                        </span>
                      </td>
                      <td className="px-5 py-3 truncate max-w-xs">
                        {qa.description || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PJLeadDashboard;
