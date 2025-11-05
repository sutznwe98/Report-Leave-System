import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NrcInput from "../components/NrcInput";
// --- Configuration ---
const API_URL = "http://localhost:5000/api";
const DEFAULT_TEAMS = ["MOT", "MOE"];
const initialFormData = {
  id: null,
  TMD: "",
  employee_name: "",
  position: "", // Main job title
  main_pj_id: null,
  main_pj_position: "",
  project_assignments: [], // Will only store OTHER projects
  wfh_office: "",
  joined_month: "",
  joined_date: "",
  marital_status: "",
  nrc_no: "",
  probation_period: "",
  after_probation: "",
  birthday_month: "",
  real_birth_date: "",
  birth_date_on_nrc: "",
  kbz_bank_account: "",
  bank: "",
  bank_acc: "",
  email: "",
  contact_no: "",
  parents_contact_no: "",
  current_address: "",
  address: "",
  contract_date: "",
  contract_by: "",
  teams: [],
  password: "", // Keep for creation/update
};

// --- Icons ---
const CloseIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M18 6L6 18M6 6L18 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// --- Modal Components ---
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto transform transition-all duration-300 scale-100 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const ConfirmModal = ({
  title,
  message,
  onConfirm,
  onCancel,
  isSubmitting,
}) => (
  <div className="fixed inset-0 z-[60] overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-auto transform transition-all duration-300 scale-100">
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
      <div className="flex justify-end gap-3 py-3 px-4 bg-gray-50 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-md flex items-center justify-center disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
);

