const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db"); // Assuming this is your MySQL connection/pool wrapper
const multer = require("multer");
const fs = require("fs");
const router = express.Router();
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error(
    "FATAL ERROR: JWT_SECRET is not defined. Please check your .env file."
  );
  process.exit(1);
}

// Relaxing CORS settings to allow any origin (for dev/debugging)
app.use(cors());

// Health Check Route
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    port: PORT,
    host: HOST,
  });
});

// --- JWT Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]; // Format: "Bearer TOKEN"
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) {
    return res.status(401).json({ message: "Authentication token required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // If the token is invalid or expired
      return res.status(403).json({ message: "Token is invalid or expired." });
    } // Attach the decoded user payload (id, role) to the request object
    req.user = user;
    next();
  });
};

// Middleware to authorize specific roles (optional but good for security)
const authorizeRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({
        message:
          "Forbidden: You do not have permission to access this resource.",
      });
    }
    next();
  };
};

// --- MULTER SETUP (Temporary file storage) ---

// **CRITICAL FIX 1: Use an absolute path for the uploads directory**
// This ensures the path is correctly resolved from the project root.
const UPLOADS_DIR = path.join(__dirname, "uploads");

// CRITICAL FIX: Ensure the uploads directory exists synchronously before starting the server
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`Created uploads directory at: ${UPLOADS_DIR}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use the defined UPLOADS_DIR constant (Absolute Path)
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Create a unique filename with the original extension
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext); // Date.now() + OriginalFileNameWithoutExtension + OriginalExtension
    cb(null, Date.now() + "-" + baseName + ext);
  },
});
// Multer instance configured to handle a single file named 'medical_certificate'
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single("medical_certificate");
// --- END MULTER SETUP ---

// --- CRITICAL FIX 2: STATIC FILE SERVER ---
// This tells Express to serve files inside the 'uploads' directory
// when requested via the '/uploads' URL prefix.
app.use("/uploads", express.static(UPLOADS_DIR));
console.log(`Static file route added for: /uploads`);
// --- END STATIC FILE SERVER ---

// Helper function to determine compliance status based on time
const determineComplianceStatus = (submissionTime) => {
  if (!(submissionTime instanceof Date)) return "FUL"; // fallback

  const hours = submissionTime.getHours();
  const minutes = submissionTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const ON_TIME_CUTOFF = 9 * 60 + 30; // 9:30 AM
  const LATE_FINE_CUTOFF = 10 * 60; // 10:00 AM
  const HUL_CUTOFF = 12 * 60 + 30; // 12:30 PM

  if (timeInMinutes <= ON_TIME_CUTOFF) {
    return "OnTime";
  } else if (timeInMinutes <= LATE_FINE_CUTOFF) {
    return "Late Fine";
  } else if (timeInMinutes <= HUL_CUTOFF) {
    return "HUL";
  } else {
    return "FUL";
  }
};

// Data Helper Function: Transforms employee team string into an array
const transformEmployeeTeams = (employee) => {
  if (typeof employee.team === "string" && employee.team.trim().length > 0) {
    employee.teams = employee.team
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  } else {
    employee.teams = [];
  }
  delete employee.team;
  return employee;
};

// --- ENHANCED ADMIN CREATION FOR DEBUGGING ---
const createDefaultAdmin = async () => {
  const adminEmail = "admin@system.com";
  console.log("Attempting to check/create default admin account...");
  try {
    // 1. Check for existing admin
    const [existingUsers] = await db.query(
      "SELECT * FROM employees WHERE email = ?",
      [adminEmail]
    );
    if (existingUsers.length === 0) {
      const adminName = "Super Admin";
      const adminPassword = "Admin@12345";
      const adminRole = "admin";
      console.log(
        "Default admin account not found. Proceeding with creation..."
      ); // 2. Hash password and insert
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const [result] = await db.query(
        "INSERT INTO employees (name, email, password, role, position, team) VALUES (?, ?, ?, ?, ?, ?)",
        [
          adminName,
          adminEmail,
          hashedPassword,
          adminRole,
          "Administrator",
          "Management",
        ]
      ); // 3. Log success
      console.log(
        `Default admin account created successfully with ID: ${result.insertId}`
      );
      console.log(
        `Use email: ${adminEmail} and password: ${adminPassword} to login.`
      );
    } else {
      console.log(
        "Default admin account already exists (ID: " +
          existingUsers[0].id +
          ")."
      );
    }
  } catch (error) {
    // 4. Log detailed database error
    console.error(
      "FATAL: Error during default admin creation. This usually means the database is inaccessible or the 'employees' table is missing/malformed:",
      error.message
    );
    console.error("Detailed Error:", error);
  }
};
// --- END ENHANCED ADMIN CREATION FOR DEBUGGING ---

// Middleware for JSON parsing - Apply globally AFTER Multer setup, but before routes
app.use(express.json());

// --- AUTHENTICATION ---
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.query("SELECT * FROM employees WHERE email = ?", [
      email,
    ]);
    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    } // Set expiry to 24h for development simplicity
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "24h",
    }); // Remove password and transform teams before returning user object
    const safeUser = transformEmployeeTeams({ ...user });
    delete safeUser.password;
    res.json({ token, user: safeUser });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login." });
  }
});

// --- EMPLOYEES ---
// Requires authentication to view employee list
app.get("/api/employees", authenticateToken, async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT * FROM employees WHERE LOWER(role) = 'employee'"
    );
    const employeesWithTeamsArray = users.map(transformEmployeeTeams);

    res.json(employeesWithTeamsArray);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      message:
        "Server error fetching employees. Please check table/column names.",
    });
  }
});

app.get("/employee/:id/today", async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [report] = await db.query(
      "SELECT * FROM reports WHERE employee_id = ? AND report_date = ?",
      [id, today]
    );

    if (!report || report.length === 0) {
      return res.status(404).json({ message: "No report found for today" });
    }

    res.json({ report: report[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin-only route for creating new employees
app.post(
  "/api/employees",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    const {
      name,
      email,
      password,
      role = "employee",
      position,
      teams,
    } = req.body; // Convert the 'teams' array back into a comma-separated string for DB storage
    const teamString = Array.isArray(teams) ? teams.join(",") : null;

    try {
      // Email Duplication Check
      const [existingUsers] = await db.query(
        "SELECT id FROM employees WHERE email = ?",
        [email]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          message: "Error: An employee with this email already exists.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        "INSERT INTO employees (name, email, password, role, position, team) VALUES (?, ?, ?, ?, ?, ?)",
        [name, email, hashedPassword, role, position, teamString]
      );
      res.status(201).json({
        id: result.insertId,
        name,
        email,
        role,
        position,
        teams: Array.isArray(teams) ? teams : [],
      });
    } catch (error) {
      console.error("Error creating employee:", error);
      if (error.code === "ER_NO_SUCH_TABLE") {
        return res
          .status(500)
          .json({ message: "Database table 'employees' not found." });
      }
      if (error.code === "ER_BAD_FIELD_ERROR") {
        return res.status(500).json({
          message:
            "A field like 'position' or 'team' is missing from your 'employees' database table.",
        });
      }
      res.status(500).json({ message: "Error creating employee." });
    }
  }
);

// Route to update an existing employee (requires admin or self-update)
app.put("/api/employees/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; // Authorization check: Only admin or the employee themselves can update the record
  if (req.user.role !== "admin" && req.user.id !== parseInt(id)) {
    return res
      .status(403)
      .json({ message: "Forbidden: You cannot update other users' records." });
  }

  const { name, email, password, position, teams } = req.body;

  try {
    let updateFields = [];
    let queryParams = []; // Convert the 'teams' array into a comma-separated string for DB storage
    const teamString = Array.isArray(teams) ? teams.join(",") : null;
    if (name) {
      updateFields.push("name = ?");
      queryParams.push(name);
    }
    if (email) {
      // Check for email uniqueness before update if email is being changed
      if (email) {
        const [existingUsers] = await db.query(
          "SELECT id FROM employees WHERE email = ? AND id != ?",
          [email, id]
        );
        if (existingUsers.length > 0) {
          return res.status(409).json({
            message: "Error: Another employee with this email already exists.",
          });
        }
      }
      updateFields.push("email = ?");
      queryParams.push(email);
    }
    if (position) {
      updateFields.push("position = ?");
      queryParams.push(position);
    } // Update the 'team' field using the converted string
    if (teamString !== null) {
      updateFields.push("team = ?");
      queryParams.push(teamString);
    }

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push("password = ?");
      queryParams.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res
        .status(400)
        .json({ message: "No fields provided for update." });
    }

    const updateQuery = `UPDATE employees SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    queryParams.push(id);

    const [result] = await db.query(updateQuery, queryParams);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Employee not found or no change in data." });
    } // Fetch the updated employee record (excluding password)
    const [updatedUser] = await db.query(
      "SELECT id, name, email, role, position, team FROM employees WHERE id = ?",
      [id]
    );
    if (updatedUser.length === 0) {
      return res
        .status(404)
        .json({ message: "Employee updated but could not be retrieved." });
    }

    const transformedUser = transformEmployeeTeams(updatedUser[0]);
    res.json(transformedUser);
  } catch (error) {
    console.error(`Error updating employee ${id}:`, error);
    res.status(500).json({ message: "Server error during employee update." });
  }
});

