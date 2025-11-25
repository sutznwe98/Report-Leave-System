import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import formatRole from '../utils/formatRole';
import { User, Mail, Phone, Briefcase, Calendar, Home, DollarSign, FileText, Banknote, Building2 } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

// --- Helper: Avatar (Same as Birthday) ---
const Avatar = ({ name }) => {
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '??';
  
  // Consistent pastel palette
  const colors = ['bg-red-100 text-red-600', 'bg-green-100 text-green-600', 'bg-blue-100 text-blue-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600', 'bg-pink-100 text-pink-600'];
  const colorClass = colors[name.length % colors.length];

  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${colorClass}`}>
      {initials}
    </div>
  );
};

// --- Icons (Styled like Birthday) ---
const MedalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
);

const EmployeesAnnual = () => {
  const { user, token } = useAuth();
  const [rows, setRows] = useState([]);
  const [anniversaryGroups, setAnniversaryGroups] = useState({});
  const [sentMap, setSentMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_URL}/notifications/annual`);
        if (!mounted) return;
        setRows(res.data?.rows || []);

        // Additional: fetch full employee list and compute joined-date anniversaries
        try {
          const empRes = await axios.get(`${API_URL}/employees`);
          const emps = empRes.data || [];
          const today = new Date();
          const m = today.getMonth() + 1;
          const d = today.getDate();

          // Filter employees who have a joined_date and whose month/day match today
          const anniversaries = (emps || []).filter(e => {
            if (!e.joined_date) return false;
            const jd = new Date(e.joined_date);
            if (isNaN(jd.getTime())) return false;
            return jd.getMonth() + 1 === m && jd.getDate() === d && (String(e.role || '').toLowerCase() !== 'admin');
          });

          // Group by years of service
          const groups = {};
          anniversaries.forEach(a => {
            const years = getTenure(a.joined_date);
            const key = years === null ? 'Unknown' : String(years);
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
          });

          if (mounted) setAnniversaryGroups(groups);
        } catch (empErr) {
          console.warn('Failed to fetch employees for anniversary grouping:', empErr.message || empErr);
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to load annual list');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  // Helper: Calculate Years of Service
  const getTenure = (dateString) => {
      if (!dateString) return null;
      const start = new Date(dateString);
      const now = new Date();
      if(isNaN(start.getTime())) return null;

      let years = now.getFullYear() - start.getFullYear();
      const m = now.getMonth() - start.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < start.getDate())) {
          years--;
      }
      return years;
  };

  // --- Helpers copied from Birthday page for modal details ---
  const normalizeProjects = (emp) => {
    const rawList = emp.project_assignments || emp.projects || emp.project_list || emp.assigned_projects || [];
    const normalized = [];

    if (emp.main_project_name || emp.main_project) {
      normalized.push({
        name: emp.main_project_name || emp.main_project,
        is_main: true,
        position: emp.main_pj_position || emp.main_project_position || emp.position || null,
      });
    }

    if (Array.isArray(rawList)) {
      rawList.forEach(p => {
        const name = typeof p === 'string' ? p : (p.project_name || p.name || p.title);
        if (normalized.some(existing => existing.name === name)) return;
        normalized.push({
          name: name,
          is_main: p.is_main || false,
          position: p.position || p.role || p.position_on_project || null,
        });
      });
    }

    return normalized;
  };

  const calculateAge = (dateStr) => {
      if (!dateStr) return "-";
      const today = new Date();
      const birthDate = new Date(dateStr);
      if(isNaN(birthDate)) return "-";
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      return age;
  };

  const formatLongDate = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper: Format Date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Normalize date-only string (avoid timezone shifts)
  const formatDateOnly = (bd) => {
    if (!bd) return '-';
    const s = String(bd);
    if (s.indexOf('T') !== -1) return s.split('T')[0];
    const m = s.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    return s;
  };

  const getBirthDisplay = (r) => {
    const dateField = r.real_birth_date || r.birth_date_on_nrc || r.birth_date || r.dob || r.date_of_birth;
    const formatted = formatDate(dateField);
    return formatted === 'Invalid Date' ? '-' : formatted;
  };

  const getProjectsText = (r) => {
    // Possible shapes: r.projects = ['A','B'] or r.project_names = 'A, B' or r.projects may be a comma string
    if (!r) return '-';
    if (Array.isArray(r.projects) && r.projects.length) return r.projects.join(', ');
    if (typeof r.project_names === 'string' && r.project_names.trim()) return r.project_names;
    if (typeof r.projects === 'string' && r.projects.trim()) return r.projects;
    // sometimes projects come as objects
    if (Array.isArray(r.project_list) && r.project_list.length) return r.project_list.map(p => p.name || p.project_name || p).join(', ');
    return '-';
  };

  const openWish = (emp) => {
    const years = getTenure(emp.joined_date);
    const yearsText = years > 0 ? ` ${years} year${years > 1 ? 's' : ''}` : '';

    // Use the same friendly template as the Birthday page but tailored for anniversaries
    setSelected(emp);
    setMessage(`Happy Work Anniversary, ${emp.employee_name}! 🎉\n\nMay this new year at work bring you growth, exciting challenges, and continued success. Thank you for being a valuable part of our team and congratulations on completing${yearsText}.\n\nWishing you all the best!`);
    setShowModal(true);
  };

  // Employee detail modal state & opener (same behavior as Birthday page)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEmp, setDetailEmp] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openEmployeeDetail = async (emp) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_URL}/employees/${emp.id}`);
      const d = res.data || {};
      const rawDate = d.real_birth_date || d.birth_date_on_nrc || d.real_birth_date || d.birth_date;
      const modalEmp = {
        id: d.id || emp.id,
        name: d.employee_name || emp.employee_name || emp.name || d.name,
        TMD: d.TMD || d.tmd || null,
        email: d.email || null,
        role: d.role || emp.role || null,
        position: d.position || null,
        main_project_name: d.main_project_name || d.project || null,
        projects: normalizeProjects(d),
        birthDate: formatLongDate(rawDate),
        joinedDate: formatLongDate(d.joined_date),
        age: calculateAge(rawDate),
        kbz_bank_account: d.kbz_bank_account || d.kbz_bank || null,
        bank: d.bank || null,
        bank_acc: d.bank_acc || null,
        contact_no: d.contact_no || null,
        parents_contact_no: d.parents_contact_no || null,
        current_address: d.current_address || d.address || null,
        address: d.address || null,
        contract_date: formatLongDate(d.contract_date),
        contract_by: d.contract_by || null,
        total_annual_leave: d.total_annual_leave || null,
        remaining_annual_leave: d.remaining_annual_leave || null,
        main_pj_position: d.main_pj_position || d.main_project_position || null,
        raw: d,
      };
      setDetailEmp(modalEmp);
    } catch (err) {
      console.warn('Failed to fetch full employee details for modal', emp.id, err?.message || err);
      setDetailEmp(emp);
    } finally {
      setDetailLoading(false);
    }
  };

  const sendWish = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API_URL}/notifications/wish`, {
        employee_id: selected.id,
        message,
        occasion: 'anniversary'
      }, { headers });
      alert('Wish sent successfully!');
      setShowModal(false);
      setSentMap(prev => ({ ...prev, [selected.id]: true }));
    } catch (err) {
      console.error('Failed to save wish:', err);
      alert('Failed to save wish: ' + (err.response?.data?.message || err.message));
    } finally {
      setSending(false);
    }
  };

  // After loading rows/anniversaries, pre-check which employees current admin already sent wishes for
  useEffect(() => {
    let mounted = true;
    const gatherIds = () => {
      const ids = new Set();
      rows.forEach(r => { if (r.id) ids.add(r.id); });
      Object.values(anniversaryGroups || {}).forEach(list => { (list || []).forEach(e => { if (e.id) ids.add(e.id); }); });
      return Array.from(ids);
    };
    const checkSent = async () => {
      if (!user?.id || !token) return;
      const ids = gatherIds();
      if (!ids.length) return;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const res = await axios.get(`${API_URL}/notifications/wishes/${id}`, { headers });
            const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
            const found = rows.some(r => Number(r.created_by) === Number(user.id) && (r.occasion === 'anniversary' || (r.occasion === undefined && String(r.message_template || r.message || '').toLowerCase().includes('anniversary'))));
            return { id, sent: found };
          } catch (e) {
            return { id, sent: false };
          }
        }));
        if (!mounted) return;
        const map = {};
        results.forEach(r => { if (r.sent) map[r.id] = true; });
        setSentMap(prev => ({ ...prev, ...map }));
      } catch (e) {
        // ignore
      }
    };
    checkSent();
    return () => { mounted = false; };
  }, [rows, anniversaryGroups, user?.id, token]);

  const canWish = user && user.role && user.role.toLowerCase() === 'admin';

  if (loading) return (
    <div className="p-8 flex justify-center">
       <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header Section (Matches Birthday) */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="text-indigo-600"><MedalIcon /></span>
                    Work Anniversaries
                </h1>
                <p className="text-gray-500 mt-1">Celebrate years of service and track leave</p>
            </div>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 mb-6">
                {error}
            </div>
        )}

        {/* If we computed anniversary groups (by years of service), render grouped sections */}
        {!error && Object.keys(anniversaryGroups || {}).length > 0 && (
          <div className="space-y-8">
            {(() => {
              const keys = Object.keys(anniversaryGroups).filter(k => k !== 'Unknown');
              const numericKeys = keys.map(k => Number(k)).filter(n => !isNaN(n)).sort((a, b) => a - b).map(String);
              const ordered = [...numericKeys];
              if (anniversaryGroups['Unknown']) ordered.push('Unknown');
              return ordered.map((k) => (
                <div key={`yr-${k}`}> 
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">{k === '0' ? 'New' : k === 'Unknown' ? 'Unknown Tenure' : `${k} Year${Number(k) > 1 ? 's' : ''}`}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {anniversaryGroups[k].map(r => {
                      const tenure = getTenure(r.joined_date);
                      return (
                        <div key={r.id} className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 overflow-hidden flex flex-col">
                          <div className="p-6 flex items-start justify-between">
                            <div className="flex gap-4">
                              <Avatar name={r.employee_name} />
                              <div>
                                {user && user.role && user.role.toLowerCase() === 'admin' ? (
                                  <button onClick={() => openEmployeeDetail(r)} className="font-bold text-gray-900 hover:text-indigo-600 transition-colors block text-left text-lg focus:outline-none">
                                    {r.employee_name}
                                  </button>
                                ) : (
                                  <button onClick={() => openEmployeeDetail(r)} className="font-bold text-gray-900 text-lg text-left focus:outline-none">{r.employee_name}</button>
                                )}
                                <p className="text-sm text-gray-500 mt-1">
                                  Leave Balance: <span className="font-medium text-gray-800">{r.remaining_annual_leave ?? '-'}{r.remaining_annual_leave !== undefined ? ' days' : ''}</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(r.joined_date)}</p>
                              </div>
                            </div>

                            {tenure !== null && (
                              <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-100 whitespace-nowrap">
                                {tenure === 0 ? 'New' : `${tenure} Year${tenure > 1 ? 's' : ''}`}
                              </div>
                            )}
                          </div>

                          <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            {canWish ? (
                              sentMap[r.id] ? (
                                <button disabled className="flex items-center px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg transition-colors shadow-sm cursor-not-allowed">✓ Already Sent</button>
                              ) : (
                                <button onClick={() => openWish(r)} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                                  <span className='mr-2'>🎉</span> Send Wish
                                </button>
                              )
                            ) : (
                              <span className="text-xs text-gray-400 italic flex items-center"><span className="w-2 h-2 bg-gray-300 rounded-full mr-2"></span>View Only</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* If no anniversary groups but we have low-bal rows from notifications API, render them */}
        {!error && Object.keys(anniversaryGroups || {}).length === 0 && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map(r => {
              const tenure = getTenure(r.joined_date);
              return (
                <div key={r.id} className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-6 flex items-start justify-between">
                    <div className="flex gap-4">
                      <Avatar name={r.employee_name} />
                      <div>
                        {user && user.role && user.role.toLowerCase() === 'admin' ? (
                          <button onClick={() => openEmployeeDetail(r)} className="font-bold text-gray-900 hover:text-indigo-600 transition-colors block text-left text-lg focus:outline-none">{r.employee_name}</button>
                        ) : (
                          <button onClick={() => openEmployeeDetail(r)} className="font-bold text-gray-900 text-lg text-left focus:outline-none">{r.employee_name}</button>
                        )}
                        <p className="text-sm text-gray-500 mt-1">Leave Balance: <span className="font-medium text-gray-800">{r.remaining_annual_leave ?? 0} days</span></p>
                        <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(r.joined_date)}</p>
                      </div>
                    </div>
                    {tenure !== null && (
                      <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-100 whitespace-nowrap">{tenure === 0 ? 'New' : `${tenure} Year${tenure > 1 ? 's' : ''}`}</div>
                    )}
                  </div>
                  <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    {canWish ? (
                      sentMap[r.id] ? (
                        <button disabled className="flex items-center px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg transition-colors shadow-sm cursor-not-allowed">✓ Already Sent</button>
                      ) : (
                        <button onClick={() => openWish(r)} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"><span className='mr-2'>🎉</span> Send Wish</button>
                      )
                    ) : (
                      <span className="text-xs text-gray-400 italic flex items-center"><span className="w-2 h-2 bg-gray-300 rounded-full mr-2"></span>View Only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No anniversaries at all */}
        {!error && Object.keys(anniversaryGroups || {}).length === 0 && rows.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
            <div className="text-gray-300 text-6xl mb-4">📅</div>
            <h3 className="text-lg font-medium text-gray-900">No anniversaries today</h3>
            <p className="text-gray-500">Check back tomorrow for upcoming milestones.</p>
          </div>
        )}
      </div>

      {/* Modal (Matches Birthday) */}
      {detailOpen && detailEmp && (
        <Modal onClose={() => setDetailOpen(false)} maxWidthClass="max-w-[50rem]">
          <div className="p-4 max-h-[80vh] overflow-auto">
            {detailLoading ? (
              <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>
            ) : (
              <div className="max-w-[50rem] mx-auto">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl leading-6 font-bold text-gray-900">{detailEmp.name}</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">{detailEmp.position || (detailEmp.raw && detailEmp.raw.position) || ''}</p>
                  </div>
                </div>

                <div className="bg-white shadow-xl rounded-lg overflow-hidden">
                  <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                    <dl className="sm:divide-y sm:divide-gray-200">
                      <div className="sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h4>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><User className="w-5 h-5 mr-2 text-gray-400"/>TMD</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.TMD || (detailEmp.raw && detailEmp.raw.TMD) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Mail className="w-5 h-5 mr-2 text-gray-400"/>Email</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && detailEmp.raw.email) || detailEmp.email || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Calendar className="w-5 h-5 mr-2 text-gray-400"/>Birthday</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.birthDate || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Home className="w-5 h-5 mr-2 text-gray-400"/>Marital Status</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && detailEmp.raw.marital_status) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><User className="w-5 h-5 mr-2 text-gray-400"/>NRC No.</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && (detailEmp.raw.nrc_no || detailEmp.raw.NRC_No)) || '-'}</dd>
                        </div>
                      </div>

                      <div className="sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-800 my-4">Employment Details</h4>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><User className="w-5 h-5 mr-2 text-gray-400"/>Role</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{formatRole(detailEmp.role)}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Briefcase className="w-5 h-5 mr-2 text-gray-400"/>Position</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.position || (detailEmp.raw && detailEmp.raw.position) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Building2 className="w-5 h-5 mr-2 text-gray-400"/>Main Project</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.main_project_name || (detailEmp.raw && detailEmp.raw.main_project_name) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-start"><Briefcase className="w-5 h-5 mr-2 text-gray-400 mt-0.5"/>Other Project(s)</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.projects && detailEmp.projects.length>0) ? detailEmp.projects.map(p => `${p.name} (${p.position || '-'})`).join(', ') : '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Calendar className="w-5 h-5 mr-2 text-gray-400"/>Joined Date</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.joinedDate || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Home className="w-5 h-5 mr-2 text-gray-400"/>Work Location</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && detailEmp.raw.wfh_office) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><FileText className="w-5 h-5 mr-2 text-gray-400"/>Contract Date</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.contract_date || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><User className="w-5 h-5 mr-2 text-gray-400"/>Contract By</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.contract_by || '-'}</dd>
                        </div>
                      </div>

                      <div className="sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-800 my-4">Salary & Bank Details</h4>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><DollarSign className="w-5 h-5 mr-2 text-gray-400"/>Probation Salary</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && detailEmp.raw.probation_period) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><DollarSign className="w-5 h-5 mr-2 text-gray-400"/>After Probation Salary</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{(detailEmp.raw && detailEmp.raw.after_probation) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Banknote className="w-5 h-5 mr-2 text-gray-400"/>KBZ Bank Account</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.kbz_bank_account || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Banknote className="w-5 h-5 mr-2 text-gray-400"/>Other Bank</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.bank || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Banknote className="w-5 h-5 mr-2 text-gray-400"/>Other Bank Account</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.bank_acc || '-'}</dd>
                        </div>
                      </div>

                      <div className="sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-800 my-4">Contact & Address</h4>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Phone className="w-5 h-5 mr-2 text-gray-400"/>Contact No</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.contact_no || (detailEmp.raw && detailEmp.raw.contact_no) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Phone className="w-5 h-5 mr-2 text-gray-400"/>Parents' Contact</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.parents_contact_no || (detailEmp.raw && detailEmp.raw.parents_contact_no) || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Home className="w-5 h-5 mr-2 text-gray-400"/>Current Address</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.current_address || '-'}</dd>
                        </div>
                        <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                          <dt className="text-sm font-medium text-gray-500 flex items-center"><Home className="w-5 h-5 mr-2 text-gray-400"/>Permanent Address</dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">{detailEmp.address || '-'}</dd>
                        </div>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
      {showModal && selected && (
        <Modal title={`Send Wish to ${selected.employee_name}`} onClose={() => setShowModal(false)}>
          <div className="p-1">
            <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                    This message will be sent via notification system.
                </p>
            </div>
            
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Message</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-4 text-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition shadow-sm resize-none bg-white"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write something nice..."
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendWish}
                className="flex items-center px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md disabled:opacity-70"
                disabled={sending}
              >
                {sending ? (
                    <>Sending...</>
                ) : (
                    <><SendIcon /> Send Wish</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default EmployeesAnnual;