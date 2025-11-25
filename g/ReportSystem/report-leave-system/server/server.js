
// ... existing code
  }
});


// GET leave requests for PJ Leads (CORRECTED LOGIC)
app.get("/api/leaves/pj-lead", authenticateToken, async (req, res) => {
  try {
    const pjLeadId = req.user.id;

    // 1. Verify user is a PJ Lead and get their project ID
    const [pjRows] = await db.query(
      "SELECT main_pj_id FROM employees WHERE id = ? AND LOWER(role) = 'pj lead'",
      [pjLeadId]
    );

    if (pjRows.length === 0) {
      return res.json([]); // Not a PJ lead
    }

    const mainPJId = pjRows[0].main_pj_id;
    if (!mainPJId) {
      return res.json([]); // PJ Lead has no project assigned
    }

    // 2. Fetch leaves with 'Pending' status from employees in the same project
    const [leaves] = await db.query(
      `SELECT l.*, e.employee_name
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       WHERE e.main_pj_id = ? 
         AND l.employee_id != ? 
         AND l.status = 'Pending'`, // Use 'status' column
      [mainPJId, pjLeadId]
    );

    res.json(leaves);
  } catch (err) {
    console.error("Failed to fetch PJ lead leaves:", err);
    res.status(500).json({ message: "Failed to fetch leave requests." });
  }
});


// APPROVE/REJECT LEAVE BY PJ LEAD (CORRECTED LOGIC)
app.patch("/api/leaves/pj/:id", authenticateToken, async (req, res) => {
  try {
    const pjLeadId = req.user.id;
    const pjLeadName = req.user.name;
    const leaveId = req.params.id;
    const { action } = req.body; // "Approved" or "Rejected"

    if (!["Approved", "Rejected"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    // Get the leave request with employee details
    const [leaveRows] = await db.query(`
      SELECT l.*, e.main_pj_id 
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      WHERE l.id = ?
    `, [leaveId]);

    if (leaveRows.length === 0) {
      return res.status(404).json({ message: "Leave not found" });
    }

    const leave = leaveRows[0];

    // Check if the current user is the PJ Lead of the employee
    if (leave.main_pj_id !== pjLeadId) {
      return res.status(403).json({ 
        message: "Not authorized to approve this leave",
        details: "You can only approve leaves for employees who report to you"
      });
    }

    // Check if the leave is in a valid state for approval
    if (leave.status !== "Pending") {
      return res.status(400).json({ 
        message: "Invalid leave status",
        details: `Leave is already ${leave.status}`
      });
    }

    // Determine the new status based on the action
    const newStatus = action === "Approved" ? "Pending Admin Approval" : "Rejected by PJ Lead";

    // Update leave with PJ Lead's decision
    await db.query(`
      UPDATE leaves 
      SET 
        status = ?,
        approved_by_pj_lead = ?,
        pj_approval_date = NOW()
      WHERE id = ?
    `, [newStatus, pjLeadId, leaveId]);

    res.json({ 
      message: `Leave ${action.toLowerCase()} successfully.`,
      status: newStatus
    });
  } catch (err) {
    console.error("Error in PJ lead approval:", err);
    res.status(500).json({ 
      message: "Failed to update leave status",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});
