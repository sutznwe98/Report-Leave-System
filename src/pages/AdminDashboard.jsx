import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
// Using lucide-react for icons (assuming it's available in the environment)
import { List, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import formatRole from '../utils/formatRole';
import Swal from 'sweetalert2';
import ReportDetailModal from '../components/ReportDetailModal';

const API_URL = "http://localhost:5000/api";

const AdminDashboard = () => {
  const [leaves, setLeaves] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const { user } = useAuth();

  const navigate = useNavigate();

  // Helper to get today's date in YYYY-MM-DD
  const todayDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

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

  const isToday = (dateString) => {
    const today = new Date();
    const date = new Date(dateString);
    return date.toDateString() === today.toDateString();
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
          axios.get(`${API_URL}/reports?include_projects=true`, { headers }),
          axios.get(`${API_URL}/employees`, { headers }),
        ]);

        const employeesRaw = Array.isArray(employeesRes.data)
          ? employeesRes.data
          : [];
        const employees = employeesRaw.map((emp) => ({
          ...emp,
          // Correctly parse the 'team' string from the DB into a 'teams' array
          teams:
            typeof emp.team === "string"
              ? emp.team
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
              : Array.isArray(emp.teams)
                ? emp.teams
                : [],
        }));

        const byId = new Map(employees.map((e) => [e.id, e]));
        const byEmail = new Map(employees.map((e) => [e.email, e]));
        const byName = new Map(employees.map((e) => [e.name, e]));

        const enrichWithEmployee = (row) => {
          const emp =
            byId.get(row.employee_id) ||
            byEmail.get(row.employee_email) ||
            byName.get(row.employee_name);
          if (!emp) return row;
          return {
            ...row,
            employee_name: row.employee_name || emp.name || "-",
            main_project: emp.project || row.main_project || "-",
            other_projects: emp.other_project || row.other_projects || "None",
            role: emp.role || row.role || "-",  // Add role field
            teams: Array.isArray(row.teams) && row.teams.length
              ? row.teams
              : emp.teams || [],
          };
        };

        const leavesData = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        const reportsData = Array.isArray(reportsRes.data)
          ? reportsRes.data
          : [];

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
    if (!dt) return "-";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "-";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
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
    .filter(
      (r) =>
        isSameLocalDate(r.report_date) ||
        isSameLocalDate(r.submission_time) ||
        isSameLocalDate(r.created_at)
    )
    .sort(
      (a, b) =>
        new Date(b.submission_time || b.report_date || b.created_at) -
        new Date(a.submission_time || a.report_date || a.created_at)
    );

  // Determine which reports to display and what the count should be
  const reportsToDisplay = reports
    .filter(r => isToday(r.report_date) || isToday(r.submission_time) || isToday(r.created_at))
    .sort((a, b) =>
      new Date(b.submission_time || b.report_date || b.created_at) -
      new Date(a.submission_time || a.report_date || a.created_at)
    );

  // Show all leaves that need admin attention, not just today's
  const allLeaves = [...leaves]
    .filter(leave => {
      return (
        leave.status === 'Pending' ||
        (leave.pj_lead_status === 'Approved' && leave.status !== 'Rejected')
      );
    })
    .sort((a, b) =>
      new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date)
    );

  // Show all pending leaves that need admin attention
  const pendingLeaves = allLeaves.filter(leave =>
    leave.status === 'Pending' ||
    (leave.pj_lead_status === 'Approved' && leave.status === 'Pending Admin Approval')
  );

  // Updated helper to show detailed pending status
  const getLeaveStatusBadge = (leave) => {
    const { status, pj_lead_status, admin_approval_status } = leave;

    if (status === 'Approved') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-green-100 text-green-800 border-green-300">
          Approved
        </span>
      );
    }

    if (status === 'Rejected') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-red-100 text-red-800 border-red-300">
          Rejected
        </span>
      );
    }

    if (pj_lead_status === 'Approved' && admin_approval_status === 'Pending') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-blue-100 text-blue-800 border-blue-300">
          Pending Admin Approval
        </span>
      );
    }

    if (pj_lead_status === 'Rejected') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-red-100 text-red-800 border-red-300">
          Rejected by PJ Lead
        </span>
      );
    }

    return (
      <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-yellow-100 text-yellow-800 border-yellow-300">
        Pending
      </span>
    );
  };

  const getReportStatusClasses = (status) => {
    switch ((status || "").toString().toLowerCase()) {
      case "ontime":
        return "bg-green-100 text-green-700 border-green-300";
      case "qa":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "hul":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "upl":
        return "bg-red-100 text-red-800 border-red-300";
      case "late":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "approved":
        return "bg-green-100 text-green-800 border-green-300";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-300";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };
  const handleEditLeave = async (leave) => {
    const { value: formValues } = await Swal.fire({
      title: 'Edit Leave',
      html: `
      <div class="text-left">
        <label class="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
        <select id="leaveType" class="swal2-input mb-4 w-full">
          <option value="AL" ${leave.leave_type === 'AL' ? 'selected' : ''}>Annual Leave</option>
          <option value="ML" ${leave.leave_type === 'ML' ? 'selected' : ''}>Medical Leave</option>
          <option value="UPL" ${leave.leave_type === 'UPL' ? 'selected' : ''}>Unpaid Leave</option>
        </select>
        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select id="status" class="swal2-input w-full">
          <option value="Approved" ${leave.status === 'Approved' ? 'selected' : ''}>Approve</option>
          <option value="Rejected" ${leave.status === 'Rejected' ? 'selected' : ''}>Reject</option>
          ${leave.status === 'Pending Admin Approval' ? '<option value="Pending Admin Approval" selected>Pending</option>' : ''}
        </select>
      </div>
    `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Update',
      preConfirm: () => {
        return {
          leave_type: document.getElementById('leaveType').value,
          status: document.getElementById('status').value
        };
      }
    });

    if (formValues) {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.patch(
          `${API_URL}/leaves/${leave.id}/admin-approve`,
          {
            ...formValues,
            admin_id: user.id
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        // Update the local state
        setLeaves(leaves.map(l =>
          l.id === leave.id ? { ...l, ...response.data } : l
        ));

        Swal.fire(
          'Updated!',
          'Leave request has been updated.',
          'success'
        );
      } catch (error) {
        console.error('Error updating leave:', error);
        Swal.fire(
          'Error!',
          'Failed to update leave request.',
          'error'
        );
      }
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
        : typeof obj?.team === "string"
          ? obj.team
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
          : [];
    return arr.length ? arr.join(", ") : "-";
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
      <div className="max-w-8xl mx-auto p-4 sm:p-8">
        <header className="mb-10 pt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            Welcome, {user?.employee_name || user?.name || "Admin"}
          </h1>
          <div className="h-1 w-24 bg-purple-500 rounded mt-3"></div>
        </header>

        {/* Today's birthdays removed from Admin dashboard - badge shown in sidebar instead */}

        <div className="grid grid-cols-1 gap-12">
          {/* Leaves Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <List className="w-6 h-6 mr-3 text-purple-600" />
                Leave Requests
              </h2>
              <span className="text-xl font-extrabold text-purple-600 bg-purple-100 px-4 py-1 rounded-full">
                {pendingLeaves.length}
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              {allLeaves.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-2">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No leave requests for today</h3>
                  <p className="text-gray-500 mt-1">There are no leave requests scheduled for today.</p>
                </div>
              ) : (
                <table className="w-full min-w-[900px] divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Main Project</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Other Projects</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">From Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">To Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Leave Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Days</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">PJ Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">
                    {allLeaves.map((leave) => (
                      <tr key={leave.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {leave.employee_name}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {formatRole(leave.role)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {leave.main_project || '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {leave.other_projects || 'None'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {formatYMD(leave.start_date)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {formatYMD(leave.end_date)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {leave.leave_type}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                          {(() => {
                            const lt = (leave.leave_type || '').toUpperCase();
                            const dayCount = daysInclusive(leave.start_date, leave.end_date);
                            const isHalf = lt === 'HUL' || lt === 'HUPL' || lt === 'HML';
                            const val = isHalf ? 0.5 * dayCount : dayCount;
                            return Number.isInteger(val) ? String(val) : val.toFixed(1);
                          })()}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {leave.reason || '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                          {leave.pj_lead_status === 'Approved' ? (
                            <div>
                              <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-blue-100 text-blue-800 border-blue-300">Approved by PJ Lead</span>
                              {/* <div className="text-xs text-gray-500 mt-1">{leave.approved_by_pj_lead_name || (leave.approved_by_pj_lead ? `#${leave.approved_by_pj_lead}` : '')}</div> */}
                            </div>
                          ) : leave.pj_lead_status === 'Rejected' ? (
                            <div>
                              <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-red-100 text-red-800 border-red-300">Rejected by PJ</span>
                              {/* <div className="text-xs text-gray-500 mt-1">{leave.approved_by_pj_lead_name || (leave.approved_by_pj_lead ? `#${leave.approved_by_pj_lead}` : '')}</div> */}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">—</div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getLeaveStatusBadge(leave)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleViewDetails(leave.id)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="View Details"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Reports Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <List className="w-6 h-6 mr-3 text-purple-600" />
                Morning Reports
              </h2>
              <span className="text-xl font-extrabold text-purple-600 bg-purple-100 px-4 py-1 rounded-full">
                {reportsToDisplay.length}
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              {reportsToDisplay.length > 0 ? (
                <>
                  {todaysReports.length === 0 && (
                    <div className="px-6 py-3 text-xs text-gray-500">
                      No reports for today. Showing latest 10.
                    </div>
                  )}
                  <table className="min-w-[900px] divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Report Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Main Project
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Other Projects
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reportsToDisplay.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-gray-50 transition duration-150"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {formatYMD(r.report_date) || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {r.employee_name || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {r.main_project || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {r.other_projects || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {summarizeReport(r.report_text)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs">
                            {extractTime(
                              r.submission_time || r.created_at || r.report_date
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span
                              className={`px-3 py-1 text-xs font-semibold rounded-full border ${getReportStatusClasses(
                                r.compliance_status
                              )}`}
                            >
                              {r.compliance_status || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                            <button
                              onClick={() => {
                                setSelectedReport(r);
                                setIsReportModalOpen(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="View Report"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
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
                  No compliance reports found for today.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
            {isReportModalOpen && (
              <ReportDetailModal
                isOpen={isReportModalOpen}
                onClose={() => {
                  setIsReportModalOpen(false);
                  setSelectedReport(null);
                }}
                report={selectedReport}
              />
            )}
    </div>
  );
};

export default AdminDashboard;

