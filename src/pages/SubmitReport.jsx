import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Calendar,
} from "lucide-react";

const API_URL = "http://localhost:5000/api";

const SubmitReport = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [yesterdayTask, setYesterdayTask] = useState("");
  const [todayTask, setTodayTask] = useState("");
  const [problems, setProblems] = useState("");
  const [todayReport, setTodayReport] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [isEditable, setIsEditable] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const TIME_ON_TIME_CUTOFF = { hours: 9, minutes: 30 };
  const TIME_QA_CUTOFF = { hours: 10, minutes: 0 };
  const TIME_HUL_CUTOFF = { hours: 12, minutes: 30 };

  const getPotentialStatus = (date) => {
    const now = date || new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const onTimeCutoff =
      TIME_ON_TIME_CUTOFF.hours * 60 + TIME_ON_TIME_CUTOFF.minutes;
    const qaCutoff = TIME_QA_CUTOFF.hours * 60 + TIME_QA_CUTOFF.minutes;
    const hulCutoff = TIME_HUL_CUTOFF.hours * 60 + TIME_HUL_CUTOFF.minutes;

    if (nowMinutes <= onTimeCutoff) return { status: "OnTime", label: "On Time" };
    else if (nowMinutes <= qaCutoff) return { status: "QA", label: "QA" };
    else if (nowMinutes <= hulCutoff) return { status: "HUL", label: "Half Unpaid Leave (HUL)" };
    else return { status: "UPL", label: "Full Unpaid Leave (UPL)" };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "OnTime": return "bg-emerald-500";
      case "QA": return "bg-yellow-400";
      case "HUL": return "bg-[rgb(245,174,124)]";
      case "UPL": return "bg-[rgb(237,87,87)]";
      default: return "bg-gray-400";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "OnTime": return CheckCircle;
      case "UPL": return XCircle;
      default: return Clock;
    }
  };

  const getMessageClasses = (type) => {
    switch (type) {
      case "success": return "bg-green-100 text-green-800 border-green-300";
      case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "error": return "bg-red-100 text-red-800 border-red-300";
      case "info":
      default: return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
  };

  const formatSubmissionTime = (dateTimeString) => {
    if (!dateTimeString) return "N/A";
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return dateTimeString;
    }
  };

  const composeReportText = () => {
    const y = (yesterdayTask || "").trim() || "-";
    const t = (todayTask || "").trim() || "-";
    const p = (problems || "").trim() || "-";
    return `Yesterday task:\n${y}\n\nToday task:\n${t}\n\nProblem:\n${p}`;
  };

  // -------------------- FETCH TODAY'S REPORT --------------------
  useEffect(() => {
    const checkReportAndSetState = async () => {
      if (!user || !user.id) {
        setDataLoading(false);
        return;
      }

      setDataLoading(true);
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(`${API_URL}/reports/employee/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setTodayReport(response.data);
        setIsEditable(false);
        setMessage("Report already submitted for today.");
        setMessageType("success");
      } catch (error) {
        if (error.response?.status === 404) {
          setTodayReport(null);
          setIsEditable(true);
          setMessage("");
        } else if (error.response?.status === 401) {
          setMessage("Unauthorized. Please login again.");
          setMessageType("error");
        } else {
          console.error("Error fetching today's report:", error);
          setMessage("Failed to fetch today's report. Please try again.");
          setMessageType("error");
        }
      } finally {
        setDataLoading(false);
      }
    };

    if (user && user.id) checkReportAndSetState();
    else if (!authLoading) setDataLoading(false);
  }, [user, authLoading]);

  // -------------------- SUBMIT REPORT --------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!user || !user.id || !isEditable) {
      setMessage("Submission failed: Form is disabled or report already submitted.");
      setMessageType("error");
      return;
    }

    if (!yesterdayTask.trim() || !todayTask.trim()) {
      setMessage("Submission failed: Please fill Yesterday Task and Today Task.");
      setMessageType("error");
      return;
    }

    try {
      const now = new Date();
      const pad = (num) => num.toString().padStart(2, "0");

      const mysqlDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate()
      )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const todayDate = now.toISOString().slice(0, 10);
      const compliance_status = getPotentialStatus(now).status;

      const newReport = {
        report_text: composeReportText(),
        submission_time: mysqlDateTime,
        report_date: todayDate,
        compliance_status,
      };

      const token = localStorage.getItem("token");
      const response = await axios.post(`${API_URL}/reports`, newReport, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMessage(`Report submitted successfully. Status: ${getPotentialStatus(now).label}.`);
      setMessageType("success");

      setYesterdayTask("");
      setTodayTask("");
      setProblems("");

      setTodayReport(response.data);
      setIsEditable(false);
    } catch (error) {
      const status = error.response?.status;
      if (status === 409) {
        setMessage("You have already submitted your report for today.");
        setMessageType("warning");
        setIsEditable(false);
      } else if (status === 401) {
        setMessage("Unauthorized. Please login again.");
        setMessageType("error");
      } else {
        console.error("Error submitting report:", error);
        setMessage("Failed to submit report. Please try again.");
        setMessageType("error");
      }
    }
  };

  const ReportIcon = todayReport ? getStatusIcon(todayReport.compliance_status) : Clock;
  const formattedToday = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (authLoading || dataLoading) return <p>Loading...</p>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-4xl w-full">
        <h2 className="text-4xl font-extrabold mb-8 text-center text-gray-800">
          Daily Morning Report
        </h2>
        {!todayReport && (
          <div className="mb-6 p-4 rounded-lg bg-indigo-50 border border-indigo-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-indigo-800">Current Status</h3>
              </div>
              <div className="mt-2 md:mt-0">
                <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold ${(() => {
                    const { status } = getPotentialStatus(new Date());
                    switch (status) {
                      case 'OnTime': return 'bg-green-100 text-green-800';
                      case 'QA': return 'bg-yellow-100 text-yellow-800';
                      case 'HUL': return 'bg-orange-100 text-orange-800';
                      case 'UPL': return 'bg-red-100 text-red-800';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  })()
                  }`}>
                  {(() => {
                    const now = new Date();
                    const { status, label } = getPotentialStatus(now);
                    const timeRange =
                      status === 'OnTime' ? 'Before 9:30 AM' :
                        status === 'QA' ? '9:31 AM - 10:00 AM' :
                          status === 'HUL' ? '10:01 AM - 12:30 PM' :
                            'After 12:30 PM';
                    return `${label}: ${timeRange}`;
                  })()}
                </div>
              </div>
            </div>
            <div className="mt-3 text-lg text-indigo-600">
              <p className="font-medium">Submission Guidelines:</p>
              <ul className="list-disc list-inside space-y-2 mt-1">
                <li className={`flex items-center ${new Date().getHours() < 9 || (new Date().getHours() === 9 && new Date().getMinutes() <= 30) ? 'font-bold' : ''}`}>
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                  On Time: Before 9:30 AM
                </li>
                <li className={`flex items-center ${(new Date().getHours() > 9 || (new Date().getHours() === 9 && new Date().getMinutes() >= 31)) && (new Date().getHours() < 10 || (new Date().getHours() === 10 && new Date().getMinutes() === 0)) ? 'font-bold' : ''}`}>
                  <span className="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-2"></span>
                  QA Fine: 9:31 AM - 10:00 AM
                </li>
                <li className={`flex items-center ${(new Date().getHours() > 10 || (new Date().getHours() === 10 && new Date().getMinutes() >= 1)) && (new Date().getHours() < 12 || (new Date().getHours() === 12 && new Date().getMinutes() <= 30)) ? 'font-bold' : ''}`}>
                  <span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-2"></span>
                  Half Unpaid Leave (HUL): 10:01 AM - 12:30 PM
                </li>
                <li className={`flex items-center ${new Date().getHours() > 12 || (new Date().getHours() === 12 && new Date().getMinutes() > 30) ? 'font-bold' : ''}`}>
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                  Full Unpaid Leave (UPL): After 12:30 PM
                </li>
              </ul>
            </div>
          </div>
        )}
        <div className="bg-white p-8 rounded-xl shadow-2xl border border-indigo-100 transition-all duration-300 hover:shadow-indigo-300/50">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <User className="text-indigo-500" size={24} />
              <p className="text-xl font-semibold text-gray-700">
                Employee: <span className="text-indigo-600 font-bold">{user?.employee_name || "Loading..."}</span>
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span className="text-lg font-medium text-gray-500">{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Messages */}
          {message && (
            <div className={`p-4 rounded-lg border-l-4 mb-8 font-medium shadow-md ${getMessageClasses(messageType)}`}>
              {message}
            </div>
          )}

          {/* Report Form / Display */}
          {todayReport ? (
            <div className="mt-6">
              <div className={`p-6 rounded-xl border-l-4 ${getStatusColor(todayReport.compliance_status)} shadow-lg`}>
                <div className="flex items-center space-x-4 mb-4">
                  <ReportIcon className="w-8 h-8 flex-shrink-0" />
                  <h3 className="text-2xl font-bold">Submission Details for {formattedToday}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
                  <p className="font-semibold">Status:</p>
                  <p className={`font-bold ${todayReport.compliance_status === "OnTime" ? "text-emerald-700" : "text-red-700"}`}>
                    {todayReport.compliance_status}
                  </p>
                  <p className="font-semibold">Time Submitted:</p>
                  <p className="font-medium text-gray-800">{formatSubmissionTime(todayReport.submission_time)}</p>
                </div>
              </div>
              <div className="mt-6 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">
                {todayReport.report_text}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <div>
                <label className="block font-medium text-gray-700 mb-2">Yesterday's Task</label>
                <textarea
                  className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  value={yesterdayTask}
                  onChange={(e) => setYesterdayTask(e.target.value)}
                  placeholder="Yesterday's completed task"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-2">Today's Task</label>
                <textarea
                  className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  value={todayTask}
                  onChange={(e) => setTodayTask(e.target.value)}
                  placeholder="Today's planned task"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-2">Problem</label>
                <textarea
                  className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  value={problems}
                  onChange={(e) => setProblems(e.target.value)}
                  placeholder="Any problems / blockers"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors"
                disabled={!isEditable}
              >
                Submit Report
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmitReport;
