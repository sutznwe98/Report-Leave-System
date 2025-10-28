import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  XCircle,
  FileText,
  Calendar,
  Clock,
  User,
  CheckCircle,
  AlertTriangle,
  Mail,
  Home,
  Briefcase,
} from "lucide-react";

// The API_URL is defined here, assuming it's correctly set to "http://localhost:5000/api"
const API_URL = "http://localhost:5000/api";

// --- New: Defined Leave Types for the dropdown ---
const LEAVE_TYPES = [
  "Annual Leave (AL)",
  "Medical Leave (ML)",
  "Unpaid Leave (UPL)",
  "Half Morning Leave (HML)",
  "Half Evening Leave (HEL)",
];

// Helper function to format dates
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const LeaveRequestDetail = ({ leaveId, onUpdate }) => {
  const [leave, setLeave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  // Status and type are managed locally for editing/action
  const [newStatus, setNewStatus] = useState("");
  const [newLeaveType, setNewLeaveType] = useState(""); // Used for the dropdown

  // Placeholder for user identification (simulating admin context)
  const userId = "LOCAL_ADMIN_ID_12345";

  // --- New: Calculate leave duration (total requested days) ---
  const totalDays = useMemo(() => {
    if (!leave || !leave.start_date || !leave.end_date) return 0;

    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);

    // Ensure dates are valid
    if (isNaN(start) || isNaN(end)) return 0;

    // Calculate difference in milliseconds
    const diffTime = Math.abs(end.getTime() - start.getTime());
    // Convert to days (+1 to include the start day)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays;
  }, [leave]);
  // --- End Total Days Calculation ---

  useEffect(() => {
    const fetchLeave = async () => {
      setLoading(true);
      setError(null);

      try {
        // Retrieve token for authorization
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const response = await axios.get(`${API_URL}/leaves/${leaveId}`, {
          headers,
        });
        const leaveData = response.data;

        setLeave(leaveData);
        setNewStatus(leaveData.status);
        setNewLeaveType(leaveData.leave_type);
        setError(null);
      } catch (err) {
        console.error("Error fetching leave details:", err);
        setError("Failed to load leave request details.");
      } finally {
        setLoading(false);
      }
    };

    fetchLeave();
  }, [leaveId]);

  // General function to handle STATUS updates (Approve/Reject)
  const handleUpdateLeave = async (newStatusValue) => {
    setIsSubmitting(true);
    setSubmissionMessage(null);
    setError(null);

    // Guard clause: Ensure leave object and ID exist before proceeding
    if (!leave || !leave.id) {
      setError("Cannot process request: Leave details are missing.");
      setIsSubmitting(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.put(
        `${API_URL}/leaves/${leave.id}/status`, // Status endpoint
        {
          status: newStatusValue,
        },
        { headers }
      );

      // Update local state and show success message
      setLeave(response.data);
      setNewStatus(response.data.status);
      setSubmissionMessage(
        `Leave request successfully set to: ${response.data.status}`
      );
      if (onUpdate) {
        onUpdate(response.data); // Notify parent component of update
      }
    } catch (err) {
      // FIX: Improved error logging to prevent circular reference when logging Axios error objects
      let errorMessage = "Error updating leave details. Please check console.";

      if (err.response) {
        // Server responded with an error (e.g., 400, 500)
        errorMessage = `Update failed: ${
          err.response.data?.message || err.response.statusText
        }`;
      } else if (err.message && !err.message.includes("circular")) {
        // Network error or other simple message
        errorMessage = `Network error: ${err.message}`;
      } else {
        // Catch circular structure error specifically, likely caused by event object propagation
        errorMessage =
          "An unexpected internal error occurred (potential circular data structure). Please refresh.";
      }

      console.error("Error details:", err);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- New: Function to handle LEAVE TYPE updates ---
  const handleUpdateLeaveType = async () => {
    setIsSubmitting(true);
    setSubmissionMessage(null);
    setError(null);

    if (!leave || !leave.id) {
      setError("Cannot process request: Leave details are missing.");
      setIsSubmitting(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      // Assuming a dedicated endpoint for updating details like type
      const response = await axios.put(
        `${API_URL}/leaves/${leave.id}`, // Detail update endpoint
        {
          leave_type: newLeaveType,
        },
        { headers }
      );

      // Update local state
      setLeave(response.data);
      // newLeaveType state is already correct from the select handler
      setSubmissionMessage(
        `Leave type successfully updated to: ${response.data.leave_type}`
      );
      if (onUpdate) {
        onUpdate(response.data);
      }
    } catch (err) {
      let errorMessage = "Error updating leave type. Please check console.";

      if (err.response) {
        errorMessage = `Update failed: ${
          err.response.data?.message || err.response.statusText
        }`;
      } else if (err.message && !err.message.includes("circular")) {
        errorMessage = `Network error: ${err.message}`;
      } else {
        errorMessage = "An unexpected internal error occurred. Please refresh.";
      }

      console.error("Error updating leave type details:", err);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- End handleUpdateLeaveType ---

  const handleApproveLeave = () => handleUpdateLeave("Approved");
  const handleRejectLeave = () => handleUpdateLeave("Rejected");

  const renderStatus = (status) => {
    switch (status) {
      case "Pending":
        return (
          <span className="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">
            <AlertTriangle className="w-4 h-4 mr-1" />
            {status}
          </span>
        );
      case "Approved":
        return (
          <span className="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
            <CheckCircle className="w-4 h-4 mr-1" />
            {status}
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
            <XCircle className="w-4 h-4 mr-1" />
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const isPending = leave?.status === "Pending";

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8 min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 mr-2 animate-spin text-purple-600" />
        <span className="text-lg text-gray-700">Loading details...</span>
      </div>
    );
  }

  if (error && !leave) {
    return (
      <div className="text-center p-8 min-h-screen bg-red-50">
        <XCircle className="w-10 h-10 mx-auto text-red-500" />
        <h2 className="text-xl font-bold text-red-700 mt-3">Error</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!leave) {
    return (
      <div className="text-center p-8 min-h-screen bg-gray-50">
        <FileText className="w-10 h-10 mx-auto text-gray-500" />
        <h2 className="text-xl font-bold text-gray-700 mt-3">Not Found</h2>
        <p className="text-gray-600">
          The requested leave request could not be found.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden transform transition duration-500 hover:shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 p-6  gap-3">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Leave Request of {leave.employee_name || "N/A"}
          </h2>
          <button
            onClick={() =>
              user.role.toLowerCase() === "admin"
                ? navigate("/admin/dashboard")
                : navigate("/employee/dashboard")
            }
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          {/* Main Details Section */}
          <div className="lg:col-span-2 p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">
              Request Information
            </h2>

            <div className="space-y-4">
              {/* CHANGE: Displaying Employee Name instead of Employee ID */}
              <DetailRow
                icon={User}
                label="Employee Name"
                value={leave.employee_name || "N/A"}
                isBold={true}
              />
              <DetailRow
                icon={Briefcase}
                label="Leave Type"
                value={leave.leave_type}
                isBold={true}
              />
              <DetailRow
                icon={Calendar}
                label="Start Date"
                value={formatDate(leave.start_date)}
              />
              <DetailRow
                icon={Calendar}
                label="End Date"
                value={formatDate(leave.end_date)}
              />
              {/* --- New: Total Days Row --- */}
              <DetailRow
                icon={Calendar}
                label="Total Requested Days"
                value={`${totalDays} ${totalDays === 1 ? "day" : "days"}`}
                isBold={true}
              />
              {/* --- End Total Days Row --- */}
              <DetailRow
                icon={Clock}
                label="Requested On"
                value={formatDate(leave.created_at)}
              />
              <DetailRow
                icon={Home}
                label="Current Status"
                value={renderStatus(leave.status)}
                isComponent={true}
              />
            </div>

            <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b pb-1">
              Reason
            </h3>
            <p className="text-gray-700 p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-inner italic">
              {leave.reason || "No reason provided."}
            </p>

            {leave.medical_certificate_url && (
              <>
                <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b pb-1">
                  Supporting Document
                </h3>
                <a
                  href={leave.medical_certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-800 underline flex items-center"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  View Medical Certificate
                </a>
              </>
            )}
          </div>

          {/* Action/History Column */}
          <div className="lg:col-span-1 p-6 sm:p-8 bg-gray-50">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">
              Actions
            </h2>

            {submissionMessage && (
              <div
                className={`p-3 mb-4 rounded-lg text-sm font-medium ${
                  submissionMessage.includes("successfully")
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {submissionMessage}
              </div>
            )}

            {error && (
              <div className="p-3 mb-4 rounded-lg text-sm font-medium bg-red-100 text-red-800">
                {error}
              </div>
            )}

            {isPending ? (
              <div className="space-y-4">
                {/* --- New: Leave Type Change Section --- */}
                <div className="border p-4 rounded-lg bg-white shadow-sm space-y-3">
                  <div className="flex-1">
                    <label
                      htmlFor="type-select"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Change Leave Type
                    </label>
                    <select
                      id="type-select"
                      value={newLeaveType}
                      onChange={(e) => setNewLeaveType(e.target.value)}
                      className="w-full py-2.5 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 transition duration-150 text-base font-semibold text-gray-900"
                      disabled={isSubmitting}
                    >
                      {LEAVE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleUpdateLeaveType}
                    // Disable if submitting or if the selected type hasn't changed
                    disabled={isSubmitting || newLeaveType === leave.leave_type}
                    className={`w-full flex justify-center items-center py-2 px-3 border border-transparent rounded-lg text-sm font-semibold text-white transition duration-150 ease-in-out ${
                      isSubmitting || newLeaveType === leave.leave_type
                        ? "bg-purple-300 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-purple-500"
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating Type...
                      </>
                    ) : (
                      "Update Leave Type"
                    )}
                  </button>
                </div>
                {/* --- End Leave Type Change Section --- */}

                <p className="text-gray-600 pt-2">
                  Or select an action to process this pending request:
                </p>

                <button
                  onClick={handleApproveLeave}
                  disabled={isSubmitting}
                  className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white transition duration-150 ease-in-out ${
                    isSubmitting
                      ? "bg-green-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Approve Request"
                  )}
                </button>

                <button
                  onClick={handleRejectLeave}
                  disabled={isSubmitting}
                  className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white transition duration-150 ease-in-out ${
                    isSubmitting
                      ? "bg-red-400 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Reject Request"
                  )}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-purple-100 rounded-lg text-center text-purple-800 font-medium">
                This request has already been{" "}
                <span className="font-bold">{leave.status}</span>. No further
                action is available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({
  icon: Icon,
  label,
  value,
  isBold = false,
  isComponent = false,
}) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100">
    <div className="text-sm font-medium text-gray-600 flex items-center">
      {Icon && <Icon className="w-4 h-4 mr-2 text-purple-500" />} {label}
    </div>
    <div
      className={`text-sm text-gray-800 ${
        isBold ? "font-bold text-purple-700" : ""
      }`}
    >
      {isComponent ? value : String(value)}
    </div>
  </div>
);

// This component is the default export for the React file structure
export default LeaveRequestDetail;
