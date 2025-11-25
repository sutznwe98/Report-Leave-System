import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Modal from "../components/Modal";
import { User, Mail, Phone, Briefcase, Calendar, Home, DollarSign, FileText, Banknote, Building2 } from 'lucide-react';
import formatRole from '../utils/formatRole';
import { useAuth } from "../context/AuthContext";

const API_URL = "http://localhost:5000/api";

// ==============================
// 1. HELPER FUNCTIONS & ICONS
// ==============================

const GiftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
);

const Avatar = ({ name }) => {
  const safeName = name ? name.replace(/\p{Extended_Pictographic}/gu, "").trim() : "";
  const initials = safeName ? safeName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "??";
  const colors = ["bg-red-100 text-red-600", "bg-green-100 text-green-600", "bg-blue-100 text-blue-600", "bg-yellow-100 text-yellow-600", "bg-purple-100 text-purple-600", "bg-pink-100 text-pink-600"];
  const colorClass = colors[(safeName.length) % colors.length];

  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${colorClass}`}>
      {initials}
    </div>
  );
};

// --- Logic to clean up the messy project data from API ---
const normalizeProjects = (emp) => {
  const rawList = emp.project_assignments || emp.projects || emp.project_list || emp.assigned_projects || [];
  const normalized = [];

  // If there is a specific "Main Project" field, add it first
  if (emp.main_project_name || emp.main_project) {
    normalized.push({
      name: emp.main_project_name || emp.main_project,
      is_main: true,
      position: emp.main_project_position || emp.main_project_role || null
    });
  }

  // Parse the array
  if (Array.isArray(rawList)) {
    rawList.forEach(p => {
      const name = typeof p === 'string' ? p : (p.project_name || p.name || p.title);
      // Prevent duplicates if main project is already added
      if (normalized.some(existing => existing.name === name)) return; 

      normalized.push({
        name: name,
        is_main: p.is_main || false,
        position: p.position || p.role || p.position_on_project || null
      });
    });
  }

  return normalized;
};

// --- Logic to calculate Age ---
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

// Format date to 'Nov 21, 1998' (or '-' if invalid)
const formatLongDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ==============================
// 2. SUB-COMPONENTS (For cleaner UI code)
// ==============================

const ProjectBadge = ({ name, isMain, position }) => (
  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${isMain ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"}`}>
    <span>{name}</span>
    {position && (
      <span className={`text-[10px] ${isMain ? "text-indigo-200" : "text-gray-500"}`}>• {position}</span>
    )}
    {isMain && <span className="ml-1 text-[10px] font-semibold">(Main)</span>}
  </span>
);

const EmployeeCard = ({ data, userRole, onWish, onOpenDetail, alreadySent }) => {
  const { id, name, role, birthDate, displayDate, age, projects } = data;

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 overflow-hidden flex flex-col">
      <div className="p-6 flex items-start justify-between">
        <div className="flex gap-4 w-full">
          <div className="flex-shrink-0">
             <Avatar name={name} />
          </div>
          <div className="flex-grow">
            {userRole === "admin" ? (
              <button onClick={() => onOpenDetail(data)} className="font-bold text-gray-900 hover:text-indigo-600 transition-colors block text-left text-lg focus:outline-none">
                {name}
              </button>
            ) : (
              <button onClick={() => onOpenDetail(data)} className="font-bold text-gray-900 text-lg text-left focus:outline-none">
                {name}
              </button>
            )}
            
            <div className="space-y-1 mt-1">
                <p className="text-sm text-gray-500">Role: <span className="font-medium text-gray-800">{formatRole(role)}</span></p>
                <p className="text-sm text-gray-500">Birthdate: <span className="font-medium text-gray-800">{birthDate}</span></p>
                <p className="text-sm text-gray-500">Age: {age}</p>
            </div>

            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-1">Projects:</p>
              <div className="flex flex-wrap gap-2">
                {projects.length > 0 ? (
                  projects.map((p, idx) => <ProjectBadge key={idx} name={p.name} isMain={p.is_main} position={p.position} />)
                ) : (
                  <span className="text-gray-400 text-sm">-</span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Date Badge (Top Right) */}
        <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-100 whitespace-nowrap flex-shrink-0 ml-2">
          {displayDate}
        </div>
      </div>

      <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        {userRole === "admin" ? (
          alreadySent ? (
            <button disabled className="flex items-center px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg transition-colors shadow-sm cursor-not-allowed">
              <span className="mr-2">✓</span> Already Sent
            </button>
          ) : (
            <button onClick={() => onWish(data)} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
              <span className="mr-2">🎉</span> Send Wish
            </button>
          )
        ) : (
          <span className="text-xs text-gray-400 italic flex items-center">
             <span className="w-2 h-2 bg-gray-300 rounded-full mr-2"></span> View Only
          </span>
        )}
      </div>
    </div>
  );
};

