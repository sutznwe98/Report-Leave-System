import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, User, Mail, Phone, Briefcase, Calendar, Home, DollarSign, FileText, Banknote, Building2 } from 'lucide-react';

const API_URL = "http://localhost:5000/api";

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
    <dt className="text-sm font-medium text-gray-500 flex items-center">
      <Icon className="w-5 h-5 mr-2 text-gray-400" />
      {label}
    </dt>
    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">
      {value || 'N/A'}
    </dd>
  </div>
);

const EmployeeDetailPage = () => {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        // The backend endpoint is currently public, so no auth header is needed.
        const response = await axios.get(`${API_URL}/employees/${id}`);
        setEmployee(response.data);
      } catch (err) {
        setError('Failed to fetch employee details. The employee may not exist.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center">Loading employee details...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  if (!employee) {
    return <div className="p-8 text-center">No employee data found.</div>;
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-CA'); // YYYY-MM-DD
  };

  const getRoleLabel = (roleValue) => {
    if (!roleValue) return 'N/A';
    const roleMap = {
      'pj lead': 'Project Lead',
      'employee': 'Employee',
      'admin': 'Admin'
    };
    // Return the mapped label, or capitalize the original value as a fallback
    return roleMap[roleValue.toLowerCase()] || roleValue.charAt(0).toUpperCase() + roleValue.slice(1);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-2xl leading-6 font-bold text-gray-900">
            {employee.employee_name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {employee.position}
          </p>
        </div>
        <Link
          to="/admin/employees" // The path is correct
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 inline-flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          Back to Employee List
        </Link>
      </div>

      <div className="bg-white shadow-xl rounded-lg overflow-hidden">
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="sm:p-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h4>
              <DetailRow icon={User} label="TMD" value={employee.TMD} />
              <DetailRow icon={Mail} label="Email" value={employee.email} />
              <DetailRow icon={Calendar} label="Birthday" value={formatDate(employee.real_birth_date)} />
              <DetailRow icon={Calendar} label="Birthday (on NRC)" value={formatDate(employee.birth_date_on_nrc)} />
              <DetailRow icon={Home} label="Marital Status" value={employee.marital_status} />
              <DetailRow icon={User} label="NRC No." value={employee.nrc_no} />
            </div>

            <div className="sm:p-6">
              <h4 className="text-lg font-semibold text-gray-800 my-4">Employment Details</h4>
              <DetailRow icon={User} label="Role" value={getRoleLabel(employee.role)} />
              <DetailRow icon={Briefcase} label="Position" value={employee.position} />
              <DetailRow icon={Building2} label="Main Project" value={employee.project} />
              <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-gray-500 flex items-start">
                  <Briefcase className="w-5 h-5 mr-2 text-gray-400 mt-0.5" />
                  Other Project(s)
                </dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-semibold">
                  {(employee.project_assignments && employee.project_assignments.length > 0) ? (
                    employee.project_assignments.map(p => `${p.project_name} (${getRoleLabel(p.position_on_project)})`).join(', ')
                  ) : 'N/A'}
                </dd>
              </div>
              <DetailRow icon={Calendar} label="Joined Date" value={formatDate(employee.joined_date)} />
              <DetailRow icon={Home} label="Work Location" value={employee.wfh_office} />
              <DetailRow icon={FileText} label="Contract Date" value={formatDate(employee.contract_date)} />
              <DetailRow icon={User} label="Contract By" value={employee.contract_by} />
            </div>

            <div className="sm:p-6">
              <h4 className="text-lg font-semibold text-gray-800 my-4">Salary & Bank Details</h4>
              <DetailRow icon={DollarSign} label="Probation Salary" value={employee.probation_period} />
              <DetailRow icon={DollarSign} label="After Probation Salary" value={employee.after_probation} />
              <DetailRow icon={Banknote} label="KBZ Bank Account" value={employee.kbz_bank_account} />
              <DetailRow icon={Banknote} label="Other Bank" value={employee.bank} />
              <DetailRow icon={Banknote} label="Other Bank Account" value={employee.bank_acc} />
            </div>

            <div className="sm:p-6">
              <h4 className="text-lg font-semibold text-gray-800 my-4">Contact & Address</h4>
              <DetailRow icon={Phone} label="Contact No" value={employee.contact_no} />
              <DetailRow icon={Phone} label="Parents' Contact" value={employee.parents_contact_no} />
              <DetailRow icon={Home} label="Current Address" value={employee.current_address} />
              <DetailRow icon={Home} label="Permanent Address" value={employee.address} />
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetailPage;