import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = 'http://localhost:5000/api';

const EmployeeReportDetail = ({ reportId: propReportId }) => {
  const navigate = useNavigate();
  const { id: idFromRoute } = useParams();
  const reportId = propReportId || idFromRoute;

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReport = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication required.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        // Fetch all my reports and find the one by ID (no single-report endpoint available)
        const res = await axios.get(`${API_URL}/reports/employee/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reports = Array.isArray(res.data) ? res.data : [];
        const found = reports.find((r) => String(r.id) === String(reportId));
        if (!found) {
          setError('Report not found or access denied.');
        } else {
          setReport(found);
        }
      } catch (e) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
          try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch (_) {}
          navigate('/login', { replace: true });
          return;
        }
        setError(e.response?.data?.message || 'Failed to load report details.');
      } finally {
        setLoading(false);
      }
    };

    if (reportId) fetchReport();
    else {
      setError('No report ID provided.');
      setLoading(false);
    }
  }, [reportId]);

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
          {error}
        </div>
        <button
          onClick={() => navigate('/employee/report-list')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Back to My Reports
        </button>
      </div>
    );
  }

  const dateStr = report?.report_date
    ? new Date(report.report_date).toISOString().split('T')[0]
    : 'N/A';

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow border">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Report Details</h2>
          <button
            onClick={() => navigate('/employee/report-list')}
            className="px-3 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 text-sm"
          >
            ← Back
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs text-gray-500">Date</div>
            <div className="text-sm font-medium text-gray-900">{dateStr}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">Compliance Status</div>
            {(() => {
              const status = (report?.compliance_status || '').toString();
              const cls =
                status === 'OnTime' ? 'bg-green-100 text-green-700' :
                status === 'Late' ? 'bg-yellow-100 text-yellow-700' :
                status === 'HUL' ? 'bg-orange-100 text-orange-700' :
                status === 'FUL' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700';
              return (
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
                  {status || 'Unknown'}
                </span>
              );
            })()}
          </div>

          <div>
            <div className="text-xs text-gray-500">Content</div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap border rounded-md p-3 bg-gray-50">
              {report?.report_text || 'No content'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeReportDetail;