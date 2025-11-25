import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReportDetailModal from '../components/ReportDetailModal';

const API_URL = 'http://localhost:5000/api';

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

// Filename helpers
const sanitizeFilename = (name) => {
    if (!name) return '';
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 200);
};

const monthLabelFromDate = (dateStr) => {
    try {
        const d = dateStr ? new Date(dateStr) : new Date();
        if (isNaN(d.getTime())) return new Date().toLocaleString('default', { month: 'short' });
        return d.toLocaleString('default', { month: 'short' });
    } catch { return new Date().toLocaleString('default', { month: 'short' }); }
};

const MorningReports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [error, setError] = useState('');

    // All reports (for client-side filtering if API doesn't support it)
    const [allReports, setAllReports] = useState([]);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);
    const navigate = useNavigate();

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
                teams: (typeof emp.team === 'string'
                    ? emp.team.split(',').map(t => t.trim()).filter(Boolean)
                    : (Array.isArray(emp.teams) ? emp.teams : [])
                ),
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
                    main_project: emp.main_project_name || 'N/A', // Add main project
                    other_project: emp.project_assignments && emp.project_assignments.length > 0
                        ? emp.project_assignments.map(p => p.project_name).join(', ')
                        : 'N/A', // Add other projects
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

    const handleSearch = (statusOverride) => {
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

        const statusToUse = typeof statusOverride !== 'undefined' ? statusOverride : filterStatus;
        if (typeof statusOverride !== 'undefined') setFilterStatus(statusOverride);

        if (statusToUse) {
            filtered = filtered.filter(r => r.compliance_status === statusToUse);
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
        switch (status) {
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
        return `${String(h).padStart(2, '0')}:${mm} ${ampm}`;
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
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    // export currently shown `reports` as CSV
                                    const rows = reports.map(r => ({
                                        Date: formatYMD(r.submission_time || r.report_date || r.created_at),
                                        Name: r.employee_name || 'N/A',
                                        Email: r.employee_email || r.email || '',
                                        'Main Project': r.main_project || '',
                                        'Other Projects': r.other_project || '',
                                        'Report Summary': summarizeReport(r.report_text),
                                        Time: formatTime(r.submission_time || r.created_at || r.report_date),
                                        Status: r.compliance_status || '',
                                    }));
                                    const refDate = filterFromDate || filterToDate || new Date().toISOString();
                                    const monthLabel = monthLabelFromDate(refDate);
                                    const filename = `Report_${sanitizeFilename(monthLabel)}.csv`;
                                    downloadCSV(rows, filename);
                                }}
                                className="bg-green-600 text-white rounded-lg p-2 hover:bg-green-700 transition"
                            >
                                Export CSV
                            </button>
                        </div>
                    </div>

            {/* (Status count cards moved to AdminEmployeeReports) */}

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
                            className="flex-1 bg-red-600 text-white rounded-lg p-2 hover:bg-red-700 transition"
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
                <div className="text-center py-8 text-gray-600 font-medium bg-white rounded-lg shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.25 10.375h3.375M13.5 19.5V12m0 0a3 3 0 0 0-3-3H6.75a3 3 0 0 0-3 3v2.25l2.625 2.625m3.15-4.125l-2.625 2.625M19.5 19.5h-15m5.25 0v-2.25m1.5-2.25V12m0-3.75h1.5A1.125 1.125 0 0 1 15 8.375v1.5m-3 7.5h-1.5A1.125 1.125 0 0 1 9.75 16.125v-1.5m-3-7.5h1.5A1.125 1.125 0 0 1 8.25 7.125v1.5m4.5 10.125v-2.25M6.75 19.5h10.5" />
                    </svg>
                    No reports found matching your current filters.
                </div>
            )}

            {/* Desktop Table */}
            {!loading && !error && reports.length > 0 && (
                <div className="hidden md:block">
                    {/* Make the table scroll internally (both axes) while keeping the header sticky */}
                    <div className="max-h-[480px] overflow-auto rounded-lg bg-white shadow">
                        <table className="min-w-max bg-white">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-sm sticky top-0">
                                <tr>
                                    <th className="p-4 text-left w-36 sticky left-0 top-0 z-30 bg-gray-100">Date</th>
                                    <th className="p-4 text-left w-40 sticky left-36 top-0 z-30 bg-gray-100">Name</th>
                                    <th className="p-4 text-left">Main Project</th>
                                    <th className="p-4 text-left">Other Projects</th>
                                    <th className="p-4 text-left">Report Summary</th>
                                    <th className="p-4 text-left">Time</th>
                                    <th className="p-4 text-left">Status</th>
                                    <th className="p-4 text-left w-36 sticky right-0 top-0 z-30 bg-gray-100">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-700 font-semibold">
                                {reports.map(report => (
                                    <tr key={report.id} className="border-b hover:bg-gray-50 transition">
                                        <td className="p-4 align-top whitespace-nowrap sticky left-0 bg-white z-20">{formatYMD(report.submission_time || report.report_date || report.created_at)}</td>
                                            {
                                                (() => {
                                                    const empId = report.employee_id || report.employeeId || report.user_id || report.userId || report.employee_id_legacy || null;
                                                    if (empId) {
                                                        return (
                                                            <td className="p-4 align-top whitespace-nowrap sticky left-36 bg-white z-20">
                                                                <button onClick={() => navigate(`/admin/reports/employee/${empId}`)} className="text-indigo-600 hover:text-indigo-900">{report.employee_name}</button>
                                                            </td>
                                                        );
                                                    }
                                                    return (
                                                        <td className="p-4 align-top whitespace-nowrap sticky left-36 bg-white z-20">{report.employee_name}</td>
                                                    );
                                                })()
                                            }
                                            <td className="p-4 align-top whitespace-nowrap">{report.main_project}</td>
                                            <td className="p-4 align-top whitespace-nowrap">{report.other_project}</td>
                                            <td className="p-4 max-w-[48ch] truncate">{summarizeReport(report.report_text)}</td>
                                            <td className="p-4 align-top whitespace-nowrap">{formatTime(report.submission_time || report.created_at || report.report_date)}</td>
                                            <td className="p-4 align-top whitespace-nowrap">{getStatusBadge(report.compliance_status)}</td>
                                            <td className="p-4 align-top whitespace-nowrap sticky right-0 bg-white z-20">
                                                <button
                                                    onClick={() => { setSelectedReport(report); setIsReportModalOpen(true); }}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                >
                                                    View
                                                </button>
                                            </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                            <p className="text-sm font-semibold text-gray-800 mb-1">{(report.employee_id || report.employeeId || report.user_id || report.userId) ? (
                                <button onClick={() => navigate(`/admin/reports/employee/${report.employee_id || report.employeeId || report.user_id || report.userId}`)} className="text-indigo-600">{report.employee_name}</button>
                            ) : report.employee_name}</p>
                            {/* Teams */}
                            <p className="text-xs text-gray-600 mb-2">{Array.isArray(report.teams) ? (report.teams.length ? report.teams.join(', ') : 'N/A') : (typeof report.team === 'string' ? report.team : 'N/A')}</p>
                            {/* Report */}
                            <p className="text-gray-700 text-sm mb-2">{summarizeReport(report.report_text)}</p>
                            {/* Time + Status */}
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">{formatTime(report.submission_time || report.created_at || report.report_date)}</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${report.compliance_status === 'OnTime' ? 'bg-green-100 text-green-700' :
                                    report.compliance_status === 'Late' ? 'bg-yellow-100 text-yellow-700' :
                                        report.compliance_status === 'HUL' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                    }`}>{report.compliance_status}</span>
                            </div>
                            <div className="mt-3 text-right">
                                <button
                                    onClick={() => { setSelectedReport(report); setIsReportModalOpen(true); }}
                                    className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                                >
                                    View Details
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isReportModalOpen && (
                <ReportDetailModal
                    isOpen={isReportModalOpen}
                    onClose={() => { setIsReportModalOpen(false); setSelectedReport(null); }}
                    report={selectedReport}
                />
            )}
        </div>
    );
};

export default MorningReports;
