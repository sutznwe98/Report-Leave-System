import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://localhost:5000/api';

const LeaveRequests = () => {
  const [leaves, setLeaves] = useState([]);
  const [updatingId, setUpdatingId] = useState(null); // id being updated
  const { user: adminUser } = useAuth();

  useEffect(() => {
    // define inside effect to avoid dependency issues
    const fetchLeaves = async () => {
      try {
        const token = adminUser?.token || localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        const res = await axios.get(`${API_URL}/leaves`, config);
        setLeaves(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error('Failed to fetch leaves', error.response?.data || error.message || error);
        setLeaves([]);
      }
    };

    fetchLeaves();
  }, [adminUser]); // refetch if adminUser changes

  const handleStatusChange = async (id, status) => {
    if (!id) return;
    try {
      setUpdatingId(id);
      const token = adminUser?.token || localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

      // include approved_by if available; backend may ignore unknown fields
      const payload = { status, approved_by: adminUser?.name || null };

      const res = await axios.put(`${API_URL}/leaves/${id}/status`, payload, config);

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

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-green-700 bg-green-100 rounded-full">Approved</span>;
      case 'Rejected':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-red-700 bg-red-100 rounded-full">Rejected</span>;
      case 'Pending':
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-yellow-700 bg-yellow-100 rounded-full">Pending</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold leading-tight text-gray-700 bg-gray-100 rounded-full">{status || 'Unknown'}</span>;
    }
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

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Leave Requests</h2>
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full leading-normal">
          <thead>
            <tr className="bg-gray-200 text-gray-600 uppercase text-sm">
              <th className="px-5 py-3 border-b-2 border-gray-200 text-left">Employee</th>
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
                <td className="px-5 py-4 text-sm">{getTypeBadge(leave.leave_type)}</td>
                <td className="px-5 py-4 text-sm">
                  {leave.start_date ? leave.start_date.slice(0, 10) : 'N/A'} to {leave.end_date ? leave.end_date.slice(0, 10) : 'N/A'}
                </td>
                <td className="px-5 py-4 text-sm">{leave.reason || '—'}</td>
                <td className="px-5 py-4 text-sm">{getStatusBadge(leave.status)}</td>
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
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}

            {leaves.length === 0 && (
              <tr>
                <td colSpan="6" className="px-5 py-6 text-center text-sm text-gray-500">No leave requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaveRequests;