import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

// Simple CSV download helper (no external dependency)
const downloadCSV = (rows, filename = 'export.csv') => {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => {
      const v = r[k] ?? '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(','))
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const API_URL = "http://localhost:5000/api";

// Filename helpers
const sanitizeFilename = (name) => {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
};

const monthLabelFromDate = (dateStr) => {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) return new Date().toLocaleString('default', { month: 'short' });
    return d.toLocaleString('default', { month: 'short' });
  } catch { return new Date().toLocaleString('default', { month: 'short' }); }
};

const LeaveRecords = () => {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [leavesAll, setLeavesAll] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [leaveCounts, setLeaveCounts] = useState({ total: 0, upl: 0, al: 0, remainingAL: null, totalAL: null, totalLeaveDays: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPJ, setFilterPJ] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");
  const [error, setError] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    leaveId: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);

  const fetchLeavesFromServer = useCallback(async () => {
    // Ensure user and token are available before proceeding
    if (!user || !token) {
      setLoading(false);
      setError("Authentication token missing or user not logged in.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const endpoint =
        user.role.toLowerCase() === "admin"
          ? `${API_URL}/leaves`
          : `${API_URL}/leaves/employee/${user.id}`; // use explicit employee/:id for consistency with dashboard
          
      const [leavesRes, employeesRes] = await Promise.all([
        axios.get(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache' // Prevent caching
          },
        }),
        axios.get(`${API_URL}/employees`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
      ]);

      const employeesRaw = Array.isArray(employeesRes.data)
        ? employeesRes.data
        : [];
      const employees = employeesRaw.map((emp) => ({
        ...emp,
        teams: Array.isArray(emp.teams)
          ? emp.teams // if teams array already exists, use it
          : typeof emp.team === "string" // otherwise, parse the 'team' string
            ? emp.team
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
            : [],
      }));

      const byId = new Map(employees.map((e) => [e.id, e]));
      const byEmail = new Map(employees.map((e) => [e.email, e]));
      const byName = new Map(employees.map((e) => [e.name, e]));

      const enrich = (leave) => {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        const calendarDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const lt = (leave.leave_type || '').toUpperCase();
        // If this is a half unpaid or half medical/etc. leave, count as 0.5 per calendar day
        const diffDays = (lt === 'HUL' || lt === 'HUPL' || lt === 'HML') ? 0.5 * calendarDays : calendarDays;

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

        const employeeRole = emp?.role || 'employee';
        return {
          ...leave,
          total_days: diffDays,
          employee_role: employeeRole, // Store the employee's role
          employee_name:
            leave.employee_name || emp?.name || leave.employee || "Unknown",
          teams:
            Array.isArray(leave.teams) && leave.teams.length
              ? leave.teams
              : emp?.teams || [],
          main_project: emp.main_project_name || 'N/A',
          other_project: emp.project_assignments && emp.project_assignments.length > 0
            ? emp.project_assignments.map(p => p.project_name).join(', ')
            : 'N/A',
          // For PJ Leads, we'll set pj_lead_status to 'Approved' automatically
          pj_lead_status: employeeRole === 'pj_lead' ? 'Approved' : leave.pj_lead_status
        };
      };

      const dataWithDays = Array.isArray(leavesRes.data)
        ? leavesRes.data.map(enrich)
        : [];
      // compute counts
      const total = dataWithDays.length;
      // Compute unpaid leave in days using normalized total_days (half-day leaves have total_days = 0.5)
      const upl = dataWithDays.reduce((sum, l) => {
        const lt = (l.leave_type || '').toUpperCase();
        if (lt === 'UPL' || lt === 'HUL' || lt === 'HUPL') return sum + (Number(l.total_days) || 0);
        return sum;
      }, 0);
      const al = dataWithDays.filter(l => (l.leave_type || '').toUpperCase() === 'AL').length;
      const totalLeaveDays = dataWithDays.reduce((sum, l) => sum + (l.total_days || 0), 0);

      let remainingAL = null;
      let totalAL = null;
      // For non-admin users, try to fetch stats endpoint to get remainingAL and totalAL
      if (user.role.toLowerCase() !== 'admin') {
        try {
          const statsRes = await axios.get(`${API_URL}/stats/employee/${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
          remainingAL = statsRes.data?.remainingAL ?? statsRes.data?.remaining_annual_leave ?? null;
          totalAL = statsRes.data?.totalAL ?? statsRes.data?.total_annual_leave ?? null;
        } catch (statErr) {
          // ignore - leave remainingAL/totalAL as null
        }
      }

      // If the user is within their first 3 months, annual leave should be 0
      try {
        const currentEmp = employees.find(e => String(e.id) === String(user.id) || e.email === user.email);
        const joinedDateStr = currentEmp?.joined_date || currentEmp?.join_date || user.joined_date || user.join_date;
        if (joinedDateStr) {
          const joinDate = new Date(joinedDateStr);
          if (!isNaN(joinDate.getTime())) {
            const threeMonthsAfterJoin = new Date(joinDate);
            threeMonthsAfterJoin.setMonth(joinDate.getMonth() + 3);
            const today = new Date();
            if (today < threeMonthsAfterJoin) {
              remainingAL = 0;
              totalAL = 0;
            }
          }
        }
      } catch (e) {
        // non-fatal: leave values as-is
      }

      setLeaveCounts({ total, upl, al, remainingAL, totalAL, totalLeaveDays });
      setLeavesAll(dataWithDays);
      setLeaves(dataWithDays);
    } catch (err) {
      console.error(err);
      setError("Failed to load leave records.");
    } finally {
      setLoading(false);
    }
  }, [user, token, navigate]);

  useEffect(() => {
    fetchLeavesFromServer();
  }, [fetchLeavesFromServer]);

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

    if (filterPJ) {
      const q = filterPJ.toLowerCase();
      filtered = filtered.filter((l) => {
        const mp = (l.main_project || "").toString().toLowerCase();
        const other = (l.other_project || "").toString().toLowerCase();
        return mp.includes(q) || other.includes(q) || (l.main_pj_id && l.main_pj_id.toString().includes(q));
      });
    }

    if (filterEmployee) {
      const q = filterEmployee.toLowerCase();
      filtered = filtered.filter((l) => (l.employee_name || "").toLowerCase().includes(q));
    }

    setLeaves(filtered);
  };

  const handleSearch = () => applyFilters();

  const handleReset = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("");
    setFilterPJ("");
    setFilterEmployee("");
    setSelectedEmployeeName("");
    setLeaves(leavesAll);
  };

  // const handleDeleteLeaveDirect = async (id) => {
  //   setIsDeleting(true);
  //   try {
  //     console.log("Deleting leave with id:", id);
  //     await axios.delete(`${API_URL}/leaves/${id}`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     setLeaves((prev) => prev.filter((l) => l.id !== id));
  //     setLeavesAll((prev) => prev.filter((l) => l.id !== id));
  //   } catch (err) {
  //     console.error("Failed to delete leave:", err);
  //     setError(err.response?.data?.message || "Failed to delete leave record.");
  //   } finally {
  //     setIsDeleting(false);
  //   }
  // };

  const handleConfirmDelete = async () => {
    const idToDelete = confirmModal.leaveId;

    // CRITICAL: Robust check against the event object error
    if (idToDelete === null || typeof idToDelete === "object") {
      console.error(
        "CRITICAL ERROR: Invalid ID in modal state. Deletion aborted.",
        idToDelete
      );
      setError("Error: Invalid record ID for deletion.");
      closeDeleteConfirm();
      return;
    }

    setIsDeleting(true);
    try {
      console.log("Deleting leave with id:", idToDelete);
      await axios.delete(`${API_URL}/leaves/${idToDelete}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Update local state arrays
      setLeaves((prev) => prev.filter((l) => l.id !== idToDelete));
      setLeavesAll((prev) => prev.filter((l) => l.id !== idToDelete));
      // Clear any prior errors on success
      setError("");
    } catch (err) {
      console.error("Failed to delete leave:", err);
      setError(
        err.response?.data?.message ||
        `Failed to delete leave record (ID: ${idToDelete}).`
      );
    } finally {
      setIsDeleting(false);
      closeDeleteConfirm();
    }
  };

  const closeDeleteConfirm = () => {
    setConfirmModal({ isOpen: false, leaveId: null });
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
          ? obj.team
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
          : [];
    return arr.length ? arr.join(", ") : "N/A";
  };

  const handleOpenDetailModal = (leave) => {
    setSelectedLeave(leave);
    setDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedLeave(null);
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <h2 className="text-3xl font-extrabold text-gray-900">Leave Records</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              // export current filtered `leaves` as CSV
              const rows = leaves.map(l => ({
                Name: l.employee_name || 'N/A',
                'Main Project': l.main_project || '',
                'Other Project': l.other_project || '',
                Start: formatYMD(l.start_date),
                End: formatYMD(l.end_date),
                'Leave Days': l.total_days ?? '',
                Reason: l.reason || '',
                'Leave Type': l.leave_type || '',
                Status: l.status || '',
              }));
              const refDate = filterFromDate || filterToDate || new Date().toISOString();
              const monthLabel = monthLabelFromDate(refDate);
              const filename = `Leaves_${monthLabel}.csv`;
              downloadCSV(rows, filename);
            }}
            className="bg-green-600 text-white rounded-lg p-2 hover:bg-green-700 transition"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Dashboard-style counts (Remaining/Total AL, Total Leave Days) - hide for admin users */}
      {(user?.role || '').toLowerCase() !== 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-lg shadow border">
            <div className="text-sm text-gray-500">Annual Leave</div>
            <div className="text-2xl font-bold mt-1">
              <span className="text-green-600">{leaveCounts.remainingAL ?? user.remaining_annual_leave ?? '—'}</span>
              <span className="text-gray-900">/{leaveCounts.totalAL ?? user.total_annual_leave ?? '—'}</span>
              <span className="ml-2 text-sm text-gray-500">Days</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Remaining / Total</div>
          </div>

          <div className="bg-white p-5 rounded-lg shadow border">
            <div className="text-sm text-gray-500">Total Leave Days</div>
            <div className="text-2xl font-bold mt-1">{leaveCounts.totalLeaveDays} Days</div>
          </div>
          <div className="bg-white p-5 rounded-lg shadow border">
            <div className="text-sm text-gray-500">Total Unpaid Leave (UPL)</div>
            <div className="text-2xl font-bold mt-1 text-red-600">
              {leaveCounts.upl == null
                ? '—'
                : Number.isInteger(leaveCounts.upl)
                ? leaveCounts.upl
                : leaveCounts.upl.toFixed(1)}
            </div>
          </div>
        </div>
      )}

            <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700">PJ (Main Project)</label>
            <input
              type="text"
              placeholder="Project name"
              value={filterPJ}
              onChange={(e) => setFilterPJ(e.target.value)}
              className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Employee Name</label>
            <input
              type="text"
              placeholder="Employee name"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
            />
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
              className="flex-1 bg-red-600 text-white rounded-lg p-2 hover:bg-red-700 transition"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Monthly leave-days summary for selected employee (admin) */}
      {user?.role && user.role.toLowerCase() === 'admin' && (filterEmployee || selectedEmployeeName) && (
        (() => {
          const targetName = selectedEmployeeName || filterEmployee;
          // compute monthly summary from leavesAll (respecting date range if set)
          const rows = leavesAll.filter(l => {
            if (!l.employee_name) return false;
            if (!l.employee_name.toLowerCase().includes(targetName.toLowerCase())) return false;
            if (filterFromDate) {
              const start = l.start_date ? l.start_date.slice(0,10) : '';
              const end = l.end_date ? l.end_date.slice(0,10) : '';
              if (!(start >= filterFromDate || end >= filterFromDate)) return false;
            }
            if (filterToDate) {
              const start = l.start_date ? l.start_date.slice(0,10) : '';
              const end = l.end_date ? l.end_date.slice(0,10) : '';
              if (!(start <= filterToDate || end <= filterToDate)) return false;
            }
            return true;
          });

          const byMonth = {};
          let totalDays = 0;
          rows.forEach(r => {
            const d = r.start_date ? new Date(r.start_date) : new Date();
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            const days = Number(r.total_days) || 0;
            byMonth[key] = (byMonth[key] || 0) + days;
            totalDays += days;
          });

          const entries = Object.keys(byMonth).sort().map(k => {
            const [y,m] = k.split('-');
            const monthName = new Date(Number(y), Number(m)-1, 1).toLocaleString('default', { month: 'long' });
            return { key: k, label: `${monthName} ${y}`, days: byMonth[k] };
          });

          return (
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <h3 className="text-lg font-semibold mb-3">Monthly Leave Days for "{targetName}"</h3>
              <div className="text-sm text-gray-600 mb-3">Total leave days: <span className="font-bold text-gray-900">{Number.isInteger(totalDays) ? totalDays : totalDays.toFixed(1)} Days</span></div>
              {entries.length === 0 ? (
                <div className="text-sm text-gray-600">No leave records found for this employee in the selected range.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {entries.map(e => (
                    <div key={e.key} className="bg-gray-50 p-3 rounded-lg border">
                      <div className="text-sm text-gray-500">{e.label}</div>
                      <div className="text-2xl font-bold mt-1">{Number.isInteger(e.days) ? e.days : e.days.toFixed(1)} Days</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()
      )}

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
      {!loading && !error && leaves.length > 0 && (

        <div className="hidden md:block w-full overflow-x-auto bg-white rounded-xl shadow-lg">
          <table className="min-w-[1400px] w-max">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-center whitespace-nowrap sticky left-0 bg-gray-100 z-30 shadow-sm w-48">Name</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Main Project</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Other Project</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Start</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">End</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Leave Days</th>
                <th className="py-3 px-4 text-center">Reason</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Leave Type</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-center whitespace-nowrap sticky right-0 bg-gray-100 z-20 shadow-sm">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
              {leaves.map((leave) => (
                <tr key={leave.id} className="border-t">
                  <td className="py-2 px-4 whitespace-nowrap sticky left-0 bg-white z-30 w-48 border-r border-gray-100">
                      <button
                        onClick={() => navigate(`/admin/employee-leave-count/${encodeURIComponent(leave.employee_name)}`)}
                        className="text-left w-full text-indigo-600 hover:underline hover:text-indigo-800 font-semibold truncate"
                        title={`Show monthly summary for ${leave.employee_name}`}
                      >
                        {leave.employee_name}
                      </button>
                  </td>
                  <td className="py-2 px-4 whitespace-nowrap">{leave.main_project || 'N/A'}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{leave.other_project || 'N/A'}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{formatYMD(leave.start_date)}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{formatYMD(leave.end_date)}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{leave.total_days}</td>
                  <td className="py-2 px-4">{leave.reason}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{leave.leave_type}</td>
                  <td className="py-2 px-4 whitespace-nowrap">
                    {leave.status === "pending" ? (
                      <button
                        onClick={() => navigate(`/leave-request/${leave.id}`)}
                        className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
                      >
                        {leave.status}
                      </button>
                    ) : (
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          leave.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {leave.status}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-center whitespace-nowrap sticky right-0 bg-white z-10">
                    <button
                      onClick={() => handleOpenDetailModal(leave)}
                      className="text-indigo-600 hover:text-indigo-900 transition-colors font-semibold"
                    >
                      Detail
                    </button>
                    {/* {user.role.toLowerCase() === 'admin' && (
                      <button
                        onClick={() =>
                          setConfirmModal({ isOpen: true, leaveId: leave.id })
                        }
                        className="text-red-600 hover:text-red-900 transition-colors font-semibold ml-4"
                        disabled={isDeleting}
                      >
                        Delete
                      </button>
                    )} */}
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
                      <button
                        onClick={() => navigate(`/admin/employee-leave-count/${encodeURIComponent(leave.employee_name)}`)}
                        className="text-indigo-600 hover:underline"
                        title={`Show monthly summary for ${leave.employee_name}`}
                      >
                        {leave.employee_name || "Unknown"}
                      </button>
                  </p>
                  <p className="text-xs text-gray-600 mb-1">{renderTeams(leave)}</p>
                </>
              )}
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-800 font-semibold">
                  {formatYMD(leave.start_date)} - {formatYMD(leave.end_date)}
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${leave.status === "approved"
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
              <button
                onClick={() => handleOpenDetailModal(leave)}
                className="mt-1 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
              >
                View Detail
              </button>
            </div>
          ))}
        </div>
      )}
      {/* ✅ Add your confirmation modal below */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-80">
            <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this leave record?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteConfirm}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailModalOpen && selectedLeave && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleCloseDetailModal}></div>
            <div className="relative w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-2xl font-bold text-gray-900">
                  Leave Records Details
                </h3>
                <button
                  onClick={handleCloseDetailModal}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                <div className="lg:col-span-2 p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">
                    Request Information
                  </h2>

                  <div className="space-y-4">
                    {user.role.toLowerCase() === "admin" && (
                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                        <div className="text-sm font-medium text-gray-600 flex items-center">
                          <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Employee Name
                        </div>
                        <div className="text-sm font-semibold text-purple-700">
                          {selectedLeave.employee_name || "N/A"}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-600 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Leave Type
                      </div>
                      <div className="text-sm font-semibold text-gray-800">
                        {selectedLeave.leave_type}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-600 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Start Date
                      </div>
                      <div className="text-sm text-gray-800">
                        {formatYMD(selectedLeave.start_date)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-600 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        End Date
                      </div>
                      <div className="text-sm text-gray-800">
                        {formatYMD(selectedLeave.end_date)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-600 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Total Days
                      </div>
                      <div className="text-sm font-semibold text-purple-700">
                        {selectedLeave.total_days}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-600 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Status
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedLeave.status === "approved"
                        ? "bg-green-100 text-green-800"
                        : selectedLeave.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                        }`}>
                        {selectedLeave.status.charAt(0).toUpperCase() + selectedLeave.status.slice(1)}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-800 mt-8 mb-4 border-b pb-1">
                    Reason
                  </h3>
                  <p className="text-gray-700 p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-inner italic">
                    {selectedLeave.reason || "No reason provided."}
                  </p>
                </div>

                <div className="lg:col-span-1 p-6 sm:p-8 bg-gray-50">
                  {selectedLeave.medical_certificate_url && selectedLeave.leave_type === 'ML' && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">
                        Medical Certificate
                      </h3>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                        <img
                          src={`http://localhost:5000${selectedLeave.medical_certificate_url}`}
                          alt="Medical Certificate"
                          className="w-full h-auto max-h-80 object-contain p-2"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23f3f4f6%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%20font-family%3D%22Arial%22%20font-size%3D%2214%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%3EImage%20not%20found%3C%2Ftext%3E%3C%2Fsvg%3E';
                          }}
                        />
                        <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                          <a
                            href={`http://localhost:5000${selectedLeave.medical_certificate_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            Open in new tab
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRecords;