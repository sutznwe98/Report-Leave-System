import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000/api";

const Icons = {
  UploadCloudIcon: (props) => (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
      />
    </svg>
  ),
};

const RequestLeave = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leaveData, setLeaveData] = useState({
    leave_type: "AL",
    start_date: "",
    end_date: "",
    backup_person: "",
    reason: "",
    assigned_pj_lead: "",
  });
  const [medicalCert, setMedicalCert] = useState(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alWarning, setAlWarning] = useState("");
  const [canTakePaidLeave, setCanTakePaidLeave] = useState(true);
  const [projectLeads, setProjectLeads] = useState([]);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const validateAnnualLeave = (startDateStr, endDateStr, joinDateStr) => {
    if (!startDateStr || !endDateStr) return "";

    // New: Check for 3-month eligibility from join date
    // if (joinDateStr) {
    //   const joinDate = new Date(joinDateStr);
    //   const eligibilityDate = new Date(new Date(joinDate).setMonth(joinDate.getMonth() + 3));
    //   const today = new Date();

    //   if (today < eligibilityDate) {
    //     return `You are not eligible for Annual Leave until 3 months after your join date. Eligibility starts on: ${eligibilityDate.toLocaleDateString()}.`;
    //   }
    // } else {
    //   // If join_date is not available, they are not eligible for AL.
    //   return "Your join date is not set, so you are not eligible for Annual Leave.";
    // }

    const now = new Date();
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start) || isNaN(end) || start > end) return "Invalid date range.";
    const minStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    if (start < minStart)
      return "Annual Leave must be requested at least 48 hours in advance.";
    let cursor = new Date(start);
    while (cursor <= end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const segmentEnd = end < monthEnd ? end : monthEnd;
      const segDays = Math.floor((segmentEnd - cursor) / MS_PER_DAY) + 1;
      if (segDays > 2)
        return "Annual Leave cannot exceed 2 consecutive days within a month.";
      cursor = new Date(
        segmentEnd.getFullYear(),
        segmentEnd.getMonth(),
        segmentEnd.getDate() + 1
      );
    }
    return "";
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user?.id) return;
        const token = user?.token || localStorage.getItem('token');

        // First, get the current employee record
        const employeeRes = await axios.get(`${API_URL}/employees/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const empRaw = employeeRes.data;
        console.log('RequestLeave: raw employee response', empRaw);

        // Normalize different possible response shapes:
        // - { employee: {...} }
        // - { data: {...} }
        // - [{...}]
        // - {...}
        let emp = (empRaw && (empRaw.employee || empRaw.data)) || (Array.isArray(empRaw) ? empRaw[0] : empRaw) || {};
        // Some backends nest further: { data: { employee: {...} } }
        if (emp && emp.data && emp.data.employee) emp = emp.data.employee;
        console.log('RequestLeave: normalized employee object', emp);

        // Gather project ids: main project and other project assignments
        const projectIds = new Set();
        const addPid = (raw) => {
          if (raw === undefined || raw === null) return;
          const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : (typeof raw === 'number' ? raw : Number(raw));
          if (!isNaN(n) && n) projectIds.add(n);
        };
        addPid(emp.main_pj_id);
        addPid(emp.main_project_id);
        addPid(emp.mainProjectId);

        // Keep a candidate main project id from employee_project_positions table if present
        let mainPidFromPositions = null;

        // Also support other common shapes that may list project ids
        if (Array.isArray(emp.project_ids)) emp.project_ids.forEach(id => addPid(id));
        if (Array.isArray(emp.pj_ids)) emp.pj_ids.forEach(id => addPid(id));
        if (Array.isArray(emp.projectIds)) emp.projectIds.forEach(id => addPid(id));
        if (Array.isArray(emp.assigned_projects)) emp.assigned_projects.forEach(id => addPid(id));
        if (Array.isArray(emp.assignments)) emp.assignments.forEach(a => { if (a?.project_id) addPid(a.project_id); });
        if (Array.isArray(emp.other_projects)) emp.other_projects.forEach(p => { if (p?.id) addPid(p.id); else if (p) addPid(p); });
        if (emp.project_ids && typeof emp.project_ids === 'string') emp.project_ids.split(',').map(s=>s.trim()).forEach(n=>{ const v=Number(n); if(!isNaN(v)&&v) addPid(v); });

        // If backend provides a join table array `employee_project_positions`, include those too
        if (Array.isArray(emp.employee_project_positions)) {
          console.log('RequestLeave: employee_project_positions', emp.employee_project_positions);
          emp.employee_project_positions.forEach(ep => {
            const pid = ep?.project_id || ep?.projectId || ep?.project?.id;
            addPid(pid);
            if (ep?.is_main_project || ep?.is_main) mainPidFromPositions = pid || mainPidFromPositions;
          });
        }

        // project_assignments may be array or other shapes
        if (Array.isArray(emp.project_assignments)) {
          emp.project_assignments.forEach(pa => {
            if (!pa) return;
            const maybeIds = [pa.project_id, pa.projectId, pa.id, pa.project?.id, pa.project?.project_id, pa.project_id];
            for (const mid of maybeIds) {
              if (mid) { projectIds.add(mid); break; }
            }
          });
        } else if (typeof emp.project_assignments === 'string') {
          emp.project_assignments.split(',').map(s => s.trim()).forEach(tokenStr => {
            const n = Number(tokenStr);
            if (!isNaN(n) && n) projectIds.add(n);
          });
        }

        if (Array.isArray(emp.projects)) {
          emp.projects.forEach(p => { if (p && (p.id || p.project_id)) projectIds.add(p.id || p.project_id); });
        }

        console.log('RequestLeave: projectIds', Array.from(projectIds));

        // If we couldn't find any project ids from the employee payload,
        // try a fallback endpoint that some backends expose for join-table rows.
        if (projectIds.size === 0) {
          try {
            const posRes = await axios.get(`${API_URL}/employees/${user.id}/project-positions`, { headers: { Authorization: `Bearer ${token}` } });
            const positions = Array.isArray(posRes.data) ? posRes.data : (posRes.data?.data || []);
            console.log('RequestLeave: fallback project-positions', positions);
            positions.forEach(ep => {
              const pid = ep?.project_id || ep?.projectId || ep?.project?.id || ep;
              addPid(pid);
              if (ep?.is_main_project || ep?.is_main) mainPidFromPositions = pid || mainPidFromPositions;
            });
            console.log('RequestLeave: projectIds after fallback', Array.from(projectIds));
          } catch (e) {
            console.log('RequestLeave: no fallback project-positions endpoint available or fetch failed', e?.message || e);
          }
        }

        // build a map of projectId -> projectName when available
        const projectNames = new Map();
        if (Array.isArray(emp.projects)) {
          emp.projects.forEach(p => {
            const pid = p?.id || p?.project_id;
            if (pid) projectNames.set(pid, p?.name || p?.project_name || p?.project || `Project ${pid}`);
          });
        }

        // If we still have no project ids, try several other common project endpoints as a last-resort
        if (projectIds.size === 0) {
          const fallbacks = [
            `${API_URL}/employees/${user.id}/projects`,
            `${API_URL}/employees/${user.id}/assignments`,
            `${API_URL}/projects/employee/${user.id}`,
            `${API_URL}/employees/${user.id}/project-positions`
          ];
          for (const url of fallbacks) {
            try {
              const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
              const body = r.data;
              const arr = Array.isArray(body) ? body : (body?.data || body?.projects || []);
              console.log('RequestLeave: fallback fetch', url, arr);
              if (Array.isArray(arr) && arr.length > 0) {
                arr.forEach(item => {
                  // item might be a raw id, or an object with id/project_id/project?.id
                  const pid = item?.id || item?.project_id || item?.project?.id || item;
                  addPid(pid);
                });
                if (projectIds.size > 0) break; // stop when we find something
              }
            } catch (e) {
              console.log('RequestLeave: fallback failed for', url, e?.message || e);
            }
          }
          console.log('RequestLeave: projectIds after extra fallbacks', Array.from(projectIds));
        }

        // Create one option per (lead, project) pair so the same person appears for each project they lead
        const perPair = [];
        const getLeadId = (l) => l?.id || l?.employee_id || l?.user_id || l?.employeeId || l?.userId;
        const mainPid = Number(emp.main_pj_id || emp.main_project_id || emp.mainProjectId || mainPidFromPositions) || null;
        console.log('RequestLeave: mainPid', mainPid);
        console.log('RequestLeave: projectNames map', Array.from(projectNames.entries ? projectNames.entries() : projectNames));

        for (const pid of projectIds) {
          try {
            // Ensure we have a readable project name for this pid when possible
            let pname = projectNames.get(pid);
            if (!pname) {
              // Try common project endpoints to fetch project metadata
              const projEndpoints = [
                `${API_URL}/projects/${pid}`,
                `${API_URL}/project/${pid}`,
                `${API_URL}/projects/${pid}/detail`,
                `${API_URL}/projects/${pid}/info`
              ];
              for (const purl of projEndpoints) {
                try {
                  const pres = await axios.get(purl, { headers: { Authorization: `Bearer ${token}` } });
                  const pb = pres.data;
                  const candidate = (pb && (pb.name || pb.project_name || pb.title || (pb.project && (pb.project.name || pb.project_name)))) || null;
                  if (candidate) {
                    projectNames.set(pid, candidate);
                    pname = candidate;
                    break;
                  }
                } catch (pe) {
                  // ignore and try next
                }
              }
            }
            const res = await axios.get(`${API_URL}/employees/project/${pid}/leads`, { headers: { Authorization: `Bearer ${token}` } });
            const list = Array.isArray(res.data) ? res.data : [];
            console.log(`RequestLeave: leads for project ${pid}`, list);
            pname = pname || projectNames.get(pid) || `Project ${pid}`;
            list.forEach(l => {
              const lid = getLeadId(l);
              if (!l || !lid) return;
              const name = l.employee_name || l.name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || `#${lid}`;
              const entry = {
                ...l,
                _leadId: lid,
                _projectId: pid,
                _projectName: pname,
                _idForValue: `${lid}-${pid}`,
                // displayName: show person name + position (if any) and the project they manage
                displayName: `${name}${l.position ? ` (${l.position})` : ''} — ${pname}`
              };
              perPair.push(entry);
            });
            // Log leads specifically for main vs other projects
            if (pid == mainPid) console.log(`RequestLeave: main project (${pid}) leads added:`, list.map(x => x?.id || x?.employee_id || x?.user_id));
            else console.log(`RequestLeave: other project (${pid}) leads added:`, list.map(x => x?.id || x?.employee_id || x?.user_id));
          } catch (e) {
            // ignore per-project failures
          }
        }

        // Sort so main project leads appear first
        perPair.sort((a, b) => {
          const aMain = a._projectId == mainPid ? 0 : 1;
          const bMain = b._projectId == mainPid ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          // otherwise, sort by project name then lead name
          if (a._projectName !== b._projectName) return a._projectName.localeCompare(b._projectName);
          return (a.displayName || '').localeCompare(b.displayName || '');
        });

        // split perPair into main vs other for clearer debugging
        const mainPairs = perPair.filter(p => p._projectId == mainPid);
        const otherPairs = perPair.filter(p => p._projectId != mainPid);
        console.log('RequestLeave: perPair MAIN', mainPairs);
        console.log('RequestLeave: perPair OTHER', otherPairs);
        console.log('RequestLeave: perPair (lead-project pairs)', perPair);
        setProjectLeads(perPair);

        // Set leave eligibility
        if (emp?.joined_date) {
          const joinDate = new Date(emp.joined_date);
          const threeMonthsAfterJoin = new Date(joinDate);
          threeMonthsAfterJoin.setMonth(joinDate.getMonth() + 3);
          const today = new Date();
          setCanTakePaidLeave(today >= threeMonthsAfterJoin);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();

    if (leaveData.leave_type === "AL") {
      const warn = validateAnnualLeave(
        leaveData.start_date,
        leaveData.end_date,
        user?.join_date
      );
      setAlWarning(warn);
    } else {
      setAlWarning("");
    }
  }, [leaveData.leave_type, leaveData.start_date, leaveData.end_date, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLeaveData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setMedicalCert(e.target.files[0]);
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    if (!user || !user.id) {
      setMessage("User session required to submit leave.");
      return;
    }

    // Check if user is trying to take disallowed leave within first 3 months
    // Allow full unpaid (UPL) and half unpaid (HUL) during the first 3 months
    if (!canTakePaidLeave && !["UPL", "HUL"].includes(leaveData.leave_type)) {
      setMessage("You can only take unpaid leave (full or half) during your first 3 months of employment.");
      return;
    }

    if (leaveData.leave_type === "ML" && !medicalCert) {
      setMessage("Medical certificate is required for Medical Leave.");
      return;
    }

    if (leaveData.leave_type === "AL") {
      const warn = validateAnnualLeave(
        leaveData.start_date,
        leaveData.end_date,
        user?.join_date
      );
      if (warn) {
        setMessage(warn);
        return;
      }
    }

    setIsSubmitting(true);

    const formData = new FormData();
    // If we used a composite value like "<leadId>-<projectId>" for display, extract only the lead id for the API
    const assignedRaw = leaveData.assigned_pj_lead;
    const assignedToSend = assignedRaw && typeof assignedRaw === 'string' && assignedRaw.includes('-') ? assignedRaw.split('-')[0] : assignedRaw;
    const payload = { ...leaveData, assigned_pj_lead: assignedToSend };
    Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
    const employeeIdNumeric =
      typeof user.id === "string" ? parseInt(user.id, 10) : user.id;
    formData.append("employee_id", employeeIdNumeric);

    if (leaveData.leave_type === "ML" && medicalCert) {
      formData.append("medical_certificate", medicalCert);
    }

    try {
      const token = user?.token || localStorage.getItem("token");
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      // Ensure we only pass a single config object to axios.post.
      // Axios will set the correct multipart Content-Type boundary automatically.
      const response = await axios.post(`${API_URL}/leaves`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const savedLeave = response.data;
      let successMessage = "Leave request submitted successfully!";
      if (savedLeave.medical_certificate_url)
        successMessage += " Medical certificate attached and saved.";

      setMessage(successMessage);
      setLeaveData({
        leave_type: "AL",
        start_date: "",
        end_date: "",
        backup_person: "",
        reason: "",
      });
      setMedicalCert(null);
      const fileInput = document.getElementById("file-upload");
      if (fileInput) fileInput.value = null;
      if (fileInput) fileInput.value = null;

      // Redirect based on user role after successful submission
      if (user.role === "employee") {
        // Redirect employee to PJ Lead dashboard or relevant page
        navigate("/pj-lead/dashboard"); // Change this to your actual PJ Lead dashboard route
      } else if (user.role === "pj lead") {
        // Redirect PJ Lead to Admin dashboard or relevant page
        navigate("/admin/dashboard"); // Change this to your actual Admin dashboard route
      } else {
        // Optional: default redirect or do nothing
        navigate("/");
      }
    } catch (error) {
      console.error("Failed to submit leave", error);
      const status = error.response?.status;
      let errorMessage = "Failed to submit leave. Please check server status and network.";

      // Surface validation/overlap details from the server when available
      if (status === 400) {
        errorMessage = `Submission Error: ${error.response?.data?.message || 'Missing required fields.'}`;
      } else if (status === 409) {
        // Overlap conflict: show server-provided overlap rows if present
        const overlaps = error.response?.data?.overlaps;
        if (overlaps && Array.isArray(overlaps) && overlaps.length > 0) {
          errorMessage = `Conflict: Your requested dates overlap with an existing leave (id=${overlaps[0].id}).`;
        } else {
          errorMessage = `Conflict: ${error.response?.data?.message || 'Overlap detected.'}`;
        }
      } else if (status === 500) {
        errorMessage = "Server Error: The backend crashed while processing the request.";
      }

      setMessage(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 bg-gray-50 min-h-screen">
      <h2 className="text-3xl font-extrabold text-gray-900 mb-8 text-center">
        Submit Leave Request
      </h2>
      {!canTakePaidLeave && (
        <div className="p-4 mb-6 rounded-md bg-green-50 border border-black-200 text-black-700">
          <strong className="font-semibold">Note:</strong>{" "}
          Annual Leave (AL) is available only after 3 months from your join date. During your first 3 months you can only take Unpaid Leave (full or half).
        </div>
      )}
      <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="assigned_pj_lead"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Leave Requests to Project Lead
            </label>
            <select
              id="assigned_pj_lead"
              name="assigned_pj_lead"
              value={leaveData.assigned_pj_lead}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-indigo-500 focus:border-indigo-500"
              required
              disabled={isSubmitting}
            >
              <option value="">Select Project Lead</option>
              {projectLeads.map((lead) => (
                <option key={lead._idForValue || lead.id} value={lead._idForValue || lead.id}>
                    {lead.displayName || lead.employee_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || `#${lead._leadId || lead.id}`} {lead.position ? `(${lead.position})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="leave_type"
              className="block text-sm font-medium text-gray-700"
            >
              Leave Type
            </label>
            <select
              value={leaveData.leave_type}
              onChange={handleChange}
              name="leave_type"  // Add name to match handleChange
              required
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select Leave Type</option>
              {canTakePaidLeave ? (
                <>
                  <option value="AL">Annual Leave</option>
                  <option value="ML">Medical Leave</option>
                  <option value="UPL">Unpaid Leave</option>
                  <option value="HUL">Half Unpaid Leave</option>
                </>
              ) : (
                <>
                  <option value="UPL">Unpaid Leave (Full)</option>
                  <option value="HUL">Half Unpaid Leave (Half)</option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="start_date"
                className="block text-sm font-medium text-gray-700"
              >
                Start Date
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={leaveData.start_date}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                required
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label
                htmlFor="end_date"
                className="block text-sm font-medium text-gray-700"
              >
                End Date
              </label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                value={leaveData.end_date}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>
          {leaveData.leave_type === "AL" && alWarning && (
            <p className="mt-2 text-sm p-2 rounded bg-red-100 text-red-700">
              {alWarning}
            </p>
          )}

          <div>
            <label
              htmlFor="backup_person"
              className="block text-sm font-medium text-gray-700"
            >
              Backup Person
            </label>
            <input
              type="text"
              id="backup_person"
              name="backup_person"
              value={leaveData.backup_person}
              onChange={handleChange}
              placeholder="Who will cover for you?"
              className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-gray-700"
            >
              Reason
            </label>
            <textarea
              id="reason"
              name="reason"
              value={leaveData.reason}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg mt-1 h-24 resize-none focus:ring-indigo-500 focus:border-indigo-500"
              required
              disabled={isSubmitting}
            ></textarea>
          </div>

          {leaveData.leave_type === "ML" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Medical Certificate
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md bg-gray-50">
                <div className="space-y-1 text-center">
                  <Icons.UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-gray-50 rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none"
                    >
                      <span>
                        {medicalCert ? "Change File" : "Upload a file"}
                      </span>
                      <input
                        id="file-upload"
                        name="medical_cert"
                        type="file"
                        onChange={handleFileChange}
                        className="sr-only"
                        accept=".png, .jpg, .jpeg, .pdf"
                      />
                    </label>
                    {!medicalCert && <p className="pl-1">or drag and drop</p>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {medicalCert
                      ? medicalCert.name
                      : "PNG, JPG, PDF up to 10MB"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-300 disabled:bg-gray-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>

          {message && (
            <p
              className={`mt-4 text-center text-sm p-3 rounded-lg ${message.includes("successfully")
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
                }`}
            >
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default RequestLeave;
