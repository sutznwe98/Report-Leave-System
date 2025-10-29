const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });
const cors = require("cors");
const bcrypt = require("bcryptjs");
const db = require("./db");
const multer = require("multer");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

// Enable CORS
app.use(cors());

// Auth disabled: no JWT middleware; endpoints are public.

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, Date.now() + "-" + base + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("medical_certificate");

// Serve static uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

app.use(express.json());

// LOGIN ROUTE (no JWT)
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.query("SELECT * FROM employees WHERE email = ?", [email]);
    if (!users.length)
      return res.status(401).json({ message: "Invalid credentials." });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials." });

    delete user.password;
    res.json({ user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// GET ALL EMPLOYEES (Admin)
// app.get(
//   "/api/employees",
//   authenticateToken,
//   authorizeRole("admin"),
//   async (req, res) => {
//     try {
//       const [rows] = await db.query(
//         "SELECT id, name, email, role, position, team FROM employees"
//       );
//       res.json(rows);
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ message: "Error fetching employees." });
//     }
//   }
// );

app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, position, team FROM employees'
    );

    const withTeams = rows.map((e) => ({
      ...e,
      teams:
        typeof e.team === 'string' && e.team.trim()
          ? e.team.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
    }));

    res.json(withTeams);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ message: 'Server error fetching employees.' });
  }
});

// Public: create a new employee (no auth)
app.post('/api/employees', async (req, res) => {
  const { name, email, password, role = 'employee', position, teams } = req.body;

  try {
    // Email duplication check
    const [existing] = await db.query('SELECT id FROM employees WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Error: An employee with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teamString = Array.isArray(teams) ? teams.join(',') : (typeof teams === 'string' ? teams : null);

    const [result] = await db.query(
      'INSERT INTO employees (name, email, password, role, position, team) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, position, teamString]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      email,
      role,
      position,
      teams: Array.isArray(teams) ? teams : (typeof teams === 'string' && teams ? teams.split(',').map(t=>t.trim()).filter(Boolean) : []),
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: "Database table 'employees' not found." });
    }
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ message: "A field like 'position' or 'team' is missing from your 'employees' table." });
    }
    res.status(500).json({ message: 'Error creating employee.' });
  }
});