// --- MultiSelect Dropdown ---
const MultiSelectDropdown = ({
  options,
  selectedValues,
  onToggle,
  placeholder = "Select an option",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayLabel =
    selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
      ? selectedValues[0]
      : selectedValues.join(", ");

  return (
    <div className="relative z-10" ref={dropdownRef}>
      <button
        type="button"
        className="w-full text-left bg-white border border-gray-300 rounded-lg shadow-sm px-4 py-2 text-gray-700 hover:bg-gray-50 flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span
          className={`truncate ${
            selectedValues.length === 0 ? "text-gray-500" : "text-gray-900"
          }`}
        >
          {displayLabel}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ml-2 ${
            isOpen ? "transform rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-lg shadow-2xl bg-white border border-gray-200 max-h-48 overflow-y-auto">
          {options.length > 0 ? (
            options.map((option) => {
              const isChecked = selectedValues.includes(option);
              const inputId = `checkbox-${option}`;
              return (
                <label
                  key={option}
                  htmlFor={inputId}
                  className="flex items-center p-2 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    id={inputId}
                    checked={isChecked}
                    onChange={(e) => {
                      onToggle(option, e.target.checked);
                    }}
                    className="form-checkbox h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mr-3"
                  />
                  <span className="text-gray-900 text-sm font-medium">
                    {option}
                  </span>
                </label>
              );
            })
          ) : (
            <div className="p-3 text-sm text-gray-500">
              No projects available.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- SingleSelect Dropdown ---
const SingleSelectDropdown = ({
  options,
  selectedValue,
  onSelect,
  placeholder = "Select an option",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    onSelect(option.value);
    setIsOpen(false);
  };

  const selectedLabel =
    options.find((opt) => opt.value === selectedValue)?.label || selectedValue;
  const displayLabel = selectedLabel || placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="w-full text-left bg-white border border-gray-300 rounded-lg shadow-sm px-4 py-2 text-gray-700 hover:bg-gray-50 flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span
          className={`truncate ${
            !selectedValue ? "text-gray-500" : "text-gray-900"
          }`}
        >
          {displayLabel}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ml-2 ${
            isOpen ? "transform rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-lg shadow-2xl bg-white border border-gray-200 max-h-48 overflow-y-auto">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option)}
              className="p-2 cursor-pointer hover:bg-indigo-50 transition-colors text-gray-900 text-sm font-medium"
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Employee Management Component ---
const EmployeeManagement = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [userAddedTeams, setUserAddedTeams] = useState([]);
  const [allProjects, setAllProjects] = useState([]); // New state for ALL projects
  const [newTeamName, setNewTeamName] = useState("");
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    employeeId: null,
    employeeName: "",
  });
  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  // Renamed modalError for team creation only
  const [teamCreationError, setTeamCreationError] = useState("");
  // New state for general submission errors to display in the modal
  const [formApiError, setFormApiError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otherProjectInput, setOtherProjectInput] = useState({
    id: "",
    position: "",
  });

  const [deleteError, setDeleteError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const roleOptions = [
    { value: "employee", label: "Employee" },
    { value: "pj lead", label: "Project Lead" },
    { value: "admin", label: "Admin" },
  ];

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-CA"); // YYYY-MM-DD format
    } catch (e) {
      return "Invalid Date";
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) {
      return employees;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return employees.filter((employee) => {
      return (
        (employee.employee_name || "").toLowerCase().includes(lowercasedFilter) ||
        (employee.TMD || "").toLowerCase().includes(lowercasedFilter) ||
        (employee.email || "").toLowerCase().includes(lowercasedFilter) ||
        (employee.project || "").toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [employees, searchTerm]);

  const fetchEmployees = useCallback(async () => {
    setError("");

    // Do not attempt to fetch if the user is not authenticated.
    if (!isAuthenticated) {
      return;
    }

    try {
      // Fetch both employees and projects
      const [employeesRes, projectsRes] = await Promise.all([
        axios.get(`${API_URL}/employees`),
        axios.get(`${API_URL}/projects`), // Assuming you have a /api/projects endpoint
      ]);

      const employeesData = Array.isArray(employeesRes.data)
        ? employeesRes.data
        : [];
      const projectsData = Array.isArray(projectsRes.data)
        ? projectsRes.data
        : [];

      setEmployees(employeesData); // This now includes main_project_name and project_assignments
      setAllProjects(projectsData.map((p) => ({ value: p.id, label: p.name })));
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        } catch (_) { }
        navigate('/login');
        return;
      }
      setError(`Failed to fetch employees. ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [navigate, isAuthenticated]);

  // --- Callbacks ---
  const handleTeamSelectionChange = useCallback((teamName, isChecked) => {
    setFormData((prev) => ({
      ...prev,
      teams: isChecked
        ? [...new Set([...(prev.teams || []), teamName])]
        : (prev.teams || []).filter((t) => t !== teamName),
    }));
  }, []);

  const handleProjectCheckboxChange = useCallback((project) => {
    setFormData((prev) => {
      const isAssigned = prev.project_assignments.some(
        (p) => p.project_id === project.value
      );
      if (isAssigned) {
        // Remove the project
        return {
          ...prev,
          project_assignments: prev.project_assignments.filter(
            (p) => p.project_id !== project.value
          ),
        };
      } else {
        // Add the project with a default position
        return {
          ...prev,
          project_assignments: [
            ...prev.project_assignments,
            {
              project_id: project.value,
              project_name: project.label,
              position_on_project: "Employee",
            },
          ],
        };
      }
    });
  }, []);

  const handleOtherProjectInputChange = (e) => {
    const { name, value } = e.target;
    setOtherProjectInput((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddOtherProject = (e) => {
    e.preventDefault();
    if (!otherProjectInput.id) return;

    const newProjectName = otherProjectInput.id.trim();

    // Check if the project already exists in the master list
    const projectExists = allProjects.some(
      (p) => p.label.toLowerCase() === newProjectName.toLowerCase()
    );

    if (projectExists) {
      setTeamCreationError(`Project "${newProjectName}" already exists.`);
      return;
    }

    // If it's a new project, add it to the master list.
    const newProject = {
      value: `new_${Date.now()}`, // Temporary unique ID for the frontend
      label: newProjectName,
    };
    setAllProjects((prev) => [...prev, newProject]);

    // Reset input fields
    setOtherProjectInput({ id: "", position: "" });
  };

  const handleRemoveOtherProject = (projectIdToRemove) => {
    setFormData((prev) => ({
      ...prev,
      project_assignments: prev.project_assignments.filter(
        (p) => p.project_id !== projectIdToRemove
      ),
    }));
  };

  const handleAddNewTeam = useCallback(() => {
    const trimmedName = newTeamName.trim();
    if (!trimmedName) return;
    const allCurrentTeams = [...DEFAULT_TEAMS, ...userAddedTeams];
    if (allCurrentTeams.includes(trimmedName)) {
      setTeamCreationError(`Main Project "${trimmedName}" already exists.`);
      return;
    }
    // In a real application, you would make an API call here to create the project
    // and then refetch the projects list or add the new project to the state.
    // For this example, we'll simulate adding it to the local state.
    const newProjectId = `new_${Date.now()}`; // Simulate a new ID
    const newProject = { id: newProjectId, name: trimmedName };

    // Update allProjects state
    setAllProjects((prev) => [
      ...prev,
      { value: newProject.id, label: newProject.name },
    ]);

    // Add this new project to the current employee's other project assignments
    setFormData((prevFormData) => {
      const updatedAssignments = [...(prevFormData.project_assignments || [])];
      // Only add if it's not already there (e.g., if the user re-adds the same name)
      if (
        !updatedAssignments.some(
          (a) =>
            a.project_id === newProject.id || a.project_name === newProject.name
        )
      ) {
        updatedAssignments.push({
          project_id: newProject.id,
          project_name: newProject.name,
          position_on_project: "Employee",
        });
      }
      return { ...prevFormData, project_assignments: updatedAssignments };
    });

    // Clear the input field and any error
    setNewTeamName("");
    setTeamCreationError("");
  }, [newTeamName, allProjects]);

  const handleDeleteCustomTeam = useCallback((teamToDelete) => {
    setUserAddedTeams((prev) => prev.filter((team) => team !== teamToDelete));
    // If the deleted team was selected, clear it from the form
    if (formData.project === teamToDelete) {
      setFormData((prev) => ({ ...prev, project: "" }));
    }
    setTeamCreationError("");
  }, []);

  // --- Fetch Employees ---
  useEffect(() => {
    const init = async () => {
      if (isAuthenticated) {
        // Already authenticated, fetch employees
        console.log("Already authenticated, fetching employees...");
        fetchEmployees();
      }
    };
    init();
  }, [isAuthenticated, fetchEmployees]);
  
    // This effect runs *after* isAuthenticated changes to true post-login
    useEffect(() => {
      if (isAuthenticated) {
        console.log("Authentication successful, fetching employees...");
        fetchEmployees();
      }
    }, [isAuthenticated, fetchEmployees]);

  // --- Selection ---
  const handleSelectOne = (id, checked) =>
    setSelectedEmployeeIds((prev) =>
      checked ? [...prev, id] : prev.filter((eid) => eid !== id)
    );
  const handleSelectAll = (checked) =>
    setSelectedEmployeeIds(checked ? employees.map((emp) => emp.id) : []);
  const isAllSelected =
    employees.length > 0 && selectedEmployeeIds.length === employees.length;
  const isIndeterminate =
    selectedEmployeeIds.length > 0 &&
    selectedEmployeeIds.length < employees.length;

  // --- Form Handlers ---
  const handleInputChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  // FIX: Explicitly set formData to an empty state for creation
  const handleOpenCreateModal = () => {
    setFormData({ ...initialFormData }); // spread to avoid mutation
    setIsEditMode(false);
    setTeamCreationError("");
    setFormApiError(""); // Clear API error
    setIsModalOpen(true);
    setError("");
    setSuccessMessage("");
  };

  const handleOpenEditModal = (emp) => {
    // Helper to format date strings (like '2023-10-27T17:00:00.000Z') to 'YYYY-MM-DD' for the input
    const formatDateForInput = (dateString) => {
      if (!dateString) return "";
      try {
        return new Date(dateString).toISOString().split("T")[0];
      } catch (e) {
        return "";
      }
    };
    // Reset password field when opening edit modal
    setFormData({
      ...emp,
      // The backend now sends project_assignments directly
      project_assignments: emp.project_assignments || [],
      project: emp.project || null, // Ensure the main project is correctly populated
      main_pj_id: emp.main_project_name || emp.main_pj_id || null,
      main_pj_position: emp.main_pj_position || "",
      password: "",
      joined_date: formatDateForInput(emp.join_date), // from GET response
      real_birth_date: formatDateForInput(emp.birthday), // from GET response
      birth_date_on_nrc: formatDateForInput(emp.birth_date_on_nrc),
      contract_date: formatDateForInput(emp.contract_date),
    });
    setIsEditMode(true);
    setTeamCreationError("");
    setFormApiError(""); // Clear API error
    setIsModalOpen(true);
    setError("");
    setOtherProjectInput({ id: "", position: "" });
    setSuccessMessage("");
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTeamCreationError("");
    setFormApiError(""); // Clear API error
    setIsSubmitting(false);
    setFormData(initialFormData);
    setOtherProjectInput({ id: "", position: "" });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setSuccessMessage(""); // Clear previous success message
    setFormApiError(""); // Clear previous API error from modal
    try {
      const token = localStorage.getItem("token");
      const config = token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {};

      const payload = {
        ...formData,
        employee_name: (formData.employee_name || formData.name || "").trim(),
        email: (formData.email || "").trim(),
        joined_date:
          formData.joined_date || new Date().toISOString().split("T")[0], // Ensure joined_date is sent
        // project_assignments is already in the correct format (array of objects)
        project_assignments: formData.project_assignments || [],
      };

      if (isEditMode) {
        await axios.put(`${API_URL}/employees/${formData.id}`, payload, config);
        setSuccessMessage("Employee updated successfully.");
      } else {
        await axios.post(`${API_URL}/employees`, payload, config);
        setSuccessMessage("Employee created successfully.");
      }
      fetchEmployees(); // Refresh list
      handleCloseModal(); // Close modal only on success
    } catch (err) {
      console.error("Submit failed:", err);

      const errorMessage = err.response
        ? err.response.data.message || err.message
        : err.message;

      // CRITICAL FIX: If it's a validation error (like duplicate email, status 400-499),
      // set the error inside the modal and DO NOT close it.
      if (
        err.response &&
        err.response.status >= 400 &&
        err.response.status < 500
      ) {
        setFormApiError(`Failed to submit: ${errorMessage}`);
      } else {
        // For other server errors, show the error on the main page and close modal.
        setError(`An unexpected error occurred: ${errorMessage}`);
        handleCloseModal();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Delete Logic ---
  const openDeleteConfirm = (emp) => {
    // Prevent deleting super admin (admin role)
    const role = emp?.role ? String(emp.role).toLowerCase() : "";
    if (role === "admin") {
      setError("Super admin account cannot be deleted.");
      return;
    }
    setConfirmModal({
      isOpen: true,
      employeeId: emp.id,
      employeeName: emp.name,
    });
  };

  const closeDeleteConfirm = () => {
    setConfirmModal({ isOpen: false, employeeId: null, employeeName: "" });
  };

  const handleDeleteEmployee = async () => {
    if (!confirmModal.employeeId) return;

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found. Please log in again.");
      }

      console.log("Attempting to delete employee ID:", confirmModal.employeeId);
      console.log("Authorization token:", token ? "Token exists" : "No token");

      const response = await axios.delete(
        `${API_URL}/employees/${confirmModal.employeeId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Delete response:", response.data);

      if (response.data.success) {
        setSuccessMessage(
          `Employee ${confirmModal.employeeName} deleted successfully.`
        );
        fetchEmployees(); // Refresh list
        setSelectedEmployeeIds((prev) =>
          prev.filter((id) => id !== confirmModal.employeeId)
        );
      } else {
        throw new Error(response.data.message || "Failed to delete employee");
      }
    } catch (err) {
      console.error("Delete failed:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        config: {
          url: err.config?.url,
          method: err.config?.method,
          headers: {
            ...err.config?.headers,
            // Don't log the actual token
            Authorization: err.config?.headers?.Authorization
              ? "Bearer [TOKEN]"
              : "Not set",
          },
        },
      });

      let errorMessage = "Failed to delete employee. Please try again.";

      if (err.response) {
        // Server responded with an error status code
        if (err.response.status === 403) {
          errorMessage = "You do not have permission to delete employees.";
        } else if (err.response.status === 404) {
          errorMessage = "Employee not found or already deleted.";
        } else if (err.response.data?.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = "No response from server. Please check your connection.";
      } else {
        // Something happened in setting up the request
        errorMessage =
          err.message || "An error occurred while setting up the request.";
      }

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
      closeDeleteConfirm();
    }
  };

  if (isLoading && employees.length === 0)
    return <div className="p-6 text-center">Loading...</div>;
  if (!isAuthenticated)
    return <div className="p-6 text-center">Authenticating...</div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-3xl font-bold text-gray-900">
          Employee Management
        </h1>
        <button
          onClick={handleOpenCreateModal}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center gap-2"
        >
          {/* Using inline SVG for PlusIcon */}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            ></path>
          </svg>
          Add Employee
        </button>
      </div>

      {/* --- Main Alerts --- */}
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {successMessage && (
        <div
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative"
          role="alert"
        >
          <strong className="font-bold">Success: </strong>
          <span className="block sm:inline">{successMessage}</span>
        </div>
      )}

      {/* --- Filter Input --- */}
      <div className="my-4">
        <input
          type="text"
          placeholder="Filter by name, TMD, email, or main project..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* --- Table --- */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
            <tr>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                No.
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                TMD
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Employee Name
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Role
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Position
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Main Project
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Other Projects
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                WFH/Office
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Joined Date
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Marital Status
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                NRC No
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Probation Salary
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                After Probation Salary
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Real Birth Date
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Birth Date on NRC
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                KBZ Bank Acc
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Bank
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Bank Acc
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Email
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Contact No
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Parents Contact No
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Current Address
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Address
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Contract Date
              </th>
              <th
                scope="col"
                className="sticky top-0 px-6 py-3 text-center bg-gray-100 z-10"
              >
                Contract By
              </th>
              <th
                scope="col"
                className="sticky top-0 right-0 px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider bg-gray-100 z-20"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp, index) => (
                <tr
                  key={emp.id}
                  className="group hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.TMD || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <Link
                      to={`/admin/employees/${emp.id}`}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {emp.employee_name || "N/A"}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm capitalize">
                    {emp.role || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.position || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.project || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.other_project || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.wfh_office || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatDateForDisplay(emp.joined_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.marital_status || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.nrc_no || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.probation_period || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.after_probation || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatDateForDisplay(emp.real_birth_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatDateForDisplay(emp.birth_date_on_nrc)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.kbz_bank_account || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.bank || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.bank_acc || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.email || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.contact_no || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.parents_contact_no || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm truncate max-w-xs">
                    {emp.current_address || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm truncate max-w-xs">
                    {emp.address || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatDateForDisplay(emp.contract_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.contract_by || "N/A"}
                  </td>
                  <td className="sticky right-0 px-6 py-4 whitespace-nowrap text-sm font-medium text-center space-x-3 bg-white group-hover:bg-gray-50">
                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="text-indigo-600 hover:text-indigo-900 transition-colors"
                    >
                      Edit
                    </button>
                    {String(emp.role || "").toLowerCase() !== "admin" && (
                      <button
                        onClick={() => openDeleteConfirm(emp)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="28"
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {isLoading
                    ? "Loading..."
                    : "No employees found. Try adjusting your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={isEditMode ? "Edit Employee" : "Add Employee"}
          onClose={handleCloseModal}
        >
          {/* Display API error at the top of the modal content */}
          {formApiError && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-5"
              role="alert"
            >
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{formApiError}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Name
              </label>
              <input
                type="text"
                name="employee_name"
                placeholder="Full Name"
                value={formData.employee_name || formData.name}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="Email Address"
                value={formData.email || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                required
                autoComplete="off"
                maxLength={254}
              />
            </div>

            {/* --- PASSWORD FIELD: Uses type="text" in Edit Mode --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
                {isEditMode && (
                  <span className="text-xs text-gray-500 ml-1">
                    (Leave blank to keep current)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder={
                    isEditMode ? "Enter new password" : "Required Password"
                  }
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 px-3 py-2 pr-10 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  required={!isEditMode}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064-7 9.542-7 .847 0 1.67.127 2.452.364m1.028 1.028A9.952 9.952 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.05 10.05 0 01-2.452 4.364m-1.028-1.028L12 12m-2.125-2.125L6.175 6.175m11.65 11.65L12 12"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {/* --- END PASSWORD FIELD --- */}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Position
              </label>
              <input
                type="text"
                name="position"
                placeholder="Job Title (e.g., Developer)"
                value={formData.position || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Join Date
              </label>
              <input
                type="date"
                name="joined_date"
                value={formData.joined_date || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birthday
              </label>
              <input
                type="date"
                name="real_birth_date"
                value={formData.real_birth_date || formData.birthday || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* All new fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact No
              </label>
              <input
                type="text"
                name="contact_no"
                value={formData.contact_no || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WFH/Office
              </label>
              <SingleSelectDropdown
                options={[
                  { value: "WFH", label: "Work From Home" },
                  { value: "Office", label: "Office" },
                ]}
                selectedValue={formData.wfh_office}
                onSelect={(value) =>
                  setFormData((prev) => ({ ...prev, wfh_office: value }))
                }
                placeholder="Select status..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marital Status
              </label>
              <input
                type="text"
                name="marital_status"
                value={formData.marital_status || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            <NrcInput
              value={formData.nrc_no}
              onChange={(nrc) =>
                setFormData((prev) => ({ ...prev, nrc_no: nrc }))
              }
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Probation Period Salary
              </label>
              <input
                type="number"
                name="probation_period"
                value={
                  formData.probation_period === null ||
                  formData.probation_period === undefined
                    ? ""
                    : formData.probation_period
                }
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                After Probation Salary
              </label>
              <input
                type="number"
                name="after_probation"
                value={
                  formData.after_probation === null ||
                  formData.after_probation === undefined
                    ? ""
                    : formData.after_probation
                }
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birth Date on NRC
              </label>
              <input
                type="date"
                name="birth_date_on_nrc"
                value={formData.birth_date_on_nrc || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                KBZ Bank Account
              </label>
              <input
                type="text"
                name="kbz_bank_account"
                value={formData.kbz_bank_account || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Other Bank Name
              </label>
              <input
                type="text"
                name="bank"
                value={formData.bank || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Other Bank Account
              </label>
              <input
                type="text"
                name="bank_acc"
                value={formData.bank_acc || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parents' Contact No
              </label>
              <input
                type="text"
                name="parents_contact_no"
                value={formData.parents_contact_no || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Address
              </label>
              <textarea
                name="current_address"
                value={formData.current_address || ""}
                onChange={handleInputChange}
                rows="2"
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              ></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Permanent Address (from NRC)
              </label>
              <textarea
                name="address"
                value={formData.address || ""}
                onChange={handleInputChange}
                rows="2"
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              ></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contract Date
              </label>
              <input
                type="date"
                name="contract_date"
                value={formData.contract_date || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contract By
              </label>
              <input
                type="text"
                name="contract_by"
                value={formData.contract_by || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            {/* Fields that are calculated or less frequently edited, can be hidden or removed if not needed */}
            <div className="hidden">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Joined Month
              </label>
              <input
                type="text"
                name="joined_month"
                value={formData.joined_month || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
                placeholder="e.g., January"
              />
            </div>
            <div className="hidden">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birthday Month
              </label>
              <input
                type="text"
                name="birthday_month"
                value={formData.birthday_month || ""}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm"
                placeholder="e.g., January"
              />
            </div>

            {/* --- Main Project Configuration --- */}
            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Main Project Configuration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Main Project
                  </label>
                  <SingleSelectDropdown
                    options={DEFAULT_TEAMS.map((p) => ({ value: p, label: p }))}
                    selectedValue={formData.main_pj_id}
                    onSelect={(value) =>
                      setFormData((prev) => ({ ...prev, main_pj_id: value }))
                    }
                    placeholder="Select a main project..."
                  />
                  {/* Display the selected project name if available */}
                </div>

                {/* --- Role Selection --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <SingleSelectDropdown
                    options={roleOptions}
                    selectedValue={formData.role}
                    onSelect={(value) =>
                      setFormData((prev) => ({ ...prev, role: value }))
                    }
                    placeholder="Select a role..."
                  />
                </div>
              </div>
            </div>

            {/* --- Other Projects Section --- */}
            <div className="bg-indigo-50 p-4 rounded-lg shadow-inner">
              <h3 className="text-lg font-bold text-indigo-700 mb-4">
                Other Project Assignments
              </h3>

              {/* Checkbox list of existing projects */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  Select Existing Other Projects:
                </p>
                {allProjects.filter((p) => !DEFAULT_TEAMS.includes(p.label))
                  .length === 0 ? (
                  <p className="text-xs italic text-gray-500">
                    No available projects found.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {allProjects
                      .filter((p) => !DEFAULT_TEAMS.includes(p.label))
                      .map((project) => {
                        const isAssigned = (
                          formData.project_assignments || []
                        ).some((p) => p.project_id === project.value);
                        return (
                          <label
                            key={project.value}
                            className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-colors ${
                              isAssigned
                                ? "bg-indigo-200 border border-indigo-500 shadow-md"
                                : "bg-white border border-gray-300 hover:bg-indigo-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={() =>
                                handleProjectCheckboxChange(project)
                              }
                              className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-gray-800">
                              {project.label}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Manual Input for Project ID (or Name) and Position */}
              <form onSubmit={handleAddOtherProject} className="space-y-4">
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-800 mb-2 border-t pt-4 border-indigo-200">
                    Manually Add Project Assignment:
                  </p>

                  <div className="flex items-start space-x-2">
                    {/* Manual Project ID/Name Input */}
                    <input
                      type="text"
                      name="id"
                      placeholder="Project ID or Name (e.g., manual-999)"
                      value={otherProjectInput.id}
                      onChange={(e) => {
                        handleOtherProjectInputChange(e);
                        setTeamCreationError("");
                      }}
                      className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3"
                    />

                    <button
                      type="button"
                      onClick={handleAddOtherProject}
                      className="px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      disabled={!otherProjectInput.id}
                    >
                      Add
                    </button>
                  </div>

                  {teamCreationError && (
                    <div className="text-red-600 text-sm mt-1">
                      {teamCreationError}
                    </div>
                  )}
                </div>
              </form>

              {/* Display Assigned Other Projects */}
              <div className="mt-6 p-4 bg-white rounded-lg border border-indigo-100">
                <p className="text-sm font-bold text-gray-700 mb-2">
                  Current Assignments:
                </p>
                {formData.project_assignments &&
                formData.project_assignments.length > 0 ? (
                  <div className="space-y-2">
                    {formData.project_assignments.map((pj) => (
                      <div
                        key={pj.project_id} // Use project_id as key
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-gray-50 p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-800 font-medium">
                            {pj.project_name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveOtherProject(pj.project_id)
                            }
                            className="text-red-500 hover:text-red-700 transition-colors text-xs font-semibold ml-4"
                          >
                            Remove
                          </button>
                        </div>
                        <div>
                          <SingleSelectDropdown
                            options={roleOptions}
                            selectedValue={pj.position_on_project}
                            onSelect={(newValue) =>
                              setFormData((prev) => ({
                                ...prev,
                                project_assignments:
                                  prev.project_assignments.map((a) =>
                                    a.project_id === pj.project_id
                                      ? { ...a, position_on_project: newValue }
                                      : a
                                  ),
                              }))
                            }
                            placeholder="Set Position..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center italic">
                    No other projects assigned.
                  </p>
                )}
              </div>
            </div>

            {/* --- Submit Button --- */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  isSubmitting || !formData.employee_name || !formData.email
                }
                className="w-full px-4 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? "Submitting..."
                  : isEditMode
                  ? "Save Changes"
                  : "Create Employee"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmModal.isOpen && (
        <ConfirmModal
          title={`Delete ${confirmModal.employeeName}?`}
          message="Are you sure you want to delete this employee? This action cannot be undone."
          isSubmitting={isSubmitting}
          onConfirm={handleDeleteEmployee}
          onCancel={closeDeleteConfirm}
        />
      )}
    </div>
  );
};

export default EmployeeManagement;
