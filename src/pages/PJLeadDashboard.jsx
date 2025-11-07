import React, { useState, useEffect, useCallback } from "react";
import { XCircle, CheckCircle, RefreshCw, Edit, Loader2 } from "lucide-react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

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
  const [approvedDays, setApprovedDays] = useState("1");
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

      // Validate response data
      if (!Array.isArray(todayResponse.data)) {
        console.warn(
          "PJ Lead leaves response is not an array:",
          todayResponse.data
        );
        setLeaves([]);
        setError(null);
      } else {
        // Filter to show only today's leave requests
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayLeaves = todayResponse.data.filter((l) => {
          if (!l.created_at && !l.start_date) return false;
          const leaveDate = l.created_at
            ? new Date(l.created_at)
            : new Date(l.start_date);
          leaveDate.setHours(0, 0, 0, 0);
          return leaveDate.getTime() === today.getTime();
        });

        setLeaves(todayLeaves);
        setAllEmployeeLeaves(
          Array.isArray(allLeavesResponse.data)
            ? allLeavesResponse.data
            : todayResponse.data
        );
        setError(null);
      }
    } catch (err) {
      console.error("Failed to fetch leaves", err);
      // If all endpoint fails, use the today's data for counting
      try {
        const response = await axios.get(`${API_URL}/api/leaves/pj-lead`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        if (Array.isArray(response.data)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayLeaves = response.data.filter((l) => {
            if (!l.created_at && !l.start_date) return false;
            const leaveDate = l.created_at
              ? new Date(l.created_at)
              : new Date(l.start_date);
            leaveDate.setHours(0, 0, 0, 0);
            return leaveDate.getTime() === today.getTime();
          });
          setLeaves(todayLeaves);
          setAllEmployeeLeaves(response.data);
        }
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

  const handlePjLeadApprove = async (leaveId, approvedDays) => {
    try {
      console.log('Making request to:', `${API_URL}/api/leaves/pj/${leaveId}`);

      const response = await axios.patch(
        `${API_URL}/api/leaves/pj/${leaveId}`,
        {
          status: 'Approved',
          approved_leave_days: approvedDays,
          approved_by_pj_lead: user.employee_name || user.name,
          pj_approval_status: 'Approved'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error in handlePjLeadApprove:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  };
  // In the render method, add this to the leave request items:
  {
    leaves.map(leave => (
      <div key={leave.id} className="border p-4 mb-4">
        {/* Existing leave info */}
        {leave.pj_approval_status === 'Pending' && (
          <div className="mt-2">
            <input
              type="number"
              min="0.5"
              step="0.5"
              className="border p-1 w-20 mr-2 text-sm"
              placeholder="Days"
              value={approvedDays}
              onChange={(e) => setApprovedDays(e.target.value)}
            />
            <button
              onClick={() => handlePjLeadApprove(leave.id, parseFloat(approvedDays || 1))}
              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => handlePjLeadReject(leave.id)}
              className="bg-red-500 text-white px-3 py-1 rounded ml-2 text-sm hover:bg-red-600 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    ))
  }

  const handlePjLeadReject = async (leaveId) => {
    try {
      console.log('Attempting to reject leave:', leaveId, 'for user:', user);
      
      const response = await axios.patch(
        `${API_URL}/api/leaves/pj/${leaveId}`,
        {
          pj_approval_status: 'Rejected',
          approved_by_pj_lead: user.employee_name || user.name || 'PJ Lead',
          // No need to send approved_leave_days for rejection
        },
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          } 
        }
      );
      
      console.log('Rejection successful:', response.data);
      
      // Show success message
      setError(null);
      
      // Refresh the list
      await fetchLeaves();
      
    } catch (error) {
      console.error('Error rejecting leave:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      
      setError(error.response?.data?.message || 'Failed to reject leave. Please try again.');
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
    } else {
      setLoading(false);
    }
  }, [user, authLoading, fetchDashboard, fetchLeaves]);

  const handleLeaveAction = async (leaveId, action, data = {}) => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      setError("No authentication token found.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (action === "delete") {
        await axios.delete(`${API_URL}/api/leaves/${leaveId}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        setConfirmDeleteModal({ isOpen: false, leaveId: null });
      } else {
        await axios.patch(
          `${API_URL}/api/leaves/pj/${leaveId}`,
          { action, ...data },
          { headers: { Authorization: `Bearer ${currentToken}` } }
        );
      }

      await fetchLeaves(); // Refresh list
      setIsEditModalOpen(false); // Close modal on success
      setSelectedLeave(null);
    } catch (err) {
      console.error(`Failed to ${action} leave`, err);
      setError(`Failed to ${action} leave status.`);
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
    setIsEditModalOpen(true);
  };

  const handleSaveChanges = (action) => {
    console.log('Save changes button clicked');
    if (selectedLeave) {
      const { id, start_date, end_date, leave_type, reason } = selectedLeave;
      handleLeaveAction(id, action, {
        start_date,
        end_date,
        leave_type,
        reason,
      });
    }
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

  // Calculate stats for the cards
  const totalAL = Number(
    employeeStats?.totalAL || user?.total_annual_leave || 12
  );
  const remainingAL = Number(
    employeeStats?.remainingAL || user?.remaining_annual_leave || 12
  );
  const takenAL = Math.max(0, totalAL - remainingAL); // Total leave days taken

  // Filter to show only pending leave requests in the table
  const pendingLeaves = leaves.filter(
    (l) => l.pj_lead_status === "Pending" || l.pj_lead_status === null
  );

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
      const timeDiff = endDate.getTime() - startDate.getTime();
      const dayDiff = Math.round(timeDiff / MS_PER_DAY) + 1;
      return dayDiff;
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
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
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
              <div>
                <p className="font-semibold text-sm text-gray-600 mb-1">
                  Project(s)
                </p>
                <p className="font-bold text-gray-900 text-lg truncate">
                  {selectedLeave.projects || "N/A"}
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
                Total Leave Days
              </label>
              <div className="w-full mt-1 p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500">
                {calculateLeaveDays(
                  selectedLeave.start_date,
                  selectedLeave.end_date
                )}
              </div>
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
              onClick={() => handleSaveChanges("Rejected")}
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
              onClick={(e) => {
                e.preventDefault(); // Prevent default form submission if inside a form
                console.log('Button clicked directly!');
                handleSaveChanges("Approved");
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <CheckCircle size={18} />
              )}
              Approve & Save
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
              <button
                onClick={fetchLeaves}
                disabled={refreshing}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  size={20}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
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
                  const days =
                    start && end
                      ? Math.ceil(
                        (end.getTime() - start.getTime()) /
                        (1000 * 60 * 60 * 24)
                      ) + 1
                      : 0;
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
    </div>
  );
};

export default PJLeadDashboard;
