import React, { useState, useEffect, useCallback, useRef } from "react";
import { Send, XCircle, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import TodayBirthdays from "../components/TodayBirthdays";
import WishesList from "../components/WishesList";

const API_URL = "http://localhost:5000/api";

const EmployeeDashboard = () => {
  const [employeeStats, setEmployeeStats] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [qaRecords, setQaRecords] = useState([]);
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

  const fetchLeaves = useCallback(async () => {
    if (!token) return;

    try {
      const leavesRes = await axios.get(`${API_URL}/leaves/employee/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { id: userId }
      });

      console.log("Leaves fetched from API:", leavesRes.data);
      setLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);
    } catch (err) {
      console.error("Failed to fetch leaves", err);
      setError(err.response?.data?.message || "Failed to fetch leaves.");
      setLeaves([]); // Reset leaves on error
    }
  }, [token, userId]);

  const fetchQaRecords = useCallback(async () => {
    if (!token || !userId) {
      setQaRecords([]);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/employees/${userId}/qa`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQaRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch QA records:", err);
      setQaRecords([]); // Reset QA records on error
    }
  }, [token, userId]);

  const fetchDashboard = useCallback(async () => {
    if (!token || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [employeeRes, todayRes] = await Promise.all([
        axios.get(`${API_URL}/stats/employee/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios
          .get(`${API_URL}/reports/employee/${userId}/today`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch((e) => ({ data: [], status: e?.response?.status || 500 })),
      ]);

      setEmployeeStats(employeeRes.data);

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

      const hasTodayReport =
        todayRes?.status === 200 &&
        todayRes.data &&
        (Array.isArray(todayRes.data) ? todayRes.data.length > 0 : Object.keys(todayRes.data).length > 0);

      const reportMissing = !hasTodayReport;
      setMorningDue(reportMissing);

      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      if (reportMissing) {
        if (hours > 12 || (hours === 12 && minutes >= 30)) setAlertType("ful");
        else if (hours > 11 || (hours === 11 && minutes >= 30))
          setAlertType("due");
      }

      // To get missed reports, we need to fetch all reports, not just today's.
      const allReportsRes = await axios.get(`${API_URL}/reports/employee/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allReports = Array.isArray(allReportsRes.data) ? allReportsRes.data : [];
      const missed = allReports.filter((r) => (r.compliance_status || "").toUpperCase() === "UPL").length;
      setMissedReports(missed);
      setLoading(false);
    } catch (err) {
      console.error("API Fetch Error:", err);
      setError(
        err.response?.data?.message || "Failed to fetch dashboard data."
      );
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    fetchDashboard();
    fetchLeaves();
    fetchQaRecords();
  }, [fetchDashboard, fetchLeaves, fetchQaRecords]);


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

  const rawTotalAL = Number(
    employeeStats?.totalAL || user.total_annual_leave || 0
  );
  const rawRemainingAL = Number(
    employeeStats?.remainingAL || user.remaining_annual_leave || 0
  );

  // If user joined less than 3 months ago, show 0 for both total and remaining AL
  let totalAL = rawTotalAL;
  let remainingAL = rawRemainingAL;
  try {
    const joinedDateStr = user?.joined_date || user?.join_date || employeeStats?.joined_date;
    if (joinedDateStr) {
      const joinDate = new Date(joinedDateStr);
      if (!isNaN(joinDate.getTime())) {
        const threeMonthsAfterJoin = new Date(joinDate);
        threeMonthsAfterJoin.setMonth(joinDate.getMonth() + 3);
        const today = new Date();
        if (today < threeMonthsAfterJoin) {
          totalAL = 0;
          remainingAL = 0;
        }
      }
    }
  } catch (e) {
    // ignore and keep raw values
  }

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
      {/* Today's birthdays (hide current user's own birthday on their dashboard) */}
      <TodayBirthdays excludeCurrentUser={true} />

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

      {/* Messages / Wishes */}
      <WishesList />

      {/* Recent Leave Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-5 border-b">
          <div className="text-xl font-bold">Recent Leave Requests</div>
          <p className="text-sm text-gray-500">
            A quick look at your recent leave statuses.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm">
                <th className="px-5 py-3">From Date</th>
                <th className="px-5 py-3">To Date</th>
                <th className="px-5 py-3">Leave Days</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {leaves
                .slice(0, 10)
                .map((l) => {
                  const start = l.start_date ? new Date(l.start_date) : null;
                  const end = l.end_date ? new Date(l.end_date) : null;
                  let days = 0;
                  if (start && end) {
                    const MS_PER_DAY = 1000 * 60 * 60 * 24;
                    const calendarDays = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
                    const lt = (l.leave_type || '').toUpperCase();
                    days = (lt === 'HUL' || lt === 'HUPL' || lt === 'HML') ? 0.5 * calendarDays : calendarDays;
                  }
                  const status = l.admin_approval_status || l.pj_lead_status || l.status || "Pending";

                  return (
                    <tr key={l.id} className="border-t text-sm">
                      <td className="px-5 py-3">
                        {start ? formatYMD(start) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {end ? formatYMD(end) : "—"}
                      </td>
                      <td className="px-5 py-3">{days}</td>
                      <td className="px-5 py-3 truncate max-w-xs">
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
                    </tr>
                  );
                })}
              {leaves.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-6 text-center text-sm text-gray-500"
                  >
                    No leave requests found.
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
                  <td colSpan={3} className="px-5 py-6 text-center text-sm text-gray-500">
                    No QA records found.
                  </td>
                </tr>
              ) : (
                qaRecords
                  .slice(0, 10)
                  .map((qa) => {
                    const createdDate = qa.created_at ? new Date(qa.created_at) : null;
                    
                    return (
                      <tr key={qa.id} className="border-t text-sm">
                        <td className="px-5 py-3">
                          {createdDate ? formatYMD(createdDate) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            qa.qa_score >= 80 
                              ? 'bg-green-100 text-green-800' 
                              : qa.qa_score >= 60 
                                ? 'bg-yellow-100 text-yellow-800' 
                                : 'bg-red-100 text-red-800'
                          }`}>
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

export default EmployeeDashboard;
