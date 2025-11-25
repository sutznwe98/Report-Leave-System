import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://localhost:5000/api';

export default function TodayBirthdays({ maxVisible = 5, excludeCurrentUser = false }) {
  const { token, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(`${API_URL}/notifications/birthdays`, { headers });
        if (!mounted) return;
        const list = res.data?.rows || (Array.isArray(res.data) ? res.data : []);

        // If rows lack team/project info, fetch employee details to enrich them
        const needEnrich = list.filter(r => {
          const hasTeam = !!(r.teams || r.team || r.project || r.main_project || r.department);
          return !hasTeam;
        });

        if (needEnrich.length > 0) {
          try {
            const fetched = {};
            await Promise.all(needEnrich.map(async (r) => {
              const id = r.id ?? r.employee_id ?? r.employeeId;
              if (!id) return;
              try {
                const empRes = await axios.get(`${API_URL}/employees/${id}`, { headers });
                const emp = empRes.data || {};
                fetched[id] = emp;
              } catch (e) {
                // ignore per-employee fetch failures
              }
            }));

            const enriched = list.map(r => {
              const id = r.id ?? r.employee_id ?? r.employeeId;
              if (id && fetched[id]) {
                return { ...r, ...fetched[id] };
              }
              return r;
            });
            setRows(enriched);
          } catch (e) {
            // fallback to original list
            setRows(list);
          }
        } else {
          setRows(list);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.response?.data?.message || err.message || 'Failed to load birthdays');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, [token]);

  if (loading) return null;
  if (error) return null;
  if (!rows || rows.length === 0) return null;

  // Optionally exclude the current logged-in user's birthday from the list
  const filtered = excludeCurrentUser && user
    ? rows.filter((r) => {
        const rid = r.id ?? r.employee_id ?? r.employeeId ?? r.employee_id;
        try {
          return String(rid) !== String(user.id);
        } catch (e) {
          return true;
        }
      })
    : rows;

  if (!filtered || filtered.length === 0) return null;

  const visible = filtered.slice(0, maxVisible);
  const more = filtered.length - visible.length;

  return (
    <div className="bg-white rounded-lg shadow border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Today's Birthdays</h3>
        <span className="text-sm text-gray-400">{filtered.length} total</span>
      </div>
      <ul className="space-y-2">
        {visible.map((r) => {
          const name = r.employee_name || r.name || `#${r.id ?? r.employee_id}`;
          const teams = r.teams || r.team || r.project || r.main_project || r.department || '';
          const teamStr = Array.isArray(teams) ? teams.join(', ') : teams;
          return (
            <li key={r.id ?? r.employee_id} className="flex items-start gap-3">
              <div className="text-sm">🎂</div>
              <div>
                <div className="text-sm font-medium text-gray-800">{name}</div>
                {teamStr ? <div className="text-xs text-gray-500 mt-0.5">{teamStr}</div> : null}
              </div>
            </li>
          );
        })}
        {more > 0 && (
          <li className="text-sm text-gray-500">and {more} more...</li>
        )}
      </ul>
    </div>
  );
}
