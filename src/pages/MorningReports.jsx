import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const MorningReports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [error, setError] = useState('');

    // All reports (for client-side filtering if API doesn't support it)
    const [allReports, setAllReports] = useState([]);

    useEffect(() => {
        fetchAllReports();
    }, []);

    const fetchAllReports = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const [reportsRes, employeesRes] = await Promise.all([
                axios.get(`${API_URL}/reports`, { headers }),
                axios.get(`${API_URL}/employees`, { headers })
            ]);

            const employeesRaw = Array.isArray(employeesRes.data) ? employeesRes.data : [];
            const employees = employeesRaw.map(emp => ({
                ...emp,
                teams: Array.isArray(emp.teams)
                    ? emp.teams
                    : (typeof emp.team === 'string'
                        ? emp.team.split(',').map(t => t.trim()).filter(Boolean)
                        : []),
            }));

            const byId = new Map(employees.map(e => [e.id, e]));
            const byEmail = new Map(employees.map(e => [e.email, e]));
            const byName = new Map(employees.map(e => [e.name, e]));

            const enrich = (r) => {
                const possibleIds = [r.employee_id, r.employeeId, r.user_id, r.userId];
                const possibleEmails = [r.employee_email, r.email, r.user_email];
                const possibleNames = [r.employee_name, r.name, r.user_name];

                const foundId = possibleIds.find(id => id && byId.get(id));
                const foundEmail = possibleEmails.find(em => em && byEmail.get(em));
                const foundName = possibleNames.find(nm => nm && byName.get(nm));
                const emp = (foundId && byId.get(foundId)) || (foundEmail && byEmail.get(foundEmail)) || (foundName && byName.get(foundName));
                if (!emp) return r;
                return {
                    ...r,
                    employee_name: r.employee_name || emp.name || 'N/A',
                    employee_email: r.employee_email || emp.email,
                    teams: Array.isArray(r.teams) && r.teams.length ? r.teams : emp.teams || [],
                };
            };

            const reports = Array.isArray(reportsRes.data) ? reportsRes.data.map(enrich) : [];
            setAllReports(reports);
            setReports(reports); // show all initially
        } catch (err) {
            console.error(err);
            setError('Failed to fetch reports.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        let filtered = [...allReports];

        const getComparableDate = (r) => {
            const dt = r.submission_time || r.report_date || r.created_at;
            const d = new Date(dt);
            return isNaN(d.getTime()) ? null : d;
        };

        const start = filterFromDate ? new Date(filterFromDate) : null;
        const end = filterToDate ? new Date(filterToDate) : null;
        if (end) {
            end.setHours(23, 59, 59, 999);
        }

        if (start || end) {
            filtered = filtered.filter((r) => {
                const d = getComparableDate(r);
                if (!d) return false;
                if (start && d < start) return false;
                if (end && d > end) return false;
                return true;
            });
        }

        if (filterStatus) {
            filtered = filtered.filter(r => r.compliance_status === filterStatus);
        }
        setReports(filtered);
    };

    const handleReset = () => {
        setFilterFromDate('');
        setFilterToDate('');
        setFilterStatus('');
        setReports(allReports);
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'OnTime': return <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">On Time</span>;
            case 'Late': return <span className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-100 rounded-full">Late</span>;
            case 'HUL': return <span className="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-full">Half Unpaid Leave</span>;
            case 'UPL': return <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">Full Unpaid Leave</span>;
            default: return null;
        }
    };

    const summarizeReport = (text) => {
        if (!text) return '—';
        try {
            const afterY = text.split('Yesterday task:')[1] || '';
            const y = afterY.split('Today task:')[0]?.trim();
            const afterT = text.split('Today task:')[1] || '';
            const t = afterT.split('Problem:')[0]?.trim();
            const p = (text.split('Problem:')[1] || '').trim();
            const parts = [y, t, p].filter(Boolean);
            return parts.length ? parts.join(', ') : text;
        } catch { return text; }
    };

    const formatTime = (dt) => {
        if (!dt) return '—';
        const d = new Date(dt);
        if (isNaN(d.getTime())) return '—';
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; h = h ? h : 12;
        const mm = m < 10 ? `0${m}` : `${m}`;
        return `${String(h).padStart(2,'0')}:${mm} ${ampm}`;
    };

    const formatYMD = (dt) => {
        if (!dt) return 'N/A';
        const d = new Date(dt);
        if (isNaN(d.getTime())) return 'N/A';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    return (
        <div className="p-4 md:p-8 min-h-screen bg-gray-50">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
                <h2 className="text-3xl font-extrabold text-gray-900">Morning Reports</h2>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">From Date</label>
                        <input
                            type="date"
                            value={filterFromDate}
                            onChange={(e) => setFilterFromDate(e.target.value)}
                            className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">To Date</label>
                        <input
                            type="date"
                            value={filterToDate}
                            onChange={(e) => setFilterToDate(e.target.value)}
                            className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="border rounded-lg p-2 w-full focus:ring focus:ring-indigo-200 outline-none"
                        >
                            <option value="">All Status</option>
                            <option value="OnTime">On Time</option>
                            <option value="Late">Late</option>
                            <option value="HUL">Half Unpaid Leave</option>
                            <option value="UPL">Full Unpaid Leave</option>
                        </select>
                    </div>

                    <div className="flex gap-2 items-end">
                        <button
                            onClick={handleSearch}
                            className="flex-1 bg-indigo-600 text-white rounded-lg p-2 hover:bg-indigo-700 transition"
                        >
                            Search
                        </button>
                        <button
                            onClick={handleReset}
                            className="flex-1 bg-gray-300 text-gray-800 rounded-lg p-2 hover:bg-gray-400 transition"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && <p className="text-center text-indigo-600 font-medium py-8">Loading reports...</p>}

            {/* Error */}
            {!loading && error && <p className="text-center text-red-600 font-medium py-4">{error}</p>}

            {/* No Data */}
            {!loading && !error && reports.length === 0 && (
                <p className="text-center text-gray-600 font-medium py-8">No reports found.</p>
            )}

            {/* Desktop Table */}
            {!loading && !error && reports.length > 0 && (
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full bg-white rounded-lg shadow overflow-hidden">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-sm">
                            <tr>
                                <th className="p-4 text-left">Date</th>
                                <th className="p-4 text-left">Name</th>
                                <th className="p-4 text-left">Project</th>
                                <th className="p-4 text-left">Report</th>
                                <th className="p-4 text-left">Time</th>
                                <th className="p-4 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700 font-semibold">
                            {reports.map(report => (
                                <tr key={report.id} className="border-b hover:bg-gray-50 transition">
                                    <td className="p-4">{formatYMD(report.submission_time || report.report_date || report.created_at)}</td>
                                    <td className="p-4">{report.employee_name}</td>
                                    <td className="p-4">{Array.isArray(report.teams) ? (report.teams.length ? report.teams.join(', ') : 'N/A') : (typeof report.team === 'string' ? report.team : 'N/A')}</td>
                                    <td className="p-4 max-w-sm whitespace-normal">{summarizeReport(report.report_text)}</td>
                                    <td className="p-4">{formatTime(report.submission_time || report.created_at || report.report_date)}</td>
                                    <td className="p-4">{getStatusBadge(report.compliance_status)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Mobile Card View */}
            {!loading && !error && reports.length > 0 && (
                <div className="md:hidden space-y-4">
                    {reports.map(report => (
                        <div key={report.id} className="bg-white p-4 rounded-lg shadow border border-gray-100">
                            {/* Date */}
                            <div className="text-sm text-gray-500 mb-1">
                                {formatYMD(report.submission_time || report.report_date || report.created_at)}
                            </div>
                            {/* Name */}
                            <p className="text-sm font-semibold text-gray-800 mb-1">{report.employee_name}</p>
                            {/* Teams */}
                            <p className="text-xs text-gray-600 mb-2">{Array.isArray(report.teams) ? (report.teams.length ? report.teams.join(', ') : 'N/A') : (typeof report.team === 'string' ? report.team : 'N/A')}</p>
                            {/* Report */}
                            <p className="text-gray-700 text-sm mb-2">{summarizeReport(report.report_text)}</p>
                            {/* Time + Status */}
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">{formatTime(report.submission_time || report.created_at || report.report_date)}</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    report.compliance_status === 'OnTime' ? 'bg-green-100 text-green-700' :
                                    report.compliance_status === 'Late' ? 'bg-yellow-100 text-yellow-700' :
                                    report.compliance_status === 'HUL' ? 'bg-orange-100 text-orange-700' :
                                    'bg-red-100 text-red-700'
                                }`}>{report.compliance_status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MorningReports;
