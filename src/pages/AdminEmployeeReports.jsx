import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Simple CSV download helper (no external dependency)
const downloadCSV = (rows, filename = 'export.csv') => {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => {
      const v = r[k] ?? '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(','))
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const API_URL = 'http://localhost:5000/api';

// Filename helpers
const sanitizeFilename = (name) => {
  if (!name) return '';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 200);
};

const monthLabelFromNumberOrNow = (monthNumber) => {
  try {
    if (monthNumber) {
      const m = Number(monthNumber) - 1;
      return new Date(0, m).toLocaleString('default', { month: 'short' });
    }
    return new Date().toLocaleString('default', { month: 'short' });
  } catch { return new Date().toLocaleString('default', { month: 'short' }); }
};

const AdminEmployeeReports = () => {
  const { id: employeeId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [employeeName, setEmployeeName] = useState('');
  const [reports, setReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authToken = token || localStorage.getItem('token');

  const fetchEmployee = useCallback(async () => {
    if (!authToken || !employeeId) return;
    try {
      const res = await axios.get(`${API_URL}/employees/${employeeId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      const e = res.data || {};
      setEmployeeName(e.name || e.employee_name || e.fullname || `${e.first_name || ''} ${e.last_name || ''}`.trim() || `#${employeeId}`);
    } catch (err) {
      // ignore
    }
  }, [authToken, employeeId]);

  const computeDateRangeParams = () => {
    if (selectedMonth && selectedYear) {
      const y = Number(selectedYear);
      const m = Number(selectedMonth);
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0); // last day of month
      return { fromDate: from.toISOString().split('T')[0], toDate: to.toISOString().split('T')[0] };
    }
    if (selectedYear) {
      const y = Number(selectedYear);
      const from = new Date(y, 0, 1);
      const to = new Date(y, 11, 31);
      return { fromDate: from.toISOString().split('T')[0], toDate: to.toISOString().split('T')[0] };
    }
    return {};
  };

  const fetchReports = useCallback(async (statusOverride) => {
    if (!authToken || !employeeId) {
      setError('Authentication or employee id missing');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const dateParams = computeDateRangeParams();
      const params = { id: Number(employeeId), ...dateParams };
      const statusToUse = typeof statusOverride !== 'undefined' ? statusOverride : statusFilter;
      if (statusToUse) params.status = statusToUse;
      const res = await axios.get(`${API_URL}/reports/employee/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setReports(list);
      // If employee name wasn't resolved from employees endpoint, try to set it from the first report
      if ((!employeeName || employeeName === '') && list.length > 0) {
        const first = list[0];
        const ename = first.employee_name || first.name || first.fullname || '';
        if (ename) setEmployeeName(ename);
      }
      // keep a copy of the unfiltered set when no date/status filters are applied
      const hasDateFilter = !!(selectedMonth || selectedYear);
      if (!hasDateFilter && !statusToUse) setAllReports(list);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [authToken, employeeId, selectedMonth, selectedYear, statusFilter]);

  // fetch all reports for this employee (no filters) to compute contextual counts
  const fetchAllEmployeeReports = useCallback(async () => {
    if (!authToken || !employeeId) return;
    try {
      const res = await axios.get(`${API_URL}/reports/employee/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { id: Number(employeeId) },
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setAllReports(list);
    } catch (err) {
      // ignore silently
    }
  }, [authToken, employeeId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);
  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { fetchAllEmployeeReports(); }, [fetchAllEmployeeReports]);

  const resetFilters = () => {
    setSelectedMonth('');
    setSelectedYear('');
    setStatusFilter('');
  };

  // Status cards are UI-only (not clickable) per design — no click handler

  const formatYMD = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatTime = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '-';
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${String(h).padStart(2, '0')}:${mm} ${ampm}`;
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'OnTime': return 'bg-green-100 text-green-700';
      case 'QA': return 'bg-yellow-100 text-yellow-700';
      case 'HUL': return 'bg-orange-100 text-orange-700';
      case 'UPL': return 'bg-red-100 text-red-700';
      case 'Late': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Reports for {employeeName || `#${employeeId}`}</h2>
        <div>
          <button onClick={() => navigate('/admin/reports')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">← Back</button>
        </div>
      </div>

      {/* Status count cards (context for this employee) */}
      <div className="mb-6">
        {(() => {
          const counts = allReports.reduce((acc, r) => {
            const s = (r.compliance_status || '').toString();
            if (s === 'OnTime') acc.onTime += 1;
            else if (s === 'QA') acc.qa += 1;
            else if (s === 'HUL') acc.hul += 1;
            else if (s === 'UPL') acc.upl += 1;
            else if (s === 'Late') acc.late += 1;
            else acc.other += 1;
            return acc;
          }, { onTime: 0, qa: 0, hul: 0, upl: 0, late: 0, other: 0 });

          const makeClass = (s) => `p-3 rounded-lg shadow border text-left ${statusFilter === s ? 'ring-2 ring-indigo-300 border-indigo-500 bg-indigo-50' : 'bg-white'}`;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div className={makeClass('OnTime')}>
                <div className="text-xs text-gray-500">On Time</div>
                <div className="text-xl font-bold">{counts.onTime}</div>
              </div>
              <div className={makeClass('QA')}>
                <div className="text-xs text-gray-500">QA</div>
                <div className="text-xl font-bold">{counts.qa}</div>
              </div>
              <div className={makeClass('HUL')}>
                <div className="text-xs text-gray-500">HUL (Half Unpaid)</div>
                <div className="text-xl font-bold">{counts.hul}</div>
              </div>
              <div className={makeClass('UPL')}>
                <div className="text-xs text-gray-500">UPL (Full Unpaid)</div>
                <div className="text-xl font-bold">{counts.upl}</div>
              </div>
              <div className={makeClass('Late')}>
                <div className="text-xs text-gray-500">Late</div>
                <div className="text-xl font-bold">{counts.late}</div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-600">Month</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border rounded-lg p-2">
              <option value="">All Months</option>
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600">Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="border rounded-lg p-2">
              <option value="">All Years</option>
              {(() => { const start = 2023; const end = new Date().getFullYear(); const ys=[]; for(let y=start;y<=end;y++) ys.push(y); return ys.map(y=> <option key={y} value={y}>{y}</option>); })()}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-lg p-2">
              <option value="">All</option>
              <option value="OnTime">On Time</option>
              <option value="Late">Late</option>
              <option value="QA">QA</option>
              <option value="HUL">HUL</option>
              <option value="UPL">UPL</option>
            </select>
          </div>

          <div>
            <button onClick={fetchReports} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 mr-2">Search</button>
            <button onClick={resetFilters} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Reset</button>
            <button
              onClick={() => {
                const rows = reports.map(r => ({
                  Date: formatYMD(r.report_date),
                  Content: (r.report_text || '').replace(/\s+/g, ' ').trim(),
                  Time: formatTime(r.submission_time || r.created_at || r.report_date),
                  Status: r.compliance_status || '',
                }));
                const monthLabel = monthLabelFromNumberOrNow(selectedMonth);
                const namePart = sanitizeFilename(employeeName || `emp_${employeeId || 'unknown'}`) || `emp_${employeeId || 'unknown'}`;
                const filename = `${namePart}_Report_${monthLabel}.csv`;
                downloadCSV(rows, filename);
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 ml-2"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : reports.length === 0 ? (
          <div className="text-gray-600">No reports found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Content</th>
                  <th className="p-2">Time</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="p-2">{formatYMD(r.report_date)}</td>
                    <td className="p-2 max-w-xs truncate text-sm text-gray-600">{(r.report_text||'').slice(0,120)}</td>
                    <td className="p-2">{formatTime(r.submission_time || r.created_at || r.report_date)}</td>
                    <td className="p-2"><span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusStyle(r.compliance_status)}`}>{r.compliance_status}</span></td>
                    <td className="p-2"><button onClick={() => navigate(`/employee/report/${r.id}`)} className="text-indigo-600 hover:text-indigo-800">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEmployeeReports;