// Get employee stats (public) via query ?id=
app.get("/employee/me", async (req, res) => {
  try {
    const userId = parseInt(req.query.id, 10);
    if (!userId) return res.json([]);
    const [stats] = await db.query(
      "SELECT * FROM employee_stats WHERE employee_id = ?",
      [userId]
    );

    res.json(stats);
  } catch (error) {
    console.error("Error fetching employee stats:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET TODAY'S REPORT FOR EMPLOYEE
app.get(
  "/api/reports/employee/:id/today",
  async (req, res) => {
    const { id } = req.params;
    const today = new Date().toISOString().split("T")[0];

    try {
      const [rows] = await db.query(
        "SELECT * FROM reports WHERE employee_id = ? AND DATE(created_at) = ?",
        [id, today]
      );
      if (!rows.length)
        return res.status(404).json({ message: "No report found for today." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error." });
    }
  }
);

// CREATE REPORT (public) — accepts both new and legacy keys and supports extra columns
app.post("/api/reports", async (req, res) => {
  // Accept both new and legacy payload shapes
  const employee_id = req.body.employee_id ?? req.body.user_id ?? req.body.employeeId;
  const reportText = req.body.reportText ?? req.body.report_text;
  const status = req.body.status ?? req.body.compliance_status;

  if (!employee_id || !reportText || !status) {
    return res.status(200).json({ message: "Skipped: insufficient data." });
  }

  try {
    // First try inserting with submission_time and report_date for schemas that require them
    const sqlFull =
      "INSERT INTO reports (employee_id, report_text, compliance_status, submission_time, report_date, created_at) VALUES (?, ?, ?, NOW(), CURDATE(), NOW())";
    try {
      const [result] = await db.query(sqlFull, [employee_id, reportText, status]);
      return res.status(201).json({ message: "Report submitted", reportId: result.insertId });
    } catch (errFull) {
      // If columns don't exist, fall back to minimal insert
      if (errFull && (errFull.code === 'ER_BAD_FIELD_ERROR' || errFull.code === 'ER_NO_SUCH_FIELD')) {
        const sqlMinimal =
          "INSERT INTO reports (employee_id, report_text, compliance_status, created_at) VALUES (?, ?, ?, NOW())";
        const [result] = await db.query(sqlMinimal, [employee_id, reportText, status]);
        return res.status(201).json({ message: "Report submitted", reportId: result.insertId });
      }
      console.error('Full insert failed:', errFull);
      return res.status(500).json({ message: "Database error." });
    }
  } catch (err) {
    console.error('Report create error:', err);
    res.status(500).json({ message: "Database error." });
  }
});

// GET ALL REPORTS (public)
app.get(
  "/api/reports",
  async (req, res) => {
    try {
      const [rows] = await db.query(
        "SELECT * FROM reports ORDER BY created_at DESC"
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error fetching reports." });
    }
  }
);

// GET EMPLOYEE'S OWN REPORTS WITH FILTERING (public) expects ?id=
app.get("/api/reports/employee/me", async (req, res) => {
  const userId = parseInt(req.query.id, 10);
  const { fromDate, toDate, status } = req.query;
  if (!userId) return res.json([]);

  try {
    let query = "SELECT * FROM reports WHERE employee_id = ?";
    const params = [userId];

    // Add date filtering if provided
    if (fromDate) {
      query += " AND DATE(created_at) >= ?";
      params.push(fromDate);
    }
    if (toDate) {
      query += " AND DATE(created_at) <= ?";
      params.push(toDate);
    }

    // Add status filtering if provided
    if (status) {
      query += " AND compliance_status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching employee reports:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// --- [START] NEW ROUTES FOR EMPLOYEE DASHBOARD ---

// GET EMPLOYEE PERSONAL STATS (LEAVE, ETC.)
app.get("/api/stats/employee/:id", async (req, res) => {
  const userId = req.params.id;
  

  try {
    // First check if the annual leave columns exist
    const [columns] = await db.query(
      "SHOW COLUMNS FROM employees LIKE '%annual_leave%'"
    );
    
    if (columns.length > 0) {
      // Columns exist, query them
      const [rows] = await db.query(
        "SELECT total_annual_leave AS totalAL, remaining_annual_leave AS remainingAL FROM employees WHERE id = ?",
        [userId]
      );
      if (!rows.length) {
        return res.status(404).json({ message: "Employee stats not found." });
      }
      res.json(rows[0]);
    } else {
      // Columns don't exist, create them with default values and return
      try {
        await db.query("ALTER TABLE employees ADD COLUMN total_annual_leave INT DEFAULT 6");
        await db.query("ALTER TABLE employees ADD COLUMN remaining_annual_leave INT DEFAULT 6");
        
        // Update the current employee with default values
        await db.query(
          "UPDATE employees SET total_annual_leave = 6, remaining_annual_leave = 6 WHERE id = ?",
          [userId]
        );
        
        console.log("Created annual leave columns and set default values for employee", userId);
        
        res.json({
          totalAL: 6,
          remainingAL: 6
        });
      } catch (alterError) {
        console.error("Error creating annual leave columns:", alterError);
        res.json({
          totalAL: 6,
          remainingAL: 6
        });
      }
    }
  } catch (err) {
    console.error("Error fetching employee stats:", err);
    // If there's an error, return default values instead of failing
    res.json({
      totalAL: 6,
      remainingAL: 6
    });
  }
});

// GET EMPLOYEE PERSONAL REPORT STATS
app.get(
  "/api/stats/employee/:id/reports",
  async (req, res) => {
    const userId = req.params.id;

    try {
      const [rows] = await db.query(
        "SELECT compliance_status, COUNT(*) as count FROM reports WHERE employee_id = ? GROUP BY compliance_status",
        [userId]
      );

      const stats = {
        total_reports: 0,
        on_time_count: 0,
        late_count: 0,
        ful_count: 0,
      };

      let total = 0;
      rows.forEach((row) => {
        total += row.count;
        switch (row.compliance_status) {
          case "OnTime":
            stats.on_time_count = row.count;
            break;
          case "Late":
            stats.late_count = row.count;
            break;
          case "HUL":
            stats.ful_count = row.count;
            break;
          default:
            break;
        }
      });

      stats.total_reports = total;
      res.json(stats);
    } catch (err) {
      console.error("Error fetching employee report stats:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);

// Employee's own leaves (public): supports query ?id=
app.get('/api/leaves/employee/me', async (req, res) => {
  try {
    const userId = parseInt(req.query.id, 10);
    if (!userId) return res.json([]);
    const query = `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.reason, l.status, l.created_at, l.medical_certificate_url, e.name as employee_name FROM leaves AS l LEFT JOIN employees AS e ON l.employee_id = e.id WHERE l.employee_id = ? ORDER BY l.created_at DESC`;
    const [leaves] = await db.query(query, [userId]);
    res.json(leaves);
  } catch (error) {
// CREATE LEAVE REQUEST (public)
app.post("/api/leaves", upload, async (req, res) => {
  const employee_id = req.body.employee_id;
  const { leave_type, start_date, end_date, reason } = req.body;
  if (!employee_id) return res.status(200).json({ message: "Skipped: missing employee_id." });

  const VALID_LEAVE_TYPES = ["AL", "ML", "UPL", "HML", "HEL"];
  if (!VALID_LEAVE_TYPES.includes(leave_type))
    return res
      .status(400)
      .json({ message: `Invalid leave type: ${leave_type}` });

  let medical_certificate_url = null;
  if (req.file) {
    const reqHost = req.get && req.get('host') ? req.get('host') : `localhost:${PORT}`;
    medical_certificate_url = `http://${reqHost}/uploads/${req.file.filename}`;
  }

  let effective_leave_type = leave_type;

  try {
    if (effective_leave_type === "AL") {
      const now = new Date();
      const start = new Date(start_date);
      const end = new Date(end_date);
      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const requestedDays = Math.floor((end - start) / MS_PER_DAY) + 1;

      const minStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      if (isNaN(start) || isNaN(end) || start > end) {
        effective_leave_type = "UPL";
      }
      if (effective_leave_type === "AL" && start < minStart) {
        effective_leave_type = "UPL";
      }

      if (effective_leave_type === "AL") {
        let cursor = new Date(start);
        let violation = false;
        while (cursor <= end) {
          const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
          const segmentEnd = end < monthEnd ? end : monthEnd;
          const segDays = Math.floor((segmentEnd - cursor) / MS_PER_DAY) + 1;
          if (segDays > 2) {
            violation = true;
            break;
          }
          cursor = new Date(segmentEnd.getFullYear(), segmentEnd.getMonth(), segmentEnd.getDate() + 1);
        }
        if (violation) effective_leave_type = "UPL";
      }

      if (effective_leave_type === "AL") {
        const yearStart = new Date(start.getFullYear(), 0, 1);
        const yearEnd = new Date(start.getFullYear(), 11, 31);
        const [approvedAL] = await db.query(
          "SELECT start_date, end_date FROM leaves WHERE employee_id = ? AND leave_type = 'AL' AND status = 'Approved' AND start_date >= ? AND end_date <= ?",
          [employee_id, yearStart, yearEnd]
        );
        let used = 0;
        for (const l of approvedAL) {
          const s = new Date(l.start_date);
          const e = new Date(l.end_date);
          used += Math.floor((e - s) / MS_PER_DAY) + 1;
        }
        if (used + requestedDays > 6) {
          effective_leave_type = "UPL";
        }
      }
    }

    try {
      const [result] = await db.query(
        "INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status, medical_certificate_url) VALUES (?, ?, ?, ?, ?, 'Pending', ?)",
        [
          employee_id,
          effective_leave_type,
          start_date,
          end_date,
          reason,
          medical_certificate_url,
        ]
      );

      res.status(201).json({
        message: "Leave request submitted successfully.",
        id: result.insertId,
        effective_leave_type,
      });
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_FIELD') {
        try {
          const [result] = await db.query(
            "INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, 'Pending')",
            [
              employee_id,
              effective_leave_type,
              start_date,
              end_date,
              reason,
            ]
          );

          res.status(201).json({
            message: "Leave request submitted successfully.",
            id: result.insertId,
            effective_leave_type,
          });
        } catch (err) {
          console.error("Error creating leave:", err);
          res.status(500).json({ message: "Failed to create leave. Please try again." });
        }
      } else {
        console.error("Error creating leave:", err);
        res.status(500).json({ message: "Failed to create leave. Please try again." });
      }
    }
  } catch (err) {
    console.error("Leave creation error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// FETCH LEAVES (All)
app.get(
  "/api/leaves",
  async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT l.*, e.name AS employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id ORDER BY l.created_at DESC`
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error fetching leaves." });
    }
  }
);

// Single leave by ID (public)
app.get(
  "/api/leaves/:id",
  async (req, res) => {
    const { id } = req.params;
    try {
      const query = `
      SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.reason,
             l.status, l.created_at, l.medical_certificate_url, e.name as employee_name
      FROM leaves AS l
      LEFT JOIN employees AS e ON l.employee_id = e.id
      WHERE l.id = ?
    `;
      const [leave] = await db.query(query, [id]);
      if (leave.length === 0) {
        return res.status(404).json({ message: "Leave not found." });
      }
      res.json(leave[0]);
    } catch (error) {
      console.error(`Error fetching leave ID ${id}:`, error);
      res.status(500).json({ message: "Server error fetching leave details." });
    }
  }
);

// UPDATE LEAVE STATUS
app.put(
  "/api/leaves/:id",
  async (req, res) => {
    const { id } = req.params;
    const { status, leave_type } = req.body;

    const VALID_LEAVE_TYPES = ["AL", "ML", "UPL", "HML", "HEL"];
    if (leave_type && !VALID_LEAVE_TYPES.includes(leave_type))
      return res
        .status(400)
        .json({ message: `Invalid leave type: ${leave_type}` });

    let updateFields = [];
    let params = [];

    if (status) {
      updateFields.push("status = ?");
      params.push(status);
    }

    if (leave_type) {
      updateFields.push("leave_type = ?");
      params.push(leave_type);
    }

    if (!updateFields.length)
      return res.status(400).json({ message: "No fields to update." });

    const sql = `UPDATE leaves SET ${updateFields.join(", ")} WHERE id = ?`;
    params.push(id);

    try {
      // First, get the leave details to check if it's an annual leave being approved
      const [leaveDetails] = await db.query(
        `SELECT l.*, e.name AS employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
        [id]
      );

      if (!leaveDetails.length)
        return res.status(404).json({ message: "Leave not found." });

      const leave = leaveDetails[0];

      // Update the leave status/type
      const [result] = await db.query(sql, params);
      if (!result.affectedRows)
        return res.status(404).json({ message: "Leave not found." });

      // If status is being changed to "Approved" and leave_type is "AL" (Annual Leave)
      if (status === "Approved" && (leave.leave_type === "AL" || leave_type === "AL")) {
        try {
          // Calculate the number of days for the leave
          const startDate = new Date(leave.start_date);
          const endDate = new Date(leave.end_date);
          const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

          // Check if annual leave columns exist, if not create them
          const [columns] = await db.query(
            "SHOW COLUMNS FROM employees LIKE '%annual_leave%'"
          );

          if (columns.length === 0) {
            // Add annual leave columns if they don't exist
            await db.query("ALTER TABLE employees ADD COLUMN total_annual_leave INT DEFAULT 6");
            await db.query("ALTER TABLE employees ADD COLUMN remaining_annual_leave INT DEFAULT 6");
            console.log("Added annual leave columns to employees table");
          }

          // Get current remaining annual leave
          const [employeeData] = await db.query(
            "SELECT remaining_annual_leave FROM employees WHERE id = ?",
            [leave.employee_id]
          );

          if (employeeData.length > 0) {
            const currentRemaining = employeeData[0].remaining_annual_leave || 6;
            const newRemaining = Math.max(0, currentRemaining - daysDiff);

            // Update the remaining annual leave
            await db.query(
              "UPDATE employees SET remaining_annual_leave = ? WHERE id = ?",
              [newRemaining, leave.employee_id]
            );

            console.log(`Deducted ${daysDiff} days from employee ${leave.employee_id}. Remaining: ${newRemaining}`);
          }
        } catch (deductionError) {
          console.error("Error deducting annual leave:", deductionError);
          // Don't fail the entire request if deduction fails
        }
      }

      // Get the updated leave details
      const [updated] = await db.query(
        `SELECT l.*, e.name AS employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
        [id]
      );

      res.json(updated[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error updating leave." });
    }
  }
);

// --- START SERVER ---
app.listen(PORT, HOST, () =>
  console.log(`✅ Server running at http://${HOST}:${PORT}`)
);