// ==============================
// 3. MAIN COMPONENT
// ==============================

const EmployeesBirthday = () => {
  const { user, token } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [sentMap, setSentMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // Employee detail modal
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
        name: d.employee_name || emp.name || d.name,
        TMD: d.TMD || d.tmd || d.TMD || null,
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
      // fallback to summary
      setDetailEmp(emp);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        // 1. Fetch Basic List
        const { data } = await axios.get(`${API_URL}/notifications/birthdays`);
        const rawRows = data?.rows || [];

        // 2. Fetch Details for each (to get projects/roles)
        // Note: Ideally your backend should return this in the first call to avoid this loop
        const detailedData = await Promise.all(rawRows.map(async (row) => {
            try {
                const detailRes = await axios.get(`${API_URL}/employees/${row.id}`);
                const details = detailRes.data;
                const rawDate = details.real_birth_date || details.birth_date_on_nrc || row.real_birth_date;
                
                // Clean the data structure HERE so UI doesn't have to worry about it
                return {
                    id: row.id,
                    name: row.employee_name,
                    role: details.role || row.role || "-",
                    projects: normalizeProjects(details),
                    age: calculateAge(rawDate),
                    // Format: "Nov 22, 1998"
                    birthDate: new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                    // Format: "Nov 22"
                    displayDate: new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                };
            } catch (e) {
                // Fallback if detail fetch fails
                return { 
                    id: row.id, 
                    name: row.employee_name, 
                    role: "-", 
                    projects: [], 
                    age: "-", 
                    birthDate: "-", 
                    displayDate: "-" 
                };
            }
        }));

        if (mounted) setEmployees(detailedData);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load birthdays");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => { mounted = false; };
  }, []);

  const openWishModal = (emp) => {
    setSelectedEmp(emp);
    setMessage(`Happy Birthday, ${emp.name}! 🎉\n\nMay this year bring new opportunities, exciting challenges, and success in everything you pursue. Thank you for being a valuable part of our team.\n\nWishing you a wonderful year ahead!`);
    setShowModal(true);
  };

  const sendWish = async () => {
    if (!selectedEmp) return;
    setSending(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API_URL}/notifications/wish`, { employee_id: selectedEmp.id, message, occasion: 'birthday' }, { headers });
      alert("Wish sent successfully!");
      setShowModal(false);
      setSentMap(prev => ({ ...prev, [selectedEmp.id]: true }));
    } catch (err) {
      alert("Failed to save wish: " + (err.response?.data?.message || err.message));
    } finally {
      setSending(false);
    }
  };

  // After loading employees, check which ones the current admin already sent wishes for
  useEffect(() => {
    let mounted = true;
    const checkSent = async () => {
      if (!user?.id || !token || employees.length === 0) return;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const results = await Promise.all(employees.map(async (emp) => {
          try {
            const res = await axios.get(`${API_URL}/notifications/wishes/${emp.id}`, { headers });
            const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
            // Check if any row was created by current user for birthday occasion
            const found = rows.some(r => Number(r.created_by) === Number(user.id) && (r.occasion === 'birthday' || (r.occasion === undefined && String(r.message_template || r.message || '').toLowerCase().includes('happy birthday'))));
            return { id: emp.id, sent: found };
          } catch (e) {
            return { id: emp.id, sent: false };
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
  }, [employees, user?.id, token]);

  if (loading) return (
    <div className="p-8 flex justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <span className="text-indigo-600"><GiftIcon /></span> Employee Birthdays
            </h1>
            <p className="text-gray-500 mt-1">Celebrate your team's special days</p>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 mb-6">{error}</div>}

        {!error && employees.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
            <div className="text-gray-300 text-6xl mb-4">🎂</div>
            <h3 className="text-lg font-medium text-gray-900">No birthdays today</h3>
            <p className="text-gray-500">Check back tomorrow for upcoming celebrations.</p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {employees.map((emp) => (
            <EmployeeCard 
                key={emp.id} 
                data={emp} 
                userRole={user?.role?.toLowerCase()} 
                onWish={openWishModal} 
                onOpenDetail={openEmployeeDetail}
                alreadySent={!!sentMap[emp.id]}
            />
          ))}
        </div>
      </div>

      {/* Employee Detail Modal */}
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
      {/* Modal */}
      {showModal && selectedEmp && (
        <Modal title={`Send Wish to ${selectedEmp.name}`} onClose={() => setShowModal(false)}>
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
            />
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors" disabled={sending}>Cancel</button>
              <button type="button" onClick={sendWish} className="flex items-center px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md disabled:opacity-70" disabled={sending}>
                {sending ? "Sending..." : <><SendIcon /> Send Wish</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default EmployeesBirthday;