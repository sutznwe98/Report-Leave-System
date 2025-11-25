import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://localhost:5000/api";

export default function WishesList() {
  const { user, token } = useAuth();
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [senderNames, setSenderNames] = useState({});

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const fetchWishes = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(`${API_URL}/notifications/wishes/${user.id}`, { headers });
        if (!mounted) return;
        // Server returns an array of rows
        const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
        setWishes(rows);

        // Fetch missing sender names (where created_by exists but no sender name provided)
        const missingIds = Array.from(new Set(rows
          .map(r => r.created_by)
          .filter(id => id && !rows.find(r => (r.created_by === id) && (r.created_by_name || r.sender_name)) && !senderNames[id])
        ));

        if (missingIds.length > 0) {
          try {
            const fetched = {};
            await Promise.all(missingIds.map(async (id) => {
              try {
                const empRes = await axios.get(`${API_URL}/employees/${id}`, { headers });
                const emp = empRes.data || {};
                fetched[id] = emp.employee_name || emp.name || `#${id}`;
              } catch (e) {
                fetched[id] = `#${id}`;
              }
            }));
            if (mounted) setSenderNames(prev => ({ ...prev, ...fetched }));
          } catch (e) {
            // ignore failures fetching names
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || "Failed to load wishes");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchWishes();
    return () => { mounted = false; };
  }, [user?.id, token]);

  if (loading) return <div className="p-4">Loading messages…</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!wishes || wishes.length === 0) return <div className="p-4 text-gray-500">No messages yet.</div>;

  return (
    <div className="bg-white rounded-lg shadow border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Messages for you</h3>
        <span className="text-sm text-gray-400">{wishes.length} total</span>
      </div>
      <ul className="space-y-3">
        {wishes.map((w) => (
          <li key={w.id} className="border rounded-md p-3">
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{w.message_template || w.message || w.message_template}</div>
            <div className="mt-2 text-xs text-gray-400 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {/* Occasion badge */}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${((w.occasion||'').toLowerCase() === 'anniversary') ? 'bg-yellow-100 text-yellow-800' : ((w.occasion||'').toLowerCase() === 'birthday') ? 'bg-pink-100 text-pink-800' : 'bg-indigo-100 text-indigo-700'}`}>
                  { (w.occasion || 'message') === 'anniversary' ? 'Anniversary' : (w.occasion || 'message') === 'birthday' ? 'Birthday' : 'Message' }
                </span>

                <span>
                  {(() => {
                    const explicitName = w.created_by_name || w.sender_name;
                    if (explicitName) return `From ${explicitName}`;
                    if (w.created_by && senderNames[w.created_by]) return `From ${senderNames[w.created_by]}`;
                    if (w.created_by) return `From #${w.created_by}`;
                    return '';
                  })()}
                </span>
              </div>
              <span>{new Date(w.created_at || w.createdAt || w.created).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
