import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import axios from "axios";

// --- Configuration ---
const API_URL = "http://localhost:5000/api";
const DEFAULT_TEAMS = ["MOT", "MOE", "AI"];
const initialFormData = {
  id: null,
  name: "",
  email: "",
  password: "",
  position: "",
  teams: [],
};

// --- Auth Context ---
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userString = localStorage.getItem("user");
    const tokenString = localStorage.getItem("token");
    if (userString && tokenString) {
      try {
        setUser(JSON.parse(userString));
        setToken(tokenString);
        axios.defaults.headers.common[
          "Authorization"
        ] = `Bearer ${tokenString}`;
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        // Clear corrupted data
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });
      if (response.data.token) {
        const { token, user } = response.data;
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        setToken(token);
        setUser(user);
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      }
      return response;
    } catch (err) {
      console.error("Login API call failed:", err);
      // Fallback logic for frontend-only demo
      if (!localStorage.getItem("token")) {
        // Mock user based on attempted login email, or a default
        const mockEmail = email || "admin@ems.com"; 
        const mockToken = "mock-admin-token-fallback";
        const mockUser = { id: "ADM_MOCK", name: "Mock Admin", email: mockEmail };
        
        localStorage.setItem("token", mockToken);
        localStorage.setItem("user", JSON.stringify(mockUser));
        setToken(mockToken);
        setUser(mockUser);
        axios.defaults.headers.common["Authorization"] = `Bearer ${mockToken}`;
        console.warn(
          "Backend login failed. Using mock token for frontend access."
        );
        // Return a mock response structure
        return { data: { token: mockToken, user: mockUser } };
      }
      // Re-throw if it's not about the initial login failure
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, loading, isAuthenticated: !!user }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined || context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
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

