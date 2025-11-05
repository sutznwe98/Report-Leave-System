import React, { useState, useEffect, useMemo, useCallback,useRef  } from 'react';

const NRC_STATES = [
  { id: '1', name: 'Kachin State' }, { id: '2', name: 'Kayah State' },
  { id: '3', name: 'Kayin State' }, { id: '4', name: 'Chin State' },
  { id: '5', name: 'Sagaing Region' }, { id: '6', name: 'Tanintharyi Region' },
  { id: '7', 'name': 'Bago Region' }, { id: '8', name: 'Magway Region' },
  { id: '9', name: 'Mandalay Region' }, { id: '10', name: 'Mon State' },
  { id: '11', name: 'Rakhine State' }, { id: '12', name: 'Yangon Region' },
  { id: '13', name: 'Shan State' }, { id: '14', name: 'Ayeyarwady Region' }
];

const NRC_STATUSES = ['(N)', '(F)', '(P)'];

/**
 * A highly reusable and responsive component for inputting a Myanmar NRC number.
 * It uses four separate inputs (State, Township, Status, Number) and combines them
 * into a single string output via the onChange callback.
 *
 * Example Format: 12/ThaKaTa(N)123456
 *
 * @param {object} props
 * @param {string} props.value - The current full NRC string (e.g., "12/ThaKaTa(N)123456").
 * @param {(nrc: string) => void} props.onChange - Callback function to update the full NRC string.
 * @param {string} props.className - Tailwind CSS classes for the container div.
 */
const NrcInput = ({ value, onChange, className = '' }) => {
  // 1. Initial State Parsing
  const parseNrc = (nrcString) => {
    const safeNrc = typeof nrcString === 'string' ? nrcString.trim() : '';
    // Regex to match: [1-14]/[TownshipCode]([N|F|P])[6-digits] - now case-insensitive for township
    const match = safeNrc.match(/^(\d{1,2})\/([a-z]{1,7})\(([nfp])\)(\d{6})$/i);
    if (match) {
      return {
        stateId: match[1] || '',
        townshipCode: match[2] || '',
        status: `(${match[3]})` || '',
        number: match[4] || ''
      };
    }

    return { stateId: '', townshipCode: '', status: '(N)', number: '' };
  };

  const [stateId, setStateId] = useState('');
  const [townshipCode, setTownshipCode] = useState('');
  const [status, setStatus] = useState('(N)');
  const [number, setNumber] = useState('');
  const lastSentNrc = useRef('');

  // Effect to parse the incoming value prop
  useEffect(() => {
    const parsed = parseNrc(value);
    setStateId(parsed.stateId);
    setTownshipCode(parsed.townshipCode);
    setStatus(parsed.status || '(N)');
    setNumber(parsed.number);
  }, [value]);

  // Effect to call onChange when internal state changes
useEffect(() => {
  const combinedNrc = (stateId && townshipCode && status && number.length === 6)
    ? `${stateId}/${townshipCode}${status}${number}`
    : '';

  if (combinedNrc && combinedNrc !== lastSentNrc.current) {
    onChange(combinedNrc);
    lastSentNrc.current = combinedNrc; // remember the last value we sent
  }
}, [stateId, townshipCode, status, number, onChange]);

  // 4. Handlers
  const handleStateChange = (e) => {
    const newStateId = e.target.value;
    setStateId(newStateId);
    // Reset township when state changes
    setTownshipCode('');
  };

  const handleNumberChange = (e) => {
    const sanitizedInput = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    // Only update state if the sanitized value is different to prevent cursor jumping
    if (sanitizedInput !== number) {
      setNumber(sanitizedInput);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-150 ease-in-out";

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">NRC No. (e.g., 12/ThaKaTa(N)123456)</label>
      <div className="flex flex-col sm:flex-row gap-2">
        {/* State/Region Dropdown */}
        <div className="flex-1">
          <select
            value={stateId}
            onChange={handleStateChange}
            className={inputClass}
          >
            <option value="" disabled>1-14</option>
            {NRC_STATES.map((state) => (
              <option key={state.id} value={state.id}>{state.id}</option>
            ))}
          </select>
        </div>

        {/* Township Code Dropdown */}
        <div className="flex-1 flex items-center gap-1">
          <span className="text-gray-500">/</span>
          <input
            type="text"
            placeholder="Township Code"
            value={townshipCode}
            onChange={(e) => setTownshipCode(e.target.value)}
            disabled={!stateId}
            className={inputClass}
            maxLength={7}
          />
        </div>

        {/* Citizenship Status Dropdown */}
        <div className="flex-shrink-0 w-20">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {NRC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* 6-Digit Number Input */}
        <div className="flex-1 flex items-center gap-1">
          <span className="text-gray-500">-</span>
          <input
            type="text"
            placeholder="123456"
            value={number}
            onChange={handleNumberChange}
            maxLength={6}
            className={`${inputClass} font-mono`}
            aria-label="NRC Number"
          />
        </div>
      </div>
      {/* Visual Feedback for the final combined NRC */}
      <div className="mt-1 text-xs text-gray-500">
        Final NRC: <span className="font-semibold text-indigo-600">{(stateId && townshipCode && status && number) ? `${stateId}/${townshipCode}${status}${number}` : 'Incomplete'}</span>
      </div>
    </div>
  );
};

export default NrcInput;