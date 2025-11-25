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

const API_URL = "http://localhost:5000/api";

const LEAVE_TYPES = [
  { label: "Annual Leave (AL)", value: "AL" },
  { label: "Medical Leave (ML)", value: "ML" },
  { label: "Unpaid Leave (UPL)", value: "UPL" },
  { label: "Half Unpaid Leave (HUPL)", value: "HUPL" },
];

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const LeaveRequestDetail = ({ leaveId, onUpdate }) => {
  const formatTeams = (obj) => {
    const arr = Array.isArray(obj?.teams)
      ? obj.teams
      : Array.isArray(obj?.employee_teams)
        ? obj.employee_teams
        : Array.isArray(obj?.projects)
          ? obj.projects
          : Array.isArray(obj?.employee_projects)
            ? obj.employee_projects
            : typeof obj?.team === "string"
              ? obj.team
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
              : typeof obj?.projects === "string"
                ? obj.projects
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                : typeof obj?.project === "string"
                  ? obj.project
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                  : typeof obj?.project_name === "string"
                    ? obj.project_name
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                    : [];
    return arr.length ? arr.join(", ") : "N/A";
  };

  const [leave, setLeave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [newStatus, setNewStatus] = useState("");
  const [newLeaveType, setNewLeaveType] = useState("");
  const [imgError, setImgError] = useState(false);

  const totalDays = useMemo(() => {
    if (!leave || !leave.start_date || !leave.end_date) return 0;
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    if (isNaN(start) || isNaN(end)) return 0;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [leave]);

  useEffect(() => {
    const fetchLeave = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get(`${API_URL}/leaves/employee/${leaveId}`, { headers });
        const leaveData = response.data;
        let enriched = { ...leaveData };

        try {
          const empListRes = await axios.get(`${API_URL}/employees`, { headers });
          const employeesRaw = Array.isArray(empListRes.data) ? empListRes.data : [];

          const toTeams = (obj) => {
            if (Array.isArray(obj?.teams)) return obj.teams;
            if (Array.isArray(obj?.employee_teams)) return obj.employee_teams;
            if (Array.isArray(obj?.projects)) return obj.projects;
            if (Array.isArray(obj?.employee_projects)) return obj.employee_projects;
            if (typeof obj?.team === "string") return obj.team.split(",").map(t => t.trim()).filter(Boolean);
            if (typeof obj?.projects === "string") return obj.projects.split(",").map(t => t.trim()).filter(Boolean);
            if (typeof obj?.project === "string") return obj.project.split(",").map(t => t.trim()).filter(Boolean);
            if (typeof obj?.project_name === "string") return obj.project_name.split(",").map(t => t.trim()).filter(Boolean);
            return [];
          };

          const employees = employeesRaw.map((emp) => ({
            ...emp,
            teams: toTeams(emp),
          }));

          const byId = new Map(employees.map((e) => [e.id, e]));
          const byEmail = new Map(employees.map((e) => [e.email, e]));
          const byName = new Map(employees.map((e) => [e.name, e]));
          const norm = (v) => (v == null ? "" : String(v).trim().toLowerCase());

          const possibleIds = [enriched.employee_id, enriched.employeeId, enriched.user_id, enriched.userId];
          const possibleEmails = [enriched.employee_email, enriched.email, enriched.user_email];
          const possibleNames = [enriched.employee_name, enriched.name, enriched.user_name, enriched.employee];

          const foundId = possibleIds.find((id) => id && byId.get(id));
          let foundEmailKey = null;
          if (!foundId) {
            const emailSet = new Map(Array.from(byEmail.entries()).map(([k, v]) => [norm(k), v]));
            for (const em of possibleEmails) {
              const n = norm(em);
              if (n && emailSet.has(n)) {
                foundEmailKey = n;
                break;
              }
            }
          }

          let foundNameKey = null;
          if (!foundId && !foundEmailKey) {
            const nameSet = new Map(Array.from(byName.entries()).map(([k, v]) => [norm(k), v]));
            for (const nm of possibleNames) {
              const n = norm(nm);
              if (n && nameSet.has(n)) {
                foundNameKey = n;
                break;
              }
            }
          }

          const emp = (foundId && byId.get(foundId)) ||
            (foundEmailKey && Array.from(byEmail.entries()).map(([k, v]) => [norm(k), v]).find(([k]) => k === foundEmailKey)?.[1]) ||
            (foundNameKey && Array.from(byName.entries()).map(([k, v]) => [norm(k), v]).find(([k]) => k === foundNameKey)?.[1]);

          if (emp) {
            if (!enriched.employee_name) enriched.employee_name = emp.name || enriched.employee_name;
            const currentTeams = Array.isArray(enriched.teams) ? enriched.teams :
              Array.isArray(enriched.employee_teams) ? enriched.employee_teams : null;
            const currentTeamString = (typeof enriched.team === "string" && enriched.team.trim()) ||
              (typeof enriched.projects === "string" && enriched.projects.trim());
            if (!(currentTeams && currentTeams.length) && !currentTeamString) {
              enriched.teams = emp.teams || [];
            }
          }
        } catch (_) {
          // best-effort enrichment; ignore errors
        }

        if (!Array.isArray(enriched.teams) || !enriched.teams.length) {
          const candidates = formatTeams(enriched);
          if (candidates && candidates !== "N/A") {
            enriched.teams = candidates.split(",").map(s => s.trim()).filter(Boolean);
          }
        }

        setLeave(enriched);
        setNewStatus(enriched.status);
        const matchedType = LEAVE_TYPES.find(
          (lt) => lt.label === enriched.leave_type || lt.value === enriched.leave_type
        );
        setNewLeaveType(matchedType ? matchedType.value : enriched.leave_type);
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

  const handleUpdateLeave = async (updates) => {
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
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.put(
        `${API_URL}/leaves/${leave.id}`,
        {
          ...updates,
          approver_role: user.role,
          approver_id: user.id
        },
        { headers }
      );

      // Preserve the existing employee and project data while updating with new data
      setLeave(prev => ({
        ...prev, // Keep existing data
        ...response.data, // Update with new data
        employee_name: response.data.employee_name || prev.employee_name, // Preserve employee name
        // Preserve project information
        project: response.data.project || prev.project,
        projects: response.data.projects || prev.projects,
        employee_projects: response.data.employee_projects || prev.employee_projects
      }));

      setNewStatus(response.data.status);

      setSubmissionMessage(`Leave request ${updates.status.toLowerCase()} successfully.`);

      if (onUpdate) {
        onUpdate(response.data);
      }
    } catch (error) {
      console.error("Error updating leave:", error);
      setError(
        error.response?.data?.message ||
        "Failed to update leave. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveLeave = () => {
    if (user.role.toLowerCase() === 'pj lead' && leave.status === 'Pending') { // If overall status is 'Pending', PJ Lead needs to approve
      return handleUpdateLeave({
        status: 'Approved', // PJ Lead approves their step
      });
    } else if (user.role.toLowerCase() === 'admin' && leave.status === 'Pending Admin Approval') { // If overall status is 'Pending Admin Approval', Admin needs to approve
      return handleUpdateLeave({
        status: 'Approved', // Admin approves their step
      });
    }
    // Fallback for other scenarios or direct approval if status is not specific
    return handleUpdateLeave({ status: 'Approved' });
  };

  const handleRejectLeave = () => {
    if (user.role.toLowerCase() === 'pj lead' && leave.status === 'Pending') { // If overall status is 'Pending', PJ Lead can reject
      return handleUpdateLeave({
        status: 'Rejected', // PJ Lead rejects their step
      });
    } else if (user.role.toLowerCase() === 'admin' && leave.status === 'Pending Admin Approval') { // If overall status is 'Pending Admin Approval', Admin can reject
      return handleUpdateLeave({
        status: 'Rejected', // Admin rejects their step
      });
    }
    // Fallback for other scenarios or direct rejection
    return handleUpdateLeave({ status: 'Rejected' });
  };

  //const handleUpdateLeaveType = () => handleUpdateLeave({ leave_type: newLeaveType });
  const handleUpdateLeaveType = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const payload = { leave_type: newLeaveType };
      if (leave.employee_name) payload.employee_name = leave.employee_name;
      if (leave.project) payload.project = leave.project;

      const response = await axios.put(
        `${API_URL}/leaves/${leave.id}`,
        payload,
        { headers }
      );

      // Update the local state with the updated leave data
      setLeave(prev => ({
        ...prev,
        ...response.data,
        employee_name: prev.employee_name,
      project: prev.project
      }));

      const matchedType = LEAVE_TYPES.find(
        (lt) => lt.label === response.data.leave_type || lt.value === response.data.leave_type
      );
      setNewLeaveType(matchedType ? matchedType.value : response.data.leave_type);

      setSubmissionMessage("Leave type updated successfully.");

      if (onUpdate) {
        onUpdate(response.data);
      }
    } catch (error) {
      console.error("Error updating leave type:", error);
      setError(
        error.response?.data?.message ||
        "Failed to update leave type. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatus = (status) => {
    const statusConfig = {
      'Pending PJ Lead Approval': {
        bg: 'bg-yellow-100', // This is the overall status "Pending"
        text: 'text-yellow-800', // This is the overall status "Pending"
        icon: <AlertTriangle className="w-4 h-4 mr-1" />,
        label: 'Pending PJ Lead Approval'
      },
      'Pending Admin Approval': {
        bg: 'bg-blue-100', // This is the overall status "Pending Admin Approval"
        text: 'text-blue-800', // This is the overall status "Pending Admin Approval"
        icon: <Clock className="w-4 h-4 mr-1" />,
        label: 'Pending Admin Approval'
      },
      'Approved': {
        bg: 'bg-green-100', // This is the overall status "Approved"
        text: 'text-green-800', // This is the overall status "Approved"
        icon: <CheckCircle className="w-4 h-4 mr-1" />,
        label: 'Approved'
      },
      'Rejected by PJ Lead': {
        bg: 'bg-red-100', // This is the overall status "Rejected by PJ Lead"
        text: 'text-red-800', // This is the overall status "Rejected by PJ Lead"
        icon: <XCircle className="w-4 h-4 mr-1" />,
        label: 'Rejected by PJ Lead'
      },
      'Rejected by Admin': {
        bg: 'bg-red-100', // This is the overall status "Rejected by Admin"
        text: 'text-red-800', // This is the overall status "Rejected by Admin"
        icon: <XCircle className="w-4 h-4 mr-1" />,
        label: 'Rejected by Admin'
      },
      default: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        icon: null,
        label: status || 'Unknown'
      }
    };

    const { bg, text, icon, label } = statusConfig[status] || statusConfig.default;

    return (
      <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${bg} ${text}`}>
        {icon}
        {label}
      </span>
    );
  };

  const isPending = leave?.status?.includes('Pending'); // This checks for "Pending" and "Pending Admin Approval"

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
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 p-6 gap-3">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Leave Request of {leave.employee_name || "N/A"}
          </h2>
          <button
            onClick={() =>
              user.role.toLowerCase() === "admin"
                ? navigate("/admin/leaves")
                : navigate("/employee/leave-records")
            }
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            ← Back to Leave Records
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <div className="lg:col-span-2 p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">
              Request Information
            </h2>

            <div className="space-y-4">
              <DetailRow
                icon={User}
                label="Employee Name"
                value={leave.employee_name || "N/A"}
                isBold={true}
              />
              <DetailRow
                icon={Briefcase}
                label="Project"
                value={formatTeams(leave)}
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
              <DetailRow
                icon={Calendar}
                label="Total Requested Days"
                value={`${totalDays} ${totalDays === 1 ? "day" : "days"}`}
                isBold={true}
              />
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
              {/*  */}
            </div>

            <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b pb-1">
              Reason
            </h3>
            <p className="text-gray-700 p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-inner italic">
              {leave.reason || "No reason provided."}
            </p>
          </div>

          <div className="lg:col-span-1 p-6 sm:p-8 bg-gray-50">
            {leave.medical_certificate_url && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Medical Certificate
                </h3>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <img
                    src={`http://localhost:5000${leave.medical_certificate_url}`}
                    alt="Medical Certificate"
                    className="w-full h-auto max-h-80 object-contain p-2"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23f3f4f6%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%20font-family%3D%22Arial%22%20font-size%3D%2214%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%3EImage%20not%20found%3C%2Ftext%3E%3C%2Fsvg%3E';
                      e.target.alt = 'Medical certificate not found';
                    }}
                  />
                  <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                    <a
                      href={`http://localhost:5000${leave.medical_certificate_url}`}
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
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">
              Actions
            </h2>

            {submissionMessage && (
              <div
                className={`p-3 mb-4 rounded-lg text-sm font-medium ${submissionMessage.includes("successfully")
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
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleUpdateLeaveType}
                    disabled={isSubmitting || newLeaveType === leave.leave_type}
                    className={`w-full flex justify-center items-center py-2 px-3 border border-transparent rounded-lg text-sm font-semibold text-white transition duration-150 ease-in-out ${isSubmitting || newLeaveType === leave.leave_type
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

                <p className="text-gray-600 pt-2">
                  Or select an action to process this pending request:
                </p>

                <button
                  onClick={handleApproveLeave}
                  disabled={isSubmitting}
                  className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white transition duration-150 ease-in-out ${isSubmitting
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
                  className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white transition duration-150 ease-in-out ${isSubmitting
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
      className={`text-sm text-gray-800 ${isBold ? "font-bold text-purple-700" : ""
        }`}
    >
      {isComponent ? value : String(value)}
    </div>
  </div>
);

export default LeaveRequestDetail;