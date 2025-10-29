import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext"; // Adjust to your AuthContext
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
  const [reportText, setReportText] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [isEditable, setIsEditable] = useState(true);
  const [todayReport, setTodayReport] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState("");
  const [yesterdayTask, setYesterdayTask] = useState("");
  const [todayTask, setTodayTask] = useState("");
  const [problems, setProblems] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const formattedToday = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Updated logic for new time-based compliance statuses

  const TIME_ON_TIME_CUTOFF = { hours: 9, minutes: 30 }; // Before 9:30 AM
  const TIME_QA_CUTOFF = { hours: 10, minutes: 0 }; // 9:31 AM to 10:00 AM
  const TIME_HUL_CUTOFF = { hours: 12, minutes: 30 }; // 10:01 AM to 12:30 PM

  const getPotentialStatus = (date) => {
    const now = date || new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const onTimeCutoff =
      TIME_ON_TIME_CUTOFF.hours * 60 + TIME_ON_TIME_CUTOFF.minutes;
    const qaCutoff = TIME_QA_CUTOFF.hours * 60 + TIME_QA_CUTOFF.minutes;
    const hulCutoff = TIME_HUL_CUTOFF.hours * 60 + TIME_HUL_CUTOFF.minutes;

    if (nowMinutes <= onTimeCutoff) {
      return { status: "OnTime", label: "On Time" };
    } else if (nowMinutes <= qaCutoff) {
      return { status: "QA", label: "QA" };
    } else if (nowMinutes <= hulCutoff) {
      return { status: "HUL", label: "Half Unpaid Leave (HUL)" };
    } else {
      return { status: "UPL", label: "Full Unpaid Leave (UPL)" };
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "OnTime":
        return "bg-emerald-500"; // Green
      case "QA":
        return "bg-yellow-400"; // Yellow
      case "HUL":
        return "bg-[rgb(245,174,124)]";
      case "UPL":
        return "bg-[rgb(237,87,87)]";
      default:
        return "bg-gray-400"; // Gray fallback
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "OnTime":
        return CheckCircle;
      case "Late":
        return AlertTriangle;
      case "UPL":
        return XCircle;
      default:
        return Clock;
    }
  };

  const getMessageClasses = (type) => {
    switch (type) {
      case "success":
        return "bg-green-100 text-green-800 border-green-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "error":
        return "bg-red-100 text-red-800 border-red-300";
      case "info":
      default:
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
  };

  const formatSubmissionTime = (dateTimeString) => {
    if (!dateTimeString) return "N/A";
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
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
        const response = await axios.get(
          `${API_URL}/reports/employee/${user.id}/today`
        );
        setTodayReport(response.data);
        setIsEditable(false);
        setMessage("Report already submitted for today.");
        setMessageType("success");
      } catch (error) {
        const status = error.response?.status;
        if (status === 404) {
          // No report yet
          setTodayReport(null);
          setIsEditable(true);
          setMessage("");
        } else if (status === 409) {
          // Already submitted
          setMessage("You have already submitted your report for today.");
          setMessageType("warning");
          setIsEditable(false);
          try {
            const existing = await axios.get(
              `${API_URL}/reports/employee/${user.id}/today`
            );
            setTodayReport(existing.data);
          } catch {
            console.warn("Could not fetch existing report after 409 conflict.");
          }
        } else if (status === 500) {
          setMessage("Server error. Please try again later.");
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
      setMessage(
        "Submission failed: Form is disabled or report already submitted."
      );
      setMessageType("error");
      return;
    }
    if (!yesterdayTask.trim() || !todayTask.trim()) {
      setMessage("Submission failed: Please fill Yesterday Task and Today Task.");
      setMessageType("error");
      return;
    }

    const now = new Date();
    const { status: compliance_status, label } = getPotentialStatus(now);
    const pad = (num) => num.toString().padStart(2, "0");
    const mysqlDateTime = `${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
      now.getMinutes()
    )}:${pad(now.getSeconds())}`;

    const newReport = {
      employee_id: user.id,
      reportText: composeReportText(),
      status: compliance_status,
    };

    try {
      await axios.post(`${API_URL}/reports`, newReport);
      setMessage(`Report submitted successfully. Status: ${label}.`);
      setMessageType("success");
      setReportText("");
      setYesterdayTask("");
      setTodayTask("");
      setProblems("");
      setTodayReport(newReport);
      setIsEditable(false);
    } catch (error) {
      const status = error.response?.status;
      if (status === 409) {
        setMessage("You have already submitted your report for today.");
        setMessageType("warning");
        setIsEditable(false);
      } else if (status === 500) {
        setMessage("Server error. Please try again later.");
        setMessageType("error");
      } else {
        console.error("Error submitting report:", error);
        setMessage("Failed to submit report. Please try again.");
        setMessageType("error");
      }
    }
  };

  const ReportIcon = todayReport
    ? getStatusIcon(todayReport.compliance_status)
    : Clock;

  if (authLoading || dataLoading) return <p>Loading...</p>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-4xl w-full">
        <h2 className="text-4xl font-extrabold mb-8 text-center text-gray-800">
          Daily Morning Report
        </h2>
        <div className="bg-white p-8 rounded-xl shadow-2xl border border-indigo-100 transition-all duration-300 hover:shadow-indigo-300/50">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <User className="text-indigo-500" size={24} />
              <p className="text-xl font-semibold text-gray-700">
                Employee:{" "}
                <span className="text-indigo-600 font-bold">
                  {user?.name || "Loading..."}
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span className="text-lg font-medium text-gray-500">
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Messages */}
          {message && (
            <div
              className={`p-4 rounded-lg border-l-4 mb-8 font-medium shadow-md ${getMessageClasses(
                messageType
              )}`}
            >
              {message}
            </div>
          )}

          {/* Report Display / Form */}
          {todayReport ? (
            <div className="mt-6">
              <div
                className={`p-6 rounded-xl border-l-4 ${getStatusColor(
                  todayReport.compliance_status
                )} shadow-lg`}
              >
                <div className="flex items-center space-x-4 mb-4">
                  <ReportIcon className="w-8 h-8 flex-shrink-0" />
                  <h3 className="text-2xl font-bold">
                    Submission Details for {formattedToday}
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
                  <p className="font-semibold">Status:</p>
                  <p
                    className={`font-bold ${
                      todayReport.compliance_status === "OnTime"
                        ? "text-emerald-700"
                        : todayReport.compliance_status === "Late"
                        ? "text-amber-700"
                        : "text-red-700"
                    }`}
                  >
                    {todayReport.compliance_status}
                  </p>
                  <p className="font-semibold">Time Submitted:</p>
                  <p className="font-medium text-gray-800">
                    {formatSubmissionTime(todayReport.submission_time)}
                  </p>
                </div>
              </div>
              <div className="mt-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-xl font-semibold mb-3 text-gray-700">
                  Your Report:
                </h4>
                <div className="whitespace-pre-wrap text-gray-600 border p-3 rounded-md bg-white min-h-[100px] shadow-inner">
                  {todayReport.report_text}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yesterday Task</label>
                  <textarea
                    value={yesterdayTask}
                    onChange={(e) => setYesterdayTask(e.target.value)}
                    placeholder="What did you complete yesterday?"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 h-28 resize-y"
                    disabled={!isEditable}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Today Task</label>
                  <textarea
                    value={todayTask}
                    onChange={(e) => setTodayTask(e.target.value)}
                    placeholder="What will you do today?"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 h-28 resize-y"
                    disabled={!isEditable}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Problem</label>
                  <textarea
                    value={problems}
                    onChange={(e) => setProblems(e.target.value)}
                    placeholder="Any blockers or issues?"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 h-24 resize-y"
                    disabled={!isEditable}
                  />
                </div>
              </div>

              <div className="p-3 bg-gray-50 border rounded">
                <div className="text-xs text-gray-500 mb-1">Preview</div>
                <pre className="text-sm whitespace-pre-wrap">{composeReportText()}</pre>
              </div>

              <button
                type="submit"
                className={`w-full sm:w-auto px-6 py-3 text-lg font-semibold text-white rounded-lg shadow-lg transition duration-200 
                  ${
                    isEditable
                      ? "bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300 active:bg-indigo-800"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
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
