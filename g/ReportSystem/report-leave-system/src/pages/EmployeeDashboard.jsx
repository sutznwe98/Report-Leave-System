
// ... existing code
  useEffect(() => {
    fetchDashboard();
    fetchLeaves();
  }, [fetchDashboard, fetchLeaves]);

  const handleLeaveAction = async (leaveId, action) => {
    try {
      await axios.patch(
        `/api/leaves/pj/${leaveId}`,
        { action }, // action: "Approved" or "Rejected"
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh leaves to show updated status
      fetchLeaves();
    } catch (err) {
      console.error("Failed to update leave action", err);
      setError(
        err.response?.data?.message || "Failed to update leave status."
      );
    }
  };

  if (loading) {
// ... existing code
            <tbody className="font-semibold">
              {leaves
                .filter(() => true)
                .slice(0, 10)
                .map((l) => {
                  const start = l.start_date ? new Date(l.start_date) : null;
                  const end = l.end_date ? new Date(l.end_date) : null;
                  const days =
                    start && end
                      ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
                      : "-";

                  const isPendingForPjLead =
                    user.role === "pj lead" &&
                    l.pj_lead_status === "Pending" &&
                    l.employee_id !== userId;

                  return (
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="px-5 py-4">{l.employee_name || "—"}</td>
                      <td className="px-5 py-4">{formatYMD(l.start_date)}</td>
                      <td className="px-5 py-4">{formatYMD(l.end_date)}</td>
                      <td className="px-5 py-4">{days}</td>
                      <td className="px-5 py-4 max-w-xs truncate">
                        {l.reason || "—"}
                      </td>
                      <td className="px-5 py-4">{l.leave_type || "—"}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-1 text-xs font-bold rounded-full ${
                            l.status === "Approved"
                              ? "bg-green-100 text-green-700"
                              : l.status === "Rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {l.pj_lead_status && l.pj_lead_status !== "Pending"
                            ? `PJL: ${l.pj_lead_status}`
                            : l.status}
                        </span>
                      </td>
                      {user.role === "pj lead" && (
                        <td className="px-5 py-4">
                          {isPendingForPjLead ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleLeaveAction(l.id, "Approved")
                                }
                                className="p-1.5 text-green-600 hover:bg-green-100 rounded-full"
                                title="Approve"
                              >
                                <CheckCircle size={20} />
                              </button>
                              <button
                                onClick={() =>
                                  handleLeaveAction(l.id, "Rejected")
                                }
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-full"
                                title="Reject"
                              >
                                <XCircle size={20} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">
                              {l.employee_id === userId ? "Own" : "Done"}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
