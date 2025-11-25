import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = 'http://localhost:5000';

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
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const EmployeeQADetail = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const [qaRecords, setQaRecords] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // State for QA creation form (only for employees, not admins)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    description: '',
    qa_score: '',
    created_at: new Date().toISOString().split('T')[0]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [createError, setCreateError] = useState('');

  // Determine if this is admin view or employee view
  const isAdminView = user?.role === 'admin' && employeeId;
  const targetEmployeeId = isAdminView ? employeeId : user?.id;

  // Format date helper
  const formatYMD = (date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month}-${day}-${year}`;
  };

  // Get month name
  const getMonthName = (monthNumber) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[parseInt(monthNumber) - 1] || 'Unknown';
  };

  // Fetch employee info
  const fetchEmployeeInfo = useCallback(async () => {
    // For employee view, use current user info directly
    if (user.role === 'employee' || user.role === 'pj lead') {
      setEmployee(user);
      return;
    }

    // For admin view, fetch employee data from API
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/employees/${targetEmployeeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployee(response.data);
    } catch (err) {
      console.error('Failed to fetch employee info:', err);
      setError('Failed to fetch employee information');
    }
  }, [targetEmployeeId, isAdminView, user]);

  // Fetch QA records
  const fetchQaRecords = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/employees/${targetEmployeeId}/qa`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const records = Array.isArray(response.data) ? response.data : [];
      setQaRecords(records);
    } catch (err) {
      console.error('Failed to fetch QA records:', err);
      setError('Failed to fetch QA records');
      setQaRecords([]);
    } finally {
      setLoading(false);
    }
  }, [targetEmployeeId]);

  // Filter records by selected month and year
  const filteredRecords = qaRecords.filter(record => {
    if (!record.created_at) return false;

    const recordDate = new Date(record.created_at);
    const recordMonth = recordDate.getMonth() + 1;
    const recordYear = recordDate.getFullYear();

    const monthMatch = !selectedMonth || recordMonth === parseInt(selectedMonth);
    const yearMatch = !selectedYear || recordYear === parseInt(selectedYear);

    return monthMatch && yearMatch;
  });

  // Calculate statistics
  const calculateStats = () => {
    if (filteredRecords.length === 0) {
      return { totalCount: 0, totalScore: 0, highest: 0, lowest: 0 };
    }

    const scores = filteredRecords.map(r => r.qa_score || 0);
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const totalCount = filteredRecords.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    return { totalCount, totalScore, highest, lowest };
  };

  const stats = calculateStats();

  // Form handlers for QA creation
  const handleCreateFormChange = (e) => {
    const { name, value } = e.target;
    setCreateFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();

    if (!createFormData.description.trim()) {
      setCreateError('Description is required');
      return;
    }

    if (!createFormData.qa_score || createFormData.qa_score < 0 || createFormData.qa_score > 100) {
      setCreateError('QA Score must be between 0 and 100');
      return;
    }

    setIsSubmitting(true);
    setCreateError('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('token');
      const payload = {
        employee_id: user.id,
        description: createFormData.description,
        qa_score: Number(createFormData.qa_score),
        created_at: createFormData.created_at ? `${createFormData.created_at} 00:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      await axios.post(`${API_URL}/api/qa`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccessMessage('QA record created successfully! It will appear on the admin dashboard.');

      // Reset form
      setCreateFormData({
        description: '',
        qa_score: '',
        created_at: new Date().toISOString().split('T')[0]
      });
      setShowCreateForm(false);

      // Refresh QA records
      fetchQaRecords();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);

    } catch (error) {
      console.error('Error creating QA record:', error);
      setCreateError(error.response?.data?.message || 'Failed to create QA record. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setCreateFormData({
      description: '',
      qa_score: '',
      created_at: new Date().toISOString().split('T')[0]
    });
    setCreateError('');
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // For admin view, require admin role
    if (isAdminView && user.role !== 'admin' && user.role !== 'Super Admin') {
      navigate('/login');
      return;
    }

    // For employee view, require employee role
    if (!isAdminView && user.role !== 'employee' && user.role !== 'pj lead') {
      navigate('/login');
      return;
    }

    fetchEmployeeInfo();
    fetchQaRecords();
  }, [user, navigate, isAdminView, fetchEmployeeInfo, fetchQaRecords]);

  useEffect(() => {
    fetchQaRecords();
  }, [selectedMonth, selectedYear, fetchQaRecords]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-300 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAdminView ? `QA Records for ${employee?.employee_name || 'Unknown Employee'}` : 'My QA Records'}
            </h1>
          </div>
          {isAdminView ? (
            <button
              onClick={() => navigate('/admin/qa')}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              ← Back to QA Management
            </button>
          ) : (
            <button
              onClick={() => navigate('/employee/dashboard')}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow border p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Filters</h3>
        </div>

        {/* First Row - Date Filters */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Months</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {getMonthName(i + 1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Years</option>
                {[2023, 2024, 2025].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <button
              onClick={() => {
                setSelectedMonth('');
                setSelectedYear('');
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow border p-4">
          <p className="text-sm text-gray-600">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">{filteredRecords.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow border p-4">
          <p className="text-sm text-gray-600">Total QA</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalScore.toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow border p-4">
          <p className="text-sm text-gray-600">Highest Score</p>
          <p className="text-2xl font-bold text-green-600">{stats.highest}</p>
        </div>
        <div className="bg-white rounded-lg shadow border p-4">
          <p className="text-sm text-gray-600">Lowest Score</p>
          <p className="text-2xl font-bold text-red-600">{stats.lowest}</p>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
          <p className="font-medium">Success!</p>
          <p className="text-sm">{successMessage}</p>
        </div>
      )}

      {/* Create QA Record Button - For employees and PJ leads, not admins */}
      {!isAdminView && (user?.role === 'employee' || user?.role === 'pj lead') && (
        <div className="mb-6">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Add QA Record
          </button>
        </div>
      )}

      {/* Modal for QA Creation */}
      {showCreateForm && (
        <Modal title="Add QA Record" onClose={handleCancelCreate}>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {createError && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                {createError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="created_at"
                value={createFormData.created_at}
                onChange={handleCreateFormChange}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                QA Score (0-100) *
              </label>
              <input
                type="number"
                name="qa_score"
                value={createFormData.qa_score}
                onChange={handleCreateFormChange}
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter score between 0 and 100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                name="description"
                value={createFormData.description}
                onChange={handleCreateFormChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter details about your QA activities..."
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancelCreate}
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
                {isSubmitting ? 'Creating...' : 'Add QA Record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* QA Records Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-5 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">QA Records</h2>
            <span className="text-sm text-gray-500">
              Showing {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
              {selectedMonth && selectedYear && ` for ${getMonthName(selectedMonth)} ${selectedYear}`}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-blue-600 font-medium opacity-65">QA point starting from 0.5, 500 MMK</p>
            <p className="text-lg font-bold text-red-600 opacity-65">Total QA Amount: {(stats.totalScore * 1000).toFixed(0)} MMK</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm bg-gray-50">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">QA Score</th>
                <th className="px-5 py-3">Description</th>
                {/* <th className="px-5 py-3">Main Project</th>
                <th className="px-5 py-3">Other Projects</th> */}
              </tr>
            </thead>
            <tbody className="font-semibold">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                    No QA records found for the selected period.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((qa) => {
                  const createdDate = qa.created_at ? new Date(qa.created_at) : null;

                  return (
                    <tr key={qa.id} className="border-t text-sm hover:bg-gray-50">
                      <td className="px-5 py-3">
                        {createdDate ? formatYMD(createdDate) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${qa.qa_score >= 80
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
                      {/* <td className="px-5 py-3">
                        <div className="text-sm text-gray-900">{qa.main_project_name || 'N/A'}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-sm text-gray-900">
                          {qa.other_project_name ? (
                            qa.other_project_name.split(', ').map((project, index) => (
                              <span key={index} className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs mr-1 mb-1">
                                {project.trim()}
                              </span>
                            ))
                          ) : (
                            'N/A'
                          )}
                        </div>
                      </td> */}
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

export default EmployeeQADetail;