// --- Employee Management Component ---
const EmployeeManagement = () => {
  const { isAuthenticated, login } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [userAddedTeams, setUserAddedTeams] = useState([]);
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

  const fetchEmployees = useCallback(async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/employees`);
      const rows = Array.isArray(response.data) ? response.data : [];
      const transformedEmployees = rows.map((emp) => ({
        ...emp,
        teams: Array.isArray(emp.teams)
          ? emp.teams
          : (typeof emp.team === 'string'
              ? emp.team.split(',').map(t => t.trim()).filter(Boolean)
              : []),
      }));
      setEmployees(transformedEmployees);
      const allTeamsFromData = new Set(
        transformedEmployees.flatMap((emp) => emp.teams || [])
      );
      setUserAddedTeams(
        [...allTeamsFromData].filter((t) => !DEFAULT_TEAMS.includes(t))
      );
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch (_) {}
        window.location.href = '/login';
        return;
      }
      setError(`Failed to fetch employees. ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Callbacks ---
  const handleTeamSelectionChange = useCallback((teamName, isChecked) => {
    setFormData((prev) => ({
      ...prev,
      teams: isChecked
        ? [...new Set([...(prev.teams || []), teamName])]
        : (prev.teams || []).filter((t) => t !== teamName),
    }));
  }, []);

  const handleAddNewTeam = useCallback(() => {
    const trimmedName = newTeamName.trim().toUpperCase();
    if (!trimmedName) return;
    const allCurrentTeams = [...DEFAULT_TEAMS, ...userAddedTeams];
    if (allCurrentTeams.includes(trimmedName)) {
      setTeamCreationError(`Project "${trimmedName}" already exists.`);
      return;
    }
    // Add to available projects
    setUserAddedTeams((prev) => [...prev, trimmedName]);
    // Auto-select the newly created project in the form's selected teams
    setFormData((prev) => ({
      ...prev,
      teams: [...new Set([...(prev.teams || []), trimmedName])],
    }));
    setNewTeamName("");
    setTeamCreationError("");
  }, [newTeamName, userAddedTeams]);

  const handleDeleteCustomTeam = useCallback((teamToDelete) => {
    setUserAddedTeams((prev) => prev.filter((team) => team !== teamToDelete));
    setFormData((prev) => ({
      ...prev,
      teams: (prev.teams || []).filter((t) => t !== teamToDelete),
    }));
    setTeamCreationError("");
  }, []);

  // --- Fetch Employees ---
  useEffect(() => {
    const init = async () => {
      // Check auth status first
      if (!isAuthenticated) {
        console.log("Not authenticated, attempting login...");
        try {
          // Attempt login without explicit credentials, relying on fallback logic inside login
          await login(); 
        } catch (authError) {
          console.error("Auth failed during init", authError);
          setError("Authentication failed. Please try again later.");
          setIsLoading(false);
        }
      } else {
        // Already authenticated, fetch employees
        console.log("Already authenticated, fetching employees...");
        fetchEmployees();
      }
    };
    init();
  }, [isAuthenticated, login, fetchEmployees]);

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
    // Reset password field when opening edit modal
    setFormData({ ...emp, password: "" });
    setIsEditMode(true);
    setTeamCreationError("");
    setFormApiError(""); // Clear API error
    setIsModalOpen(true);
    setError("");
    setSuccessMessage("");
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTeamCreationError("");
    setFormApiError(""); // Clear API error
    setIsSubmitting(false);
    setFormData(initialFormData);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setSuccessMessage(""); // Clear previous success message
    setFormApiError(""); // Clear previous API error from modal
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

      const payload = {
        ...formData,
        name: (formData.name || '').trim(),
        email: (formData.email || '').trim(),
        position: (formData.position || '').trim(),
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
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
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
      await axios.delete(`${API_URL}/employees/${confirmModal.employeeId}`);
      setSuccessMessage(
        `Employee ${confirmModal.employeeName} deleted successfully.`
      );
      fetchEmployees(); // Refresh list
      setSelectedEmployeeIds((prev) =>
        prev.filter((id) => id !== confirmModal.employeeId)
      ); // Remove from selection
    } catch (err) {
      console.error("Delete failed:", err);
      setError(
        `Failed to delete employee. ${
          err.response ? err.response.data.message : err.message
        }`
      );
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

      {/* --- Table --- */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
            <tr>
              <th scope="col" className="px-6 py-3 text-center w-12">
              </th>
              <th
                scope="col"
                className="py-3 px-4 text-left"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
              >
                Email
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
              >
                Position
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
              >
                Project
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="text-gray-700 divide-y divide-gray-100 font-semibold">
            {employees.length > 0 ? (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {emp.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {emp.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {emp.position || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {(emp.teams || []).join(", ") || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center space-x-3">
                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="text-indigo-600 hover:text-indigo-900 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDeleteConfirm(emp)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {isLoading ? "Loading..." : "No employees found."}
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
          
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                required
                maxLength={100}
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
                value={formData.email}
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
                  minLength={8}
                  maxLength={128}
                  pattern={"(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d@$!%*#?&]{8,128}"}
                  title="Password must be 8+ characters and include letters and numbers."
                />
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
              placeholder="Job Title"
              value={formData.position}
              onChange={handleInputChange}
              className="w-full border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              maxLength={100}
            />
          </div>

            {/* --- Project/Team Selection --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign Projects
              </label>
              <MultiSelectDropdown
                options={[...DEFAULT_TEAMS, ...userAddedTeams].sort()}
                selectedValues={formData.teams}
                onToggle={handleTeamSelectionChange}
                placeholder="Select projects..."
              />
            </div>

            {/* --- Add New Team --- */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add New Project
              </label>
              {teamCreationError && (
                <div className="text-red-600 text-sm mb-2">{teamCreationError}</div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New project name"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    setTeamCreationError(""); // Clear error on type
                  }}
                  className="flex-grow border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddNewTeam}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  Add
                </button>
              </div>
            </div>

            {/* --- Submit Button --- */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
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

// --- Main App Component ---
const App = () => {
  return (
    <AuthProvider>
      <EmployeeManagement />
    </AuthProvider>
  );
};

export default App;
