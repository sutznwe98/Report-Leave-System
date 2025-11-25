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

const EmployeeLeaveCount = () => {
  const { employeeName } = useParams();
  const decodedName = decodeURIComponent(employeeName || "");
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [remainingAL, setRemainingAL] = useState(null);
  const [totalALFromStats, setTotalALFromStats] = useState(null);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const authToken = token || localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/leaves`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      // Normalize and enrich total_days if needed
      const normalized = data.map((l) => {
        const start = new Date(l.start_date);
        const end = new Date(l.end_date);
        const calendarDays = isNaN(start.getTime()) || isNaN(end.getTime()) ? 0 : Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const lt = (l.leave_type || '').toUpperCase();
        const diffDays = (lt === 'HUL' || lt === 'HUPL' || lt === 'HML') ? 0.5 * calendarDays : calendarDays;
        return { ...l, total_days: l.total_days != null ? Number(l.total_days) : diffDays };
      });
      // Filter by employeeName (case-insensitive, partial) AND only include approved leaves
      const filtered = normalized.filter((l) => {
        const name = (l.employee_name || l.name || l.employee || '').toString().toLowerCase();
        if (!name.includes(decodedName.toLowerCase())) return false;
        const status = (l.status || '').toString().toLowerCase();
        return status === 'approved';
      });
      setLeaves(filtered);

      // Try to find employee id by name and fetch stats (remaining AL, total AL)
      try {
        const empRes = await axios.get(`${API_URL}/employees`, { headers: { Authorization: `Bearer ${authToken}` } });
        const emps = Array.isArray(empRes.data) ? empRes.data : [];
        const found = emps.find(e => {
          const n = (e.name || e.employee_name || e.fullname || '').toString().toLowerCase();
          return n && n.includes(decodedName.toLowerCase());
        });
        if (found && found.id) {
          try {
            const statsRes = await axios.get(`${API_URL}/stats/employee/${found.id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            const s = statsRes.data || {};
            let rem = s.remainingAL ?? s.remaining_annual_leave ?? null;
            let total = s.totalAL ?? s.total_annual_leave ?? null;

            // If the employee joined less than 3 months ago, they should have 0 AL
            try {
              const joinedDateStr = found.joined_date || found.join_date || found.joined || found.date_joined || found.created_at;
              if (joinedDateStr) {
                const joinDate = new Date(joinedDateStr);
                if (!isNaN(joinDate.getTime())) {
                  const threeMonthsAfterJoin = new Date(joinDate);
                  threeMonthsAfterJoin.setMonth(joinDate.getMonth() + 3);
                  const today = new Date();
                  if (today < threeMonthsAfterJoin) {
                    rem = 0;
                    total = 0;
                  }
                }
              }
            } catch (jdErr) {
              // ignore join-date parsing errors
            }

            setRemainingAL(rem);
            setTotalALFromStats(total);
          } catch (statsErr) {
            // ignore stats errors but clear stored values
            setRemainingAL(null);
            setTotalALFromStats(null);
          }
        }
      } catch (empErr) {
        // ignore employee lookup failure
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load leaves.');
    } finally {
      setLoading(false);
    }
  }, [employeeName, token]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  // Compute monthly grouping and total
  const computeSummary = () => {
    const rows = leaves.filter((l) => {
      if (selectedMonth) {
        const d = l.start_date ? new Date(l.start_date) : null;
        if (!d) return false;
        if (d.getMonth() + 1 !== Number(selectedMonth)) return false;
      }
      if (selectedYear) {
        const d = l.start_date ? new Date(l.start_date) : null;
        if (!d) return false;
        if (d.getFullYear() !== Number(selectedYear)) return false;
      }
      return true;
    });

    // totals and grouping
    const byMonth = {};
    let total = 0;
    let totalAL = 0;
    let totalUnpaid = 0;
    let totalMedical = 0;
    rows.forEach((r) => {
      const d = r.start_date ? new Date(r.start_date) : new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const days = Number(r.total_days) || 0;
      byMonth[key] = (byMonth[key] || 0) + days;
      total += days;
      const lt = (r.leave_type || '').toUpperCase();
      if (lt === 'AL') totalAL += days;
      if (lt === 'UPL' || lt === 'HUL' || lt === 'HUPL') totalUnpaid += days;
      if (lt === 'ML' || lt === 'HML') totalMedical += days;
    });

    const entries = Object.keys(byMonth).sort().map((k) => {
      const [y, m] = k.split('-');
      const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long' });
      return { key: k, label: `${monthName} ${y}`, days: byMonth[k] };
    });

    return { entries, total, totalAL, totalUnpaid, totalMedical };
  };

  const { entries, total, totalAL, totalUnpaid, totalMedical } = computeSummary();

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Leave Summary for {decodeURIComponent(employeeName || '')}</h2>
        <div>
          <button onClick={() => navigate('/admin/leaves')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 mr-2">← Back to Leaves</button>
          <button
            onClick={() => {
              const rows = leaves.map(l => ({
                Start: l.start_date ? l.start_date.slice(0,10) : '',
                End: l.end_date ? l.end_date.slice(0,10) : '',
                Days: l.total_days ?? '',
                Type: l.leave_type || '',
                Reason: l.reason || '',
                Status: l.status || '',
              }));
              const monthLabel = monthLabelFromNumberOrNow(selectedMonth);
              const namePart = sanitizeFilename(decodeURIComponent(employeeName || 'employee')) || 'employee';
              const filename = `${namePart}_Leave_${monthLabel}.csv`;
              downloadCSV(rows, filename);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm text-gray-500">Total Leave Days</div>
            <div className="text-2xl font-bold">{Number.isInteger(total) ? total : total.toFixed(1)} Days</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm text-gray-500">Annual Leave (AL)</div>
            <div className="text-2xl font-bold">{Number.isInteger(totalAL) ? totalAL : totalAL?.toFixed?.(1) ?? '0'} Days</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm text-gray-500">Remaining / Total AL</div>
            <div className="text-2xl font-bold">
              {remainingAL != null ? remainingAL : '—'}{totalALFromStats != null ? ` / ${totalALFromStats}` : ''}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm text-gray-500">Total Unpaid Leave</div>
            <div className="text-2xl font-bold">{Number.isInteger(totalUnpaid) ? totalUnpaid : totalUnpaid?.toFixed?.(1) ?? '0'} Days</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm text-gray-500">Total Medical Leave</div>
            <div className="text-2xl font-bold">{Number.isInteger(totalMedical) ? totalMedical : totalMedical?.toFixed?.(1) ?? '0'} Days</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {entries.length === 0 ? (
            <div className="text-sm text-gray-600">No leave records for selected filters.</div>
          ) : ((selectedMonth || selectedYear || entries.length > 1) ? (
            entries.map(e => (
              <div key={e.key} className="bg-gray-50 p-3 rounded-lg border">
                <div className="text-sm text-gray-500">{e.label}</div>
                <div className="text-2xl font-bold mt-1">{Number.isInteger(e.days) ? e.days : e.days.toFixed(1)} Days</div>
              </div>
            ))
          ) : null)}
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">Leave Records</h3>
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : leaves.length === 0 ? (
          <div className="text-gray-600">No leave records.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="p-2">Start</th>
                  <th className="p-2">End</th>
                  <th className="p-2">Days</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{l.start_date ? l.start_date.slice(0,10) : 'N/A'}</td>
                    <td className="p-2">{l.end_date ? l.end_date.slice(0,10) : 'N/A'}</td>
                    <td className="p-2">{l.total_days}</td>
                    <td className="p-2">{l.leave_type}</td>
                    <td className="p-2">{l.reason}</td>
                    <td className="p-2">{l.status}</td>
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

export default EmployeeLeaveCount;