// Admin-only route to delete an employee
app.delete(
  "/api/employees/:id",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    const { id } = req.params;

    try {
      // Delete associated records first for integrity
      await db.query("DELETE FROM leaves WHERE employee_id = ?", [id]);
      await db.query("DELETE FROM reports WHERE employee_id = ?", [id]);

      const [result] = await db.query("DELETE FROM employees WHERE id = ?", [
        id,
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Employee not found." });
      }

      res
        .status(200)
        .json({ message: `Employee with ID ${id} deleted successfully.` });
    } catch (error) {
      console.error(`Error deleting employee ${id}:`, error);
      res
        .status(500)
        .json({ message: "Server error during employee deletion." });
    }
  }
);

// --- REPORTS ---

// Get a specific employee's reports (by ID) with optional filters
router.get('/api/reports/employee/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status } = req.query;
    
    let query = 'SELECT id, report_text, compliance_status, created_at FROM reports WHERE employee_id = ?';
    const params = [id];

    if (date) {
      query += ' AND DATE(created_at) = ?';
      params.push(date);
    }

    if (status) {
      query += ' AND compliance_status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const [reports] = await db.query(query, params);
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Route to fetch the list of reports for the logged-in user (history view)
router.get('/api/reports/employee/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [reports] = await db.query(
      'SELECT id, report_text, compliance_status, created_at FROM reports WHERE employee_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// Route for submitting a report (uses logged-in user's ID)
app.post("/api/reports", authenticateToken, async (req, res) => {
  const employee_id = req.user.id; // Use ID from token, not body
  const { report_text, submission_time, report_date } = req.body;

  if (!report_text || !submission_time || !report_date) {
    return res.status(400).json({ message: "Missing required report fields." });
  }

  try {
    // Check for duplicate report submission for the same date
    const [existingReports] = await db.query(
      //       "SELECT id FROM reports WHERE employee_id = ? AND report_date = ?",
      //       [employee_id, report_date]
      "SELECT * FROM reports WHERE employee_id = ? AND report_date = ?",
      // [req.body.employee_id, req.body.report_date]
      [employee_id, report_date]
    );

    if (existingReports.length > 0) {
      return res.status(409).json({
        message:
          "Duplicate report detected. You have already submitted a report for this date.",
      });
    } // CALCULATE the actual compliance status based on the submission time
    const submittedDateTime = new Date(submission_time);
    const calculated_compliance_status =
      determineComplianceStatus(submittedDateTime);
    const [result] = await db.query(
      "INSERT INTO reports (employee_id, report_text, submission_time, report_date, compliance_status) VALUES (?, ?, ?, ?, ?)",
      [
        employee_id,
        report_text,
        submission_time,
        report_date,
        calculated_compliance_status,
      ]
    );

    return res.status(201).json({
      message: "Report submitted successfully.",
      id: result.insertId,
      compliance_status: calculated_compliance_status,
    });
  } catch (error) {
    const detailedError = `Database insertion failed. MySQL Code: ${error.code}. SQL Message: ${error.sqlMessage}.`;

    console.error("Error submitting report:", {
      message: error.message,
      code: error.code,
      sql: error.sql,
    });
    return res.status(500).json({
      message: `Server error submitting report: ${detailedError}`,
      detail: error.message,
    });
  }
});

// Admin-only route to fetch all reports
app.get(
  "/api/reports",
  async (req, res) => {
    try {
      const query =
        `SELECT r.id, r.employee_id, r.report_text, r.submission_time, r.report_date, r.compliance_status, r.created_at, e.name as employee_name FROM reports AS r LEFT JOIN employees AS e ON r.employee_id = e.id ORDER BY r.submission_time DESC`.trim();
      const [reports] = await db.query(query);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Error fetching reports." });
    }
  }
);

// --- EMPLOYEE STATS ---

// 1. Get Report Statistics (Compliance Counts: OnTime, Late, FUL) for logged-in user
app.get(
  "/api/stats/employee/me/reports",
  authenticateToken,
  async (req, res) => {
    const id = req.user.id; // Use logged-in user's ID
    try {
      const query = `
      SELECT compliance_status, COUNT(id) AS count
      FROM reports
      WHERE employee_id = ?
      GROUP BY compliance_status
    `;
      const [results] = await db.query(query, [id]);

      const stats = {
        on_time_count: 0,
        late_count: 0,
        ful_count: 0,
      };

      let total_reports = 0;

      results.forEach((row) => {
        total_reports += row.count;
        switch (row.compliance_status) {
          case "OnTime":
            stats.on_time_count = row.count;
            break;
          case "Late Fine":
          case "Late":
            stats.late_count = row.count;
            break;
          case "FUL":
            stats.ful_count = row.count;
            break;
          default:
            break;
        }
      });

      res.json({ ...stats, total_reports });
    } catch (error) {
      console.error(`Error fetching report stats for employee ${id}:`, error);
      res
        .status(500)
        .json({ message: "Server error fetching report statistics." });
    }
  }
);

// Get logged-in employee dashboard stats
router.get('/api/stats/employee/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query('SELECT totalAL, remainingAL FROM employees WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Get Leave Statistics (Remaining Annual Leave Count) for logged-in user
app.get(
  "/api/stats/employee/me/leaves",
  authenticateToken,
  async (req, res) => {
    const id = req.user.id; // Logged-in user's ID
    const TOTAL_ANNUAL_LEAVE = 6; // Base AL quota

    try {
      const query = `
SELECT leave_type, start_date, end_date, status
FROM leaves
WHERE employee_id = ? AND status = 'Approved'
`;
      const [leaves] = await db.query(query, [id]);

      let totalDays = 0;

      for (const leave of leaves) {
        if (leave.leave_type === "HML" || leave.leave_type === "HEL") {
          totalDays += 0.5; // Half-day leave adds 0.5
        } else if (leave.leave_type === "AL") {
          const start = new Date(leave.start_date);
          const end = new Date(leave.end_date);
          const diffTime = end - start;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          totalDays += diffDays;
        }
      }

      const remaining_al = Math.max(0, TOTAL_ANNUAL_LEAVE - totalDays);

      res.json({
        remaining_al: remaining_al,
        total_al: TOTAL_ANNUAL_LEAVE,
        used_al: totalDays,
      });
    } catch (error) {
      console.error(`Error fetching leave stats for employee ${id}:`, error);
      res.status(500).json({ message: "Server error fetching leave stats." });
    }
  }
);
// --- LEAVES ---
// Fetch leaves for the logged-in employee (used by employee dashboard)
app.get("/api/leaves/employee/me", authenticateToken, async (req, res) => {
  const id = req.user.id; // Use logged-in user's ID
  try {
    const query = // CRITICAL FIX: Ensure all columns exist in the 'employees' table or this LEFT JOIN will cause a 500 error on the fetch
      `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.reason, l.status, l.created_at, l.medical_certificate_url, e.name as employee_name FROM leaves AS l LEFT JOIN employees AS e ON l.employee_id = e.id WHERE l.employee_id = ? ORDER BY l.created_at DESC`.trim();
    const [leaves] = await db.query(query, [id]);
    res.json(leaves);
  } catch (error) {
    console.error(`Error fetching leaves for employee ${id}:`, error); // Return a more informative error for debugging the client
    res.status(500).json({
      message:
        "Server error fetching employee leaves. Check DB connection/table schema.",
    });
  }
});

// Create a leave request (Uses logged-in user's ID securely)
app.post("/api/leaves", authenticateToken, upload, async (req, res) => {
  const employee_id = req.user.id;
  const { leave_type, start_date, end_date, reason } = req.body;
  let medical_certificate_url = null;

  // ✅ Leave type validation
  const VALID_LEAVE_TYPES = ["AL", "SL", "CL", "UPL", "HML", "HEL"];
  if (!VALID_LEAVE_TYPES.includes(leave_type)) {
    return res
      .status(400)
      .json({ message: `Invalid leave type: ${leave_type}` });
  }

  // Handle file upload
  if (req.file) {
    const filename = req.file.filename;
    medical_certificate_url = `http://${HOST}:${PORT}/uploads/${filename}`;
  }

  let missingFields = [];
  if (!leave_type) missingFields.push("leave_type");
  if (!start_date) missingFields.push("start_date");
  if (!end_date) missingFields.push("end_date");
  if (!reason) missingFields.push("reason");

  if (missingFields.length > 0) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({
      message: `Missing required fields: ${missingFields.join(", ")}.`,
    });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status, medical_certificate_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason,
        "Pending",
        medical_certificate_url,
      ]
    );

    const [newLeaveRecord] = await db.query(
      `SELECT l.*, e.name AS employee_name
       FROM leaves l
       LEFT JOIN employees e ON l.employee_id = e.id
       WHERE l.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: "Leave request submitted successfully.",
      leave: newLeaveRecord[0],
    });
  } catch (error) {
    console.error("Error submitting leave:", error);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ message: "Server error submitting leave request." });
  }
});

// Fetch all leaves (admin view)
app.get(
  "/api/leaves",
  async (req, res) => {
    try {
      const query =
        `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.reason, l.status, l.created_at, l.medical_certificate_url, e.name as employee_name FROM leaves AS l LEFT JOIN employees AS e ON l.employee_id = e.id ORDER BY l.created_at DESC`.trim();
      const [leaves] = await db.query(query);
      res.json(leaves);
    } catch (error) {
      console.error("Error fetching leaves:", error);
      res.status(500).json({ message: "Error fetching leaves." });
    }
  }
);

// Get single leave by ID (admin view)
app.get(
  "/api/leaves/:id",
  authenticateToken,
  authorizeRole("admin"),
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

// --- UNIFIED ROUTE: Update Leave Status and/or Leave Type ---
// This new route handles the update request from the frontend component
app.put(
  "/api/leaves/:id",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    const { id } = req.params;
    const { status, leave_type } = req.body;

    // ✅ Leave type validation
    const VALID_LEAVE_TYPES = ["AL", "SL", "CL", "UPL", "HML", "HEL"];
    if (leave_type && !VALID_LEAVE_TYPES.includes(leave_type)) {
      return res
        .status(400)
        .json({ message: `Invalid leave type: ${leave_type}` });
    }

    let updateFields = [];
    let queryParams = [];

    if (status) {
      updateFields.push("status = ?");
      queryParams.push(status);
    }

    if (leave_type) {
      updateFields.push("leave_type = ?");
      queryParams.push(leave_type);
    }

    if (updateFields.length === 0) {
      return res
        .status(400)
        .json({ message: "No fields provided for update." });
    }

    const updateQuery = `UPDATE leaves SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    queryParams.push(id);

    try {
      const [result] = await db.query(updateQuery, queryParams);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Leave request not found." });
      }

      const [updatedLeave] = await db.query(
        `SELECT l.*, e.name AS employee_name
       FROM leaves l
       LEFT JOIN employees e ON l.employee_id = e.id
       WHERE l.id = ?`,
        [id]
      );

      res.json(updatedLeave[0]);
    } catch (error) {
      console.error("Error updating leave:", error);
      res.status(500).json({ message: "Server error updating leave details." });
    }
  }
);

// Initialize and start the server
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`); // Attempt to create the default admin account on startup
  createDefaultAdmin();
});
