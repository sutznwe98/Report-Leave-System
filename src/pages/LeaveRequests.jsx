import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = 'http://localhost:5000/api';

const LeaveRequests = () => {
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    leaveId: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null); // id being updated
  const { user: adminUser, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // define inside effect to avoid dependency issues
    const fetchLeaves = async () => {
      try {
        const token = adminUser?.token || localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

        // Add timestamp to prevent caching
        const timestamp = new Date().getTime();
        const [leavesRes, employeesRes] = await Promise.all([
          axios.get(`${API_URL}/leaves?t=${timestamp}`, config),
          axios.get(`${API_URL}/employees?t=${timestamp}`, config)
        ]);

        const employeesRaw = Array.isArray(employeesRes.data) ? employeesRes.data : [];
        const employees = employeesRaw.map(emp => ({
          ...emp,
          teams: (typeof emp.team === 'string'
            ? emp.team.split(',').map(t => t.trim()).filter(Boolean)
            : (Array.isArray(emp.teams) ? emp.teams : [])
          ),
        }));

        const byId = new Map(employees.map(e => [e.id, e]));
        const byEmail = new Map(employees.map(e => [e.email, e]));
        const byName = new Map(employees.map(e => [e.name, e]));

        const enrich = (l) => {
          const emp = byId.get(l.employee_id) || byEmail.get(l.employee_email) || byName.get(l.employee_name) || {};
          return {
            ...l,
            employee_name: l.employee_name || emp.name || 'N/A',
            teams: Array.isArray(l.teams) && l.teams.length ? l.teams : emp.teams || [],
            pj_approval_status: l.pj_approval_status || 'Pending',
            admin_approval_status: l.admin_approval_status || 'Pending',
            approved_days: l.approved_days,
            pj_lead_comments: l.pj_lead_comments,
            admin_comments: l.admin_comments
          };
        };

        const leavesData = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        setLeaves(leavesData.map(enrich));
      } catch (error) {
        console.error('Failed to fetch leaves', error.response?.data || error.message || error);
        setLeaves([]);
      }
    };

    fetchLeaves();
  }, [adminUser, fetchLeaves]); // refetch if adminUser changes

  // In the handlePjLeadApprove function, let's make it more robust:
  const handlePjLeadApprove = async (leaveId, approvedDays) => {
    if (!leaveId || !approvedDays || approvedDays <= 0) {
      console.error('Invalid leaveId or approvedDays');
      return;
    }

    const currentToken = token || localStorage.getItem('token');
    if (!currentToken) {
      console.error('No authentication token found');
      return;
    }

    try {
      console.log('Making request to:', `${API_URL}/api/leaves/pj/${leaveId}`);
      const response = await axios.patch(
        `${API_URL}/api/leaves/pj/${leaveId}`,
        {
          status: 'Approved',
          approved_leave_days: parseFloat(approvedDays),
          approved_by_pj_lead: user?.employee_name || user?.name || 'PJ Lead',
          pj_approval_status: 'Approved'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          }
        }
      );

      console.log('Approval successful:', response.data);
      // Refresh the leaves list after successful approval
      await fetchLeaves();
      return response.data;
    } catch (error) {
      console.error('Error in handlePjLeadApprove:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  };
  const handleAdminApprove = async (leaveId, approvedDays, comments = '', overridePJApproval = false) => {
    try {
      const token = adminUser?.token || localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/leaves/${leaveId}/admin-approve`,
        {
          approved_days: approvedDays,
          comments,
          override_pj_approval: overridePJApproval
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      // Refresh the list
      fetchLeaves();
    } catch (error) {
      console.error('Error approving leave:', error);
      setError('Failed to approve leave');
    }
  };

  const openDeleteConfirm = (leaveId) => {
    setConfirmModal({ isOpen: true, leaveId });
  };

  const closeDeleteConfirm = () => {
    setConfirmModal({ isOpen: false, leaveId: null });
  };

  const handleDeleteLeave = async () => {
    if (!confirmModal.leaveId) return;
    setIsDeleting(true);
    try {
      await axios.delete(`${API_URL}/leaves/${confirmModal.leaveId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refresh list by removing the deleted leave
      setLeaves((prev) => prev.filter((l) => l.id !== confirmModal.leaveId));
    } catch (err) {
      console.error("Failed to delete leave:", err);
      setError(err.response?.data?.message || "Failed to delete leave record.");
    } finally {
      setIsDeleting(false);
      closeDeleteConfirm();
    }
  };

  const columns = [
    // ... existing columns
    {
      Header: 'PJ Lead Status',
      accessor: 'pj_approval_status',
      Cell: ({ value }) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value === 'Approved' ? 'bg-green-100 text-green-800' :
          value === 'Rejected' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
          {value || 'Pending'}
        </span>
      )
    },
    {
      Header: 'Admin Status',
      accessor: 'admin_approval_status',
      Cell: ({ value }) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value === 'Approved' ? 'bg-green-100 text-green-800' :
          value === 'Rejected' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
          {value || 'Pending'}
        </span>
      )
    },
    // Add action buttons for admin
    {
      Header: 'Actions',
      accessor: 'id',
      Cell: ({ row }) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleAdminApprove(row.original.id)}
            className="text-green-600 hover:text-green-800"
          >
            Approve
          </button>
          <button
            onClick={() => handleAdminReject(row.original.id)}
            className="text-red-600 hover:text-red-800"
          >
            Reject
          </button>
        </div>
      )
    }
  ];

  const handleStatusChange = async (id, status) => {
    if (!id) return;
    try {
      setUpdatingId(id);
      const config = { headers: { Authorization: `Bearer ${token}` } };

      // include approved_by if available; backend may ignore unknown fields
      const payload = { status, approved_by: adminUser?.name || null };

      const res = await axios.put(`${API_URL}/leaves/${id}/status`, { status }, config);

      // optimistic/local update using returned data if available, otherwise update status locally
      const updatedLeave = res?.data || { id, status, approved_by_name: adminUser?.name || null };
      setLeaves(prev =>
        prev.map(l => (l.id === id ? { ...l, ...updatedLeave } : l))
      );
    } catch (error) {
      console.error('Failed to update leave status', error.response?.data || error.message || error);
      // optionally show toast / alert to user
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (leave) => {
    if (leave.admin_approval_status === 'Approved') {
      return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Approved by Admin</span>;
    }
    if (leave.admin_approval_status === 'Rejected') {
      return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Rejected by Admin</span>;
    }
    if (leave.pj_approval_status === 'Approved') {
      return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Pending Admin Approval</span>;
    }
    if (leave.pj_approval_status === 'Rejected') {
      return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Rejected by PJ Lead</span>;
    }
    return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">Pending PJ Lead Approval</span>;
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'AL':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-blue-700 bg-blue-100 rounded-full">Annual</span>;
      case 'ML':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-purple-700 bg-purple-100 rounded-full">Medical</span>;
      case 'UPL':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-gray-700 bg-gray-100 rounded-full">Unpaid</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-gray-700 bg-gray-100 rounded-full">{type || 'Other'}</span>;
    }
  };

  const renderTeams = (obj) => {
    const arr = Array.isArray(obj?.teams)
      ? obj.teams
      : Array.isArray(obj?.employee_teams)
        ? obj.employee_teams
        : (typeof obj?.team === 'string'
          ? obj.team.split(',').map(t => t.trim()).filter(Boolean)
          : []);
    return arr.length ? arr.join(', ') : 'N/A';
  };

  return (
    <div>
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-auto">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">
                Confirm Deletion
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Are you sure you want to delete this leave record? This action
                cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 py-3 px-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={closeDeleteConfirm}
                className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLeave}
                className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6">Leave Requests</h2>
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full leading-normal">
          <thead>
            <tr className="bg-gray-200 text-gray-600 uppercase text-sm">
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Employee</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Teams</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Type</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Dates</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Reason</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Status</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(leave => (
              <tr key={leave.id} className="border-b border-gray-200 hover:bg-gray-100">
                <td className="px-5 py-4 text-sm">{leave.employee_name || 'N/A'}</td>
                <td className="px-5 py-4 text-sm">{renderTeams(leave)}</td>
                <td className="px-5 py-4 text-sm">{getTypeBadge(leave.leave_type)}</td>
                <td className="px-5 py-4 text-sm">
                  {leave.start_date ? leave.start_date.slice(0, 10) : 'N/A'} to {leave.end_date ? leave.end_date.slice(0, 10) : 'N/A'}
                </td>
                <td className="px-5 py-4 text-sm">
                  {leave.reason || '—'}
                  {leave.reason ===
                    "Automatic UPL for not submitting morning report." && (
                      <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        Auto-Generated
                      </span>
                    )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="font-medium">PJ Lead: </span>
                      <span className={`${leave.pj_approval_status === 'Approved' ? 'text-green-600' :
                        leave.pj_approval_status === 'Rejected' ? 'text-red-600' :
                          'text-yellow-600'
                        }`}>
                        {leave.pj_approval_status || 'Pending'}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Admin: </span>
                      <span className={`${leave.admin_approval_status === 'Approved' ? 'text-green-600' :
                        leave.admin_approval_status === 'Rejected' ? 'text-red-600' :
                          'text-yellow-600'
                        }`}>
                        {leave.admin_approval_status || 'Pending'}
                      </span>
                    </div>
                    {leave.approved_days && (
                      <div className="text-sm">
                        <span className="font-medium">Approved Days: </span>
                        {leave.approved_days}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-sm">
                  {leave.status === 'Pending' ? (
                    <>
                      <button
                        onClick={() => handleStatusChange(leave.id, 'Approved')}
                        className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 mr-2"
                        disabled={updatingId === leave.id}
                      >
                        {updatingId === leave.id ? 'Updating...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleStatusChange(leave.id, 'Rejected')}
                        className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                        disabled={updatingId === leave.id}
                      >
                        {updatingId === leave.id ? 'Updating...' : 'Reject'}
                      </button>
                    </>
                  ) : leave.status === 'Approved' || leave.status === 'Rejected' ? (
                    <>
                      <button
                        onClick={() => navigate(`/admin/leaves/${leave.id}`)}
                        className="px-3 py-1 bg-indigo-500 text-white text-xs rounded hover:bg-indigo-600 mr-2"
                      >
                        Detail
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(leave.id)}
                        className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr>
                <td colSpan="7" className="px-5 py-6 text-center text-sm text-gray-500">No leave requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaveRequests;