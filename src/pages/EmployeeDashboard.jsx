import React, { useState, useEffect, useCallback, useRef } from "react";
import { Send, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://localhost:5000/api";

const EmployeeDashboard = () => {
  const [employeeStats, setEmployeeStats] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [missedReports, setMissedReports] = useState(0);
  const [morningDue, setMorningDue] = useState(false);
  const [alertType, setAlertType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { user, token } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const redirectRef = useRef(false);

  const formatYMD = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Auto-create UPL if morning report is missed
  const createAutomaticUPL = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const payload = {
        employee_id: userId,
        leave_type: "UPL",
        start_date: todayStr,
        end_date: todayStr,
        reason: "Automatic UPL for not submitting morning report.",
        backup_person: "System Generated",
        status: "Approved",
      };
      await axios.post(`${API_URL}/leaves`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch (err) {
      if (err.response?.status === 409)
        console.log("Automatic UPL already exists.");
      else console.error("Failed to auto-create UPL:", err);
      return false;
    }
  }, [token, userId]);

  useEffect(() => {
    const fetchDashboard = async () => {
      // FIX: Removed manual navigation and redirectRef logic.
      // Rely on the parent ProtectedRoute to handle navigation/redirection.
      if (!token || !userId) {
        // If unauthenticated, stop fetching and exit. ProtectedRoute will handle redirect.
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [employeeRes, leavesRes, myReportsRes, todayRes] =
          await Promise.all([
            axios.get(`${API_URL}/stats/employee/${userId}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            axios.get(`${API_URL}/leaves/employee/me`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { id: userId },
            }),
            axios.get(`${API_URL}/reports/employee/me`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            axios
              .get(`${API_URL}/reports/employee/${userId}/today`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              .catch((e) => ({
                data: null,
                status: e?.response?.status || 500,
              })),
          ]);

        setEmployeeStats(employeeRes.data);
        const allLeaves = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        setLeaves(allLeaves);

        const reports = Array.isArray(myReportsRes.data)
          ? myReportsRes.data
          : [];
        const today = new Date();
        const sameLocalDate = (dt) => {
          if (!dt) return false;
          const d = new Date(dt);
          return (
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          );
        };

        const hasTodayFromEndpoint =
          todayRes?.status === 200 &&
          todayRes.data &&
          (Array.isArray(todayRes.data) ? todayRes.data.length > 0 : true);

        const hasTodayFromList = reports.some(
          (r) =>
            sameLocalDate(r.report_date) ||
            sameLocalDate(r.submission_time) ||
            sameLocalDate(r.created_at)
        );

        const reportMissing = !(hasTodayFromEndpoint || hasTodayFromList);
        setMorningDue(reportMissing);

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        if (reportMissing) {
          if (hours > 12 || (hours === 12 && minutes >= 30))
            setAlertType("ful");
          else if (hours > 11 || (hours === 11 && minutes >= 30))
            setAlertType("due");

          if (hours > 12 || (hours === 12 && minutes >= 30)) {
            const alreadyHasUPL = allLeaves.some(
              (l) =>
                l.leave_type === "UPL" &&
                l.start_date.slice(0, 10) ===
                  today.toISOString().slice(0, 10) &&
                l.reason === "Automatic UPL for not submitting morning report."
            );
            if (!alreadyHasUPL) await createAutomaticUPL();
          }
        }

        const missed = reports.filter(
          (r) => (r.compliance_status || "").toUpperCase() === "UPL"
        ).length;
        setMissedReports(missed);
        setLoading(false);
      } catch (err) {
        console.error("API Fetch Error:", err);
        setError(
          err.response?.data?.message || "Failed to fetch dashboard data."
        );
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [token, userId, navigate, createAutomaticUPL]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans text-center">
        <h1 className="text-4xl font-extrabold text-indigo-800 mb-8 pt-10">
          Employee Dashboard
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

  if (error) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-gray-50 font-sans text-center">
        <div className="p-6 rounded-xl bg-red-100 border border-red-400 text-red-700 font-bold mt-20 inline-block shadow-lg">
          <XCircle className="inline w-5 h-5 mr-2" />
          {error}
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Please ensure your API server is running on{" "}
          <code className="font-mono text-gray-800">http://localhost:5000</code>
        </p>
      </div>
    );
  }

  const totalAL = Number(employeeStats?.totalAL || 0);
  const remainingAL = Number(employeeStats?.remainingAL || 0);
  const takenAL = Math.max(0, totalAL - remainingAL);

  return (
    <div className="p-6 md:p-8 min-h-screen bg-gray-50 font-sans">


      {/* Alerts */}
      {morningDue && alertType === "due" && (
        <div className="p-4 mb-6 border border-red-300 bg-red-50 text-red-700 rounded-md">
          <div className="font-semibold">Morning Report Due!</div>
          <div className="text-sm">
            You have not submitted your morning report. Please submit it ASAP.
          </div>
        </div>
      )}
      {morningDue && alertType === "ful" && (
        <div className="p-4 mb-6 border border-red-400 bg-red-100 text-red-800 rounded-md">
          <div className="font-semibold">Morning Report Past Due</div>
          <div className="text-sm">
            You did not submit your report on time. This will be marked as a
            full unpaid leave.
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Annual Leave</div>
          <div className="text-2xl font-bold mt-1">
            {totalAL} Days
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Remaining Annual Leave</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {remainingAL} Days
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Unpaid Leave</div>
          <div className="text-2xl font-bold mt-1">
            {
              leaves.filter((l) => (l.leave_type || "").toUpperCase() === "UPL")
                .length
            }
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Medical Leave</div>
          <div className="text-2xl font-bold mt-1">
            {
              leaves.filter((l) => (l.leave_type || "").toUpperCase() === "ML")
                .length
            }
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Missed Reports</div>
          <div className="text-2xl font-bold mt-1 text-red-600">
            {missedReports}
          </div>
        </div>
      </div>

      {/* Recent Leave Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-5 border-b">
          <div className="text-xl font-bold">Recent Leave Requests</div>
          <div className="text-sm text-gray-500">
            A quick look at your recent leave statuses.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm">
                <th className="px-5 py-3">From Date</th>
                <th className="px-5 py-3">To Date</th>
                <th className="px-5 py-3">Leave Days Count</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {leaves
                .filter((l) => (l.status || "").toLowerCase() === "pending")
                .slice(0, 5)
                .map((l) => {
                  const start = l.start_date ? new Date(l.start_date) : null;
                  const end = l.end_date ? new Date(l.end_date) : null;
                  const days =
                    start && end
                      ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
                      : 0;
                  return (
                    <tr key={l.id} className="border-t text-sm">
                      <td className="px-5 py-3">
                        {start ? formatYMD(start) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {end ? formatYMD(end) : "—"}
                      </td>
                      <td className="px-5 py-3">{days}</td>
                      <td className="px-5 py-3">{l.reason || "—"}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 text-xs rounded-full border text-gray-700 bg-gray-50">
                          {l.leave_type || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                          Pending
                        </span>
                      </td>
                    </tr>
                  );
                })}
              {leaves.filter(
                (l) => (l.status || "").toLowerCase() === "pending"
              ).length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-5 py-6 text-center text-sm text-gray-500"
                  >
                    No pending leave requests found.
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

export default EmployeeDashboard;
