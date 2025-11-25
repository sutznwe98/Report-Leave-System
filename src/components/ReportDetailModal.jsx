import React from 'react';

const SECTION_LABELS = [
  /Yesterday task:/i,
  /Today task:/i,
  /Problem:/i,
];

const parseSections = (text) => {
  if (!text) return [{ label: null, content: 'No content available' }];
  const parts = [];
  // Normalize line endings
  const s = String(text).replace(/\r\n/g, '\n');

  // Find all label positions
  const regex = /(Yesterday task:|Today task:|Problem:)/gi;
  let match;
  const indices = [];
  while ((match = regex.exec(s)) !== null) {
    indices.push({ idx: match.index, label: match[0] });
  }

  if (indices.length === 0) {
    return [{ label: null, content: s }];
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].idx;
    const label = indices[i].label.replace(/:$/,'');
    const end = i + 1 < indices.length ? indices[i + 1].idx : s.length;
    const content = s.slice(start + indices[i].label.length, end).trim();
    parts.push({ label: label.trim(), content });
  }

  // If there is leading text before first label, include it
  if (indices[0].idx > 0) {
    const leading = s.slice(0, indices[0].idx).trim();
    if (leading) parts.unshift({ label: null, content: leading });
  }

  return parts;
};

const ReportDetailModal = ({ isOpen, onClose, report }) => {
  if (!isOpen || !report) return null;

  const sections = parseSections(report.report_text || '');

  const pickDateTimeSource = (r) => r.submission_time || r.report_date || r.created_at || null;

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
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours.toString().padStart(2, '0')}:${minutesStr} ${ampm}`;
  };

  const source = pickDateTimeSource(report);

  const renderStatusBadge = (status) => {
    const s = (status || '').toString().toLowerCase();
    switch (s) {
      case 'ontime':
      case 'on time':
        return <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">On Time</span>;
      case 'late':
        return <span className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-100 rounded-full">Late</span>;
      case 'hul':
        return <span className="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-full">Half Unpaid Leave</span>;
      case 'upl':
        return <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">Full Unpaid Leave</span>;
      case 'qa':
        return <span className="px-2 py-1 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full">QA</span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Rejected</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-yellow-50 rounded-full">Pending</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-full">{status || '-'}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose}></div>
        <div className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-2xl font-bold text-gray-900">Report Details</h3>
            <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="py-2 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium text-gray-600">Date</div>
                  <div className="text-sm font-semibold text-gray-800">{formatYMD(source)}</div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-gray-600">Time</div>
                  <div className="text-sm font-semibold text-gray-800">{formatTime(source)}</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-sm font-medium text-gray-600">Status</div>
                <div className="mt-1">{renderStatusBadge(report.compliance_status)}</div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2">Report Content</h4>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                {sections.map((sec, i) => (
                  <div key={i} className="mb-4">
                    {sec.label && (
                      <div className="text-lg font-semibold text-gray-800 mb-1">{sec.label}:</div>
                    )}
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{sec.content || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailModal;
