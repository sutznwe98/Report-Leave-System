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
import formatRole from '../utils/formatRole';

// --- Configuration ---
const API_URL = "http://localhost:5000/api";
const initialFormData = {
    id: null,
    employee_id: "",
    description: "",
    qa_score: "",
    created_by_id: "",
    created_at: "",
    updated_at: "",
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
                    className={`truncate ${!selectedValue ? "text-gray-500" : "text-gray-900"
                        }`}
                >
                    {displayLabel}
                </span>
                <svg
                    className={`w-4 h-4 transition-transform duration-200 ml-2 ${isOpen ? "transform rotate-180" : ""
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

// --- QA Management Component ---
const QAManagement = () => {
    const { isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    const [qaRecords, setQaRecords] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedQaIds, setSelectedQaIds] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        qaId: null,
        qaName: "",
    });
    const [formData, setFormData] = useState(initialFormData);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [formApiError, setFormApiError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedDate, setSelectedDate] = useState("");

    const formatDateForDisplay = (dateString) => {
        if (!dateString) return "-";
        try {
            const date = new Date(dateString);
            // Format as Month-Day-Year (MM-DD-YYYY)
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            return `${month}-${day}-${year}`;
        } catch (e) {
            return "Invalid Date";
        }
    };

    const filteredQaRecords = useMemo(() => {
        return qaRecords.filter(
            (qa) => {
                // Search filter
                const matchesSearch = qa.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    qa.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    qa.qa_score?.toString().includes(searchTerm.toLowerCase());
                
                // Date filter
                let matchesDate = true;
                if (selectedDate && qa.created_at) {
                    const qaDate = new Date(qa.created_at);
                    const qaDateStr = `${qaDate.getFullYear()}-${String(qaDate.getMonth() + 1).padStart(2, '0')}-${String(qaDate.getDate()).padStart(2, '0')}`;
                    matchesDate = qaDateStr === selectedDate;
                }
                
                return matchesSearch && matchesDate;
            }
        );
    }, [qaRecords, searchTerm, selectedDate]);

    const fetchQaRecords = useCallback(async () => {
        setError("");

        if (!isAuthenticated) {
            return;
        }

        try {
            const [qaRes, employeesRes] = await Promise.all([
                axios.get(`${API_URL}/qa`),
                axios.get(`${API_URL}/employees`),
            ]);

            const qaData = Array.isArray(qaRes.data) ? qaRes.data : [];
            const employeesData = Array.isArray(employeesRes.data) ? employeesRes.data : [];

            // Build quick lookup for employee details
            const byId = new Map(employeesData.map(emp => [String(emp.id), emp]));

            // Enrich QA records with employee project info to avoid UI per-row fetches
            const enrichedQa = qaData.map(q => {
                const emp = byId.get(String(q.employee_id)) || byId.get(String(q.employeeId)) || null;
                const main_project_name = emp?.main_project_name || emp?.project || emp?.main_project || '';
                // Try several shapes for other projects
                let other_project_name = '';
                if (emp) {
                    if (Array.isArray(emp.project_assignments) && emp.project_assignments.length) {
                        other_project_name = emp.project_assignments.map(p => p.project_name || p.name || p).join(', ');
                    } else if (emp.other_project) {
                        other_project_name = emp.other_project;
                    } else if (emp.other_projects) {
                        other_project_name = Array.isArray(emp.other_projects) ? emp.other_projects.join(', ') : emp.other_projects;
                    }
                }

                return {
                    ...q,
                    main_project_name: main_project_name || q.main_project_name || '',
                    other_project_name: other_project_name || q.other_project_name || '',
                };
            });

            setQaRecords(enrichedQa);
            setEmployees(employeesData);
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
            setError(`Failed to fetch QA records. ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [navigate, isAuthenticated]);

    useEffect(() => {
        fetchQaRecords();
    }, [fetchQaRecords]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox"
                ? checked
                : type === "number"
                    ? value === "" ? "" : Number(value)
                    : value,
        }));
    };


    const resetForm = () => {
        setFormData(initialFormData);
        setFormApiError("");
    };

    const openAddModal = () => {
        resetForm();
        // Default to today in YYYY-MM-DD format for input
        const today = new Date().toISOString().split("T")[0];
        setFormData(prev => ({
            ...prev,
            created_at: today,
        }));
        setIsEditMode(false);
        setIsModalOpen(true);
    };

    const openEditModal = (qa) => {
        // Format the date to YYYY-MM-DD for the date input (using local timezone)
        const formatDateForInput = (dateString) => {
            if (!dateString) return "";
            try {
                const date = new Date(dateString);
                // Get local date components to avoid timezone issues
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } catch (e) {
                return "";
            }
        };

        setFormData({
            id: qa.id,
            employee_id: qa.employee_id || "",
            description: qa.description || "",
            qa_score: qa.qa_score || "",
            created_by_id: qa.created_by_id || "",
            created_at: formatDateForInput(qa.created_at),
            updated_at: qa.updated_at || "",
        });
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormApiError("");

        try {
            console.log('Form data before submission:', formData);
            console.log('created_at from form:', formData.created_at);

            const payload = {
                employee_id: Number(formData.employee_id),
                description: formData.description || null,
                qa_score: Number(formData.qa_score),
                created_by_id: user.id,
                created_at: formData.created_at ? `${formData.created_at} 00:00:00` : new Date().toISOString().slice(0, 19).replace("T", " "),
            };

            // Client-side validations to avoid 400 from server
            if (!payload.employee_id || isNaN(payload.employee_id) || payload.employee_id === 0) {
                setFormApiError('Please select an employee for the QA record.');
                setIsSubmitting(false);
                console.warn('Validation failed: missing employee_id', payload);
                return;
            }

            if (isEditMode) {
                await axios.put(`${API_URL}/qa/${formData.id}`, payload);
                setSuccessMessage("QA record updated successfully!");
            } else {
                await axios.post(`${API_URL}/qa`, payload);
                setSuccessMessage("QA record created successfully!");
            }

            closeModal();
            fetchQaRecords();
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (err) {
            setFormApiError(
                err.response?.data?.message ||
                `Failed to ${isEditMode ? "update" : "create"} QA record.`
            );
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleDelete = async (qaId) => {
        setIsSubmitting(true);
        setConfirmModal({ isOpen: false, qaId: null, qaName: "" });

        try {
            await axios.delete(`${API_URL}/qa/${qaId}`);
            setSuccessMessage("QA record deleted successfully!");
            fetchQaRecords();
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (err) {
            setError(`Failed to delete QA record. ${err.message}`);
            setTimeout(() => setError(""), 5000);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openConfirmModal = (qa) => {
        setConfirmModal({
            isOpen: true,
            qaId: qa.id,
            qaName: qa.description,
        });
    };

    const closeConfirmModal = () => {
        setConfirmModal({ isOpen: false, qaId: null, qaName: "" });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedQaIds(filteredQaRecords.map((qa) => qa.id));
        } else {
            setSelectedQaIds([]);
        }
    };

    const handleSelectOne = (qaId) => {
        setSelectedQaIds((prev) =>
            prev.includes(qaId)
                ? prev.filter((id) => id !== qaId)
                : [...prev, qaId]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedQaIds.length === 0) return;

        setIsSubmitting(true);
        try {
            await Promise.all(
                selectedQaIds.map((id) => axios.delete(`${API_URL}/qa/${id}`))
            );
            setSuccessMessage(`${selectedQaIds.length} QA records deleted successfully!`);
            setSelectedQaIds([]);
            fetchQaRecords();
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (err) {
            setError(`Failed to delete QA records. ${err.message}`);
            setTimeout(() => setError(""), 5000);
        } finally {
            setIsSubmitting(false);
        }
    };

    const employeeOptions = employees
        .filter((emp) => emp.role !== 'admin')
        .map((emp) => ({
            value: emp.id,
            label: `${emp.employee_name} (${emp.TMD})`,
        }));

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg text-gray-600">Loading QA records...</div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">QA Management</h1>
                <p className="text-gray-600 mt-2">Manage employee quality assurance records</p>
            </div>

            {successMessage && (
                <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
                    {successMessage}
                </div>
            )}

            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-lg shadow-md">
                <div className="p-4 border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                            <button
                                onClick={openAddModal}
                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                Add QA Record
                            </button>
                            {selectedQaIds.length > 0 && (
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isSubmitting ? "Deleting..." : `Delete Selected (${selectedQaIds.length})`}
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="relative w-full sm:w-64">
                                <input
                                    type="text"
                                    placeholder="Search QA records..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <svg
                                    className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {/* <button
                                    onClick={() => {
                                        if (selectedDate) {
                                            fetchQaRecords();
                                        }
                                    }}
                                    disabled={!selectedDate}
                                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    Filter
                                </button> */}
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setSelectedDate('');
                                        fetchQaRecords();
                                    }}
                                    className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Employee Name
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Main Project
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Other Project
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Role
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    QA Score
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Description
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            
                            {filteredQaRecords.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="px-6 py-12 text-center text-gray-500">
                                        {searchTerm ? "No QA records found matching your search." : "No QA records available."}
                                    </td>
                                </tr>
                            ) : (
                                filteredQaRecords.map((qa) => (
                                    <tr key={qa.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <Link to={`/admin/qa/${qa.employee_id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                                                {qa.employee_name || 'N/A'}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{qa.main_project_name || 'N/A'}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{qa.other_project_name
                                                ? qa.other_project_name.split(', ').map((p, i) => (
                                                    <span key={i} className="px-2 py-1 text-xs rounded bg-gray-100 mr-1">{p}</span>
                                                ))
                                                : 'N/A'
                                            }</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900"> {formatRole(qa.role)}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {qa.qa_score || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-600 max-w-xs truncate">{qa.description}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {formatDateForDisplay(qa.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => openEditModal(qa)}
                                                className="text-blue-600 hover:text-blue-900 mr-3"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => openConfirmModal(qa)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <Modal title={isEditMode ? "Edit QA Record" : "Add QA Record"} onClose={closeModal}>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {formApiError && (
                            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                                {formApiError}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Employee *
                            </label>
                            <SingleSelectDropdown
                                options={employeeOptions}
                                selectedValue={formData.employee_id}
                                onSelect={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
                                placeholder="Select an employee"
                            />
                        </div>

                        {/* Title field removed — QA table doesn't have a separate title column */}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                QA Score *
                            </label>
                            <input
                                type="number"
                                name="qa_score"
                                value={formData.qa_score}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter QA score (0-100)"
                                min="0"
                                max="100"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date *
                            </label>
                            <input
                                type="date"
                                name="created_at"
                                value={formData.created_at}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                rows="4"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter QA description"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center disabled:opacity-50"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update QA Record" : "Create QA Record")}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {confirmModal.isOpen && (
                <ConfirmModal
                    title="Delete QA Record"
                    message={`Are you sure you want to delete the QA record for ${confirmModal.qaName}? This action cannot be undone.`}
                    onConfirm={() => handleDelete(confirmModal.qaId)}
                    onCancel={closeConfirmModal}
                    isSubmitting={isSubmitting}
                />
            )}
        </div>
    );
};

export default QAManagement;