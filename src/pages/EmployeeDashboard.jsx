import React, { useState, useEffect, useCallback } from "react";
import {
  Send,
  Calendar,
  FileText,
  GaugeCircle,
  CheckSquare,
  Clock,
  Users,
  XCircle,
  Plane,
  Briefcase,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000/api";

// StatCard Component
const StatCard = ({
  title,
  value,
  icon: Icon,
  colorClass,
  onClick,
  description,
}) => (
  <div
    className={`bg-white p-6 rounded-xl shadow-lg border-l-4 ${colorClass} transition duration-300 hover:shadow-xl hover:scale-[1.01] cursor-pointer`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">
        {title}
      </p>
      <Icon
        className={`w-6 h-6 ${colorClass
          .replace("border-", "text-")
          .replace("-4", "")}`}
      />
    </div>
    <div className="mt-1 flex items-end justify-between">
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
  </div>
);

const EmployeeDashboard = () => {
  const [employeeStats, setEmployeeStats] = useState(null);
  const [reportStats, setReportStats] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [missedReports, setMissedReports] = useState(0);
  const [morningDue, setMorningDue] = useState(false);
  const [alertType, setAlertType] = useState(null); // 'due' or 'ful'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));
  const userId = user?.id;

  const navigate = useNavigate();

  const createAutomaticUPL = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const newLeavePayload = {
        employee_id: userId,
        leave_type: "UPL",
        start_date: todayStr,
        end_date: todayStr,
        reason: "Automatic UPL for not submitting morning report.",
        backup_person: "System Generated",
        status: "Approved",
      };

      await axios.post(`${API_URL}/leaves`, newLeavePayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Return true to indicate success, which will trigger a refetch
      return true;
    } catch (leaveError) {
      // If the error is a 409 Conflict, it means the leave already exists.
      // This is an expected outcome if the effect runs multiple times.
      if (leaveError.response && leaveError.response.status === 409) {
        console.log("Automatic UPL already exists for today.");
      } else {
        console.error("Failed to auto-create UPL:", leaveError);
      }
      return false;
    }
  }, [token, userId]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!token || !userId) {
        setError("Authentication required. Please login again.");
        setLoading(false);
        navigate("/login");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const reqs = [
          axios.get(`${API_URL}/stats/employee/${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/stats/employee/${userId}/reports`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/leaves/employee/me`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { id: userId },
          }),
          axios
            .get(`${API_URL}/reports/employee/${userId}/today`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch((e) => ({ data: null, status: e?.response?.status || 500 })),
          axios.get(`${API_URL}/reports/employee/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ];

        
        const [employeeRes, reportRes, leavesRes, todayRes, myReportsRes] =
          await Promise.all(reqs);

        setEmployeeStats(employeeRes.data);
        setReportStats(reportRes.data);
        setLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);

        const reports = Array.isArray(myReportsRes.data)
          ? myReportsRes.data
          : [];

        const today = new Date();
        const sameLocalDate = (dt) => {
          if (!dt) return false;
          const d = new Date(dt);
          if (isNaN(d.getTime())) return false;
          return (
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          );
        };

        // Determine if today report exists from today endpoint
        const hasTodayFromEndpoint = Boolean(
          todayRes &&
            todayRes.status === 200 &&
            todayRes.data &&
            (Array.isArray(todayRes.data) ? todayRes.data.length > 0 : true)
        );

        // Fallback: scan full list
        const hasTodayFromList = reports.some(
          (r) =>
            sameLocalDate(r.report_date) ||
            sameLocalDate(r.submission_time) ||
            sameLocalDate(r.created_at)
        );

        const isReportMissing = !(hasTodayFromEndpoint || hasTodayFromList);
        setMorningDue(isReportMissing);

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        if (isReportMissing) {
          if (hours > 12 || (hours === 12 && minutes >= 30)) { // After 12:30 PM
            setAlertType('ful'); // Full Unpaid Leave
          } else if (hours > 11 || (hours === 11 && minutes >= 30)) { // After 11:30 AM
            setAlertType('due'); // Report is due
          }
        }

        // Automatically create UPL if report is missing after 12:30 PM
        if (
          isReportMissing &&
          (hours > 12 || (hours === 12 && minutes >= 30))
        ) {
          const alreadyHasUPL = leaves.some(
            (leave) =>
              leave.leave_type === "UPL" &&
              leave.start_date.slice(0, 10) ===
                new Date().toISOString().slice(0, 10) &&
              leave.reason === "Automatic UPL for not submitting morning report."
          );

          if (!alreadyHasUPL) {
            // We attempt to create it. The backend will prevent duplicates.
            await createAutomaticUPL();
          }
        }

        const missed = reports.filter(
          (r) => (r.compliance_status || "").toUpperCase() === "UPL"
        ).length;
        setMissedReports(missed);
        setLoading(false);
      } catch (err) {
        console.error(
          "API Fetch Error:",
          err.response?.data?.message || err.message
        );
        setEmployeeStats(null);
        setReportStats(null);
        setError(
          err.response?.data?.message || "Failed to fetch data. Server error."
        );
        setLoading(false);
      }
    };

    fetchStats();

    // The dependency array is simplified. We don't want this effect to re-run
    // when createAutomaticUPL changes. It should only run on initial load
    // or when the user/token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userId]);

  // Loading Screen
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

  // Error Screen
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
          and the routes are correct.
        </p>
      </div>
    );
  }

  const formatYMD = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-gray-50 font-sans">
      <script src="https://cdn.tailwindcss.com"></script>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`body { font-family: 'Inter', sans-serif; }`}</style>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6">
        <h2 className="text-3xl font-extrabold text-gray-900">Dashboard</h2>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => navigate("/employee/submit-report")}
            className={`flex-1 md:flex-initial px-4 py-2 bg-blue-600 text-white rounded-md flex items-center justify-center ${
              morningDue && alertType === "ful"
                ? "cursor-not-allowed bg-gray-400"
                : "hover:bg-blue-700"
            }`}
            disabled={morningDue && alertType === "ful"}
          >
            <Send className="w-4 h-4 mr-2" /> Add Report
          </button>
          <button
            onClick={() => navigate("/employee/request-leave")}
            className="flex-1 md:flex-initial px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Leave
          </button>
        </div>
      </div>

      {morningDue && alertType === 'due' && (
        <div className="p-4 mb-6 border border-red-300 bg-red-50 text-red-700 rounded-md">
          <div className="font-semibold">Morning Report Due!</div>
          <div className="text-sm">
            You have not submitted your morning report for today. Please submit
            it as soon as possible.
          </div>
        </div>
      )}

      {morningDue && alertType === 'ful' && (
        <div className="p-4 mb-6 border border-red-400 bg-red-100 text-red-800 rounded-md">
          <div className="font-semibold">Morning Report Past Due</div>
          <div className="text-sm">You did not submit your report on time. This will be marked as a full unpaid leave.</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {(() => {
          const total = Number(employeeStats?.totalAL || 0);
          const remaining = Number(employeeStats?.remainingAL || 0);
          const taken = Math.max(0, total - remaining);
          return (
            <div className="bg-white p-5 rounded-lg shadow border">
              <div className="text-sm text-gray-500">Annual Leave Taken</div>
              <div className="text-2xl font-bold mt-1">
                {taken} / {total}
              </div>
            </div>
          );
        })()}
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
                  const statusBadge = (
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700`}
                    >
                      Pending
                    </span>
                  );
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
                      <td className="px-5 py-3">{statusBadge}</td>
                    </tr>
                  );
                })}
              {leaves.filter(
                (l) => (l.status || "").toLowerCase() === "pending"
              ).length === 0 && (
                <tr>
                  <td
                    colSpan="5"
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

      <div className="md:hidden fixed bottom-4 right-4 z-10">
        <button
          onClick={() => navigate("/employee/submit-report")}
          className="p-4 bg-green-600 text-white rounded-full shadow-2xl hover:bg-green-700"
        >
          <Send className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
