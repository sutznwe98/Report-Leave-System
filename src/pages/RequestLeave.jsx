import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://localhost:5000/api';

const Icons = {
  UploadCloudIcon: (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
    </svg>
  )
};

const RequestLeave = () => {
  const { user } = useAuth();
  const [leaveData, setLeaveData] = useState({
    leave_type: 'AL',
    start_date: '',
    end_date: '',
    backup_person: '',
    reason: '',
  });
  const [medicalCert, setMedicalCert] = useState(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alWarning, setAlWarning] = useState('');

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const validateAnnualLeave = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return '';
    const now = new Date();
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start) || isNaN(end) || start > end) return 'Invalid date range.';
    const minStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    if (start < minStart) return 'Annual Leave must be requested at least 48 hours in advance.';
    let cursor = new Date(start);
    while (cursor <= end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const segmentEnd = end < monthEnd ? end : monthEnd;
      const segDays = Math.floor((segmentEnd - cursor) / MS_PER_DAY) + 1;
      if (segDays > 2) return 'Annual Leave cannot exceed 2 consecutive days within a month.';
      cursor = new Date(segmentEnd.getFullYear(), segmentEnd.getMonth(), segmentEnd.getDate() + 1);
    }
    return '';
  };

  useEffect(() => {
    if (leaveData.leave_type === 'AL') {
      const warn = validateAnnualLeave(leaveData.start_date, leaveData.end_date);
      setAlWarning(warn);
    } else {
      setAlWarning('');
    }
  }, [leaveData.leave_type, leaveData.start_date, leaveData.end_date]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLeaveData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setMedicalCert(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!user || !user.id) {
      setMessage('User session required to submit leave.');
      return;
    }

    if (leaveData.leave_type === 'ML' && !medicalCert) {
      setMessage('Medical certificate is required for Medical Leave.');
      return;
    }

    if (leaveData.leave_type === 'AL') {
      const warn = validateAnnualLeave(leaveData.start_date, leaveData.end_date);
      if (warn) {
        setMessage(warn);
        return;
      }
    }

    setIsSubmitting(true);

    const formData = new FormData();
    Object.entries(leaveData).forEach(([key, value]) => formData.append(key, value));
    const employeeIdNumeric = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    formData.append('employee_id', employeeIdNumeric);

    if (leaveData.leave_type === 'ML' && medicalCert) {
      formData.append('medical_certificate', medicalCert);
      formData.append('medical_certificate_url', '');
    }

    try {
      const token = user?.token || localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      const response = await axios.post(`${API_URL}/leaves`, formData, config);
      const savedLeave = response.data;
      let successMessage = 'Leave request submitted successfully!';
      if (savedLeave.medical_certificate_url) successMessage += ' Medical certificate attached and saved.';

      setMessage(successMessage);
      setLeaveData({ leave_type: 'AL', start_date: '', end_date: '', backup_person: '', reason: '' });
      setMedicalCert(null);
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = null;
    } catch (error) {
      console.error('Failed to submit leave', error);
      const status = error.response?.status;
      let errorMessage = 'Failed to submit leave. Please check server status and network.';
      if (status === 400) errorMessage = `Submission Error: ${error.response.data.message || 'Missing required fields.'}`;
      else if (status === 500) errorMessage = 'Server Error: The backend crashed while processing the request.';
      setMessage(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 bg-gray-50 min-h-screen">
      <h2 className="text-3xl font-extrabold text-gray-900 mb-8 text-center">Submit Leave Request</h2>
      <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="leave_type" className="block text-sm font-medium text-gray-700">Leave Type</label>
            <select id="leave_type" name="leave_type" value={leaveData.leave_type} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500" disabled={isSubmitting}>
              <option value="AL">Annual Leave (AL)</option>
              <option value="UPL">Unpaid Leave (UPL)</option>
              <option value="ML">Medical Leave (ML)</option>
              <option value="HML">Half Morning Leave (HML)</option>
              <option value="HEL">Half Evening Leave (HEL)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">Start Date</label>
              <input type="date" id="start_date" name="start_date" value={leaveData.start_date} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500" required disabled={isSubmitting} />
            </div>
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">End Date</label>
              <input type="date" id="end_date" name="end_date" value={leaveData.end_date} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500" required disabled={isSubmitting} />
            </div>
          </div>
          {leaveData.leave_type === 'AL' && alWarning && (
            <p className="mt-2 text-sm p-2 rounded bg-red-100 text-red-700">{alWarning}</p>
          )}

          <div>
            <label htmlFor="backup_person" className="block text-sm font-medium text-gray-700">Backup Person</label>
            <input type="text" id="backup_person" name="backup_person" value={leaveData.backup_person} onChange={handleChange} placeholder="Who will cover for you?" className="w-full p-3 border border-gray-300 rounded-lg mt-1 focus:ring-indigo-500 focus:border-indigo-500" required disabled={isSubmitting} />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea id="reason" name="reason" value={leaveData.reason} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg mt-1 h-24 resize-none focus:ring-indigo-500 focus:border-indigo-500" required disabled={isSubmitting}></textarea>
          </div>

          {leaveData.leave_type === 'ML' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Medical Certificate</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md bg-gray-50">
                <div className="space-y-1 text-center">
                  <Icons.UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-50 rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                      <span>{medicalCert ? 'Change File' : 'Upload a file'}</span>
                      <input id="file-upload" name="medical_cert" type="file" onChange={handleFileChange} className="sr-only" accept=".png, .jpg, .jpeg, .pdf" />
                    </label>
                    {!medicalCert && <p className="pl-1">or drag and drop</p>}
                  </div>
                  <p className="text-xs text-gray-500">{medicalCert ? medicalCert.name : 'PNG, JPG, PDF up to 10MB'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-300 disabled:bg-gray-400" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>

          {message && (
            <p className={`mt-4 text-center text-sm p-3 rounded-lg ${message.includes('successfully') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default RequestLeave;
