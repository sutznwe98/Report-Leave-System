const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken"); // Import jsonwebtoken
const db = require("./db");
const multer = require("multer");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

// Use a secret from .env or a default. In production, always use .env!
const JWT_SECRET = process.env.JWT_SECRET || "your-default-super-secret-key";

// --- Admin Creation on Startup ---
const createDefaultAdmin = async () => {
  const adminEmail = "admin@system.com";
  console.log("Attempting to check/create default admin account...");

  try {
    // Check if the 'role' column exists before proceeding
    const [columns] = await db.query("SHOW COLUMNS FROM `employees` LIKE 'role'");
    if (columns.length === 0) {
      console.log("Skipping admin creation: 'role' column not found in 'employees' table.");
      return;
    }

    // Check for existing admin
    const [existingUsers] = await db.query(
      "SELECT id FROM employees WHERE email = ? AND role = 'admin'",
      [adminEmail]
    );

    if (existingUsers.length === 0) {
      console.log("Default admin account not found. Proceeding with creation...");
      const adminName = "Super Admin";
      const adminPassword = "Admin@12345"; // You should change this
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // Set default dates for the admin user
      const adminBirthDate = new Date('1990-01-01');
      const adminJoinDate = new Date();

      // Note: This assumes your 'employees' table has 'name', 'email', 'password', and 'role' columns.
      const [result] = await db.query(
        `INSERT INTO employees (
          TMD, employee_name, email, password, role, position, project, other_project, wfh_office, joined_date,
          marital_status, nrc_no, probation_period, after_probation, real_birth_date, birth_date_on_nrc,
          kbz_bank_account, bank, bank_acc,
          contact_no, parents_contact_no, current_address, address, contract_date, contract_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "TMD001", adminName, adminEmail, hashedPassword, "admin", "Administrator",
          'Internal', null, 'Office', adminJoinDate, 'N/A', 'N/A', 0, 0, // project, other_project, wfh_office, joined_date, marital_status, nrc_no, probation_period, after_probation
          adminBirthDate, null, 'N/A', 'N/A', 'N/A', // real_birth_date, birth_date_on_nrc, kbz_bank_account, bank, bank_acc
          'N/A', 'N/A', 'N/A', 'N/A', adminJoinDate, 'System' // contact_no, parents_contact_no, current_address, address, contract_date, contract_by
        ]
      );

      console.log(`Default admin account created successfully with ID: ${result.insertId}`);
      console.log(`Use email: ${adminEmail} and password: ${adminPassword} to login.`);
    } else {
      console.log("Default admin account already exists.");
    }
  } catch (error) {
    console.error("FATAL: Error during default admin creation. This might be due to a missing 'employees' table or required columns ('employee_name', 'email', 'password', 'role').");
    console.error("Detailed Error:", error.message);
  }
};

// Enable CORS
app.use(cors());

// Auth disabled: no JWT middleware; endpoints are public.
// --- JWT Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      // Token might be expired or invalid
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = user; // Add user payload to request object
    next(); // Proceed to the next middleware or route handler
  });
};


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

// Middleware to parse JSON bodies. This is crucial for POST and PUT requests.
app.use(express.json());

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.query("SELECT * FROM employees WHERE email = ?", [email]);
    if (!users.length)
      return res.status(401).json({ message: "Invalid credentials." });

    const user = users[0];
    // Handle cases where password might be null in the DB for some users
    if (!user.password) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials." });

    // Create JWT Token
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.employee_name },
      JWT_SECRET,
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    delete user.password;
    // Send back token and user info
    res.json({ token, user });
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
  const connection = await db.getConnection();
  try {
    // Join with projects to get the main project name directly
    const [employees] = await connection.query(`
      SELECT e.*, p.name as main_project_name 
      FROM employees e 
      LEFT JOIN projects p ON e.main_pj_id = p.id
    `);
    const [assignments] = await connection.query(`
      SELECT 
        epp.employee_id,
        epp.position_on_project,
        epp.is_main_project,
        p.id as project_id,
        p.name as project_name
      FROM employee_project_positions epp 
      JOIN projects p ON epp.project_id = p.id
    `);

    const employeesWithAssignments = employees.map(emp => {
      const empAssignments = assignments
        .filter(a => a.employee_id === emp.id)
        .map(a => ({
          project_id: a.project_id,
          project_name: a.project_name,
          position_on_project: a.position_on_project,
          is_main_project: !!a.is_main_project,
        })).filter(a => !a.is_main_project); // Exclude main project from this array now

      return {
        ...emp,
        name: emp.employee_name,
        join_date: emp.joined_date,
        birthday: emp.real_birth_date,
        project: emp.main_project_name || '', // Use the directly joined name
        other_project: empAssignments.map(p => p.project_name).join(', '),
        project_assignments: empAssignments,
      };
    });

    res.json(employeesWithAssignments);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ message: 'Server error fetching employees.' });
  } finally {
    if (connection) connection.release();
  }
});


// GET SINGLE EMPLOYEE BY ID
app.get('/api/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get employee info + main project name
    const [employeeRows] = await db.query(`
      SELECT e.*, p.name AS main_project_name
      FROM employees e
      LEFT JOIN projects p ON e.main_pj_id = p.id
      WHERE e.id = ?
    `, [id]);

    if (employeeRows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const employeeData = employeeRows[0];

    // 2. Get other project assignments (excluding main project)
    const [assignments] = await db.query(`
      SELECT 
        epp.position_on_project,
        p.id AS project_id,
        p.name AS project_name
      FROM employee_project_positions epp
      JOIN projects p ON epp.project_id = p.id
      WHERE epp.employee_id = ? AND epp.project_id != ?
    `, [id, employeeData.main_pj_id]);

    // 3. Build final employee object
    const employee = {
      ...employeeData,
      project: employeeData.main_project_name || '', // main project
      project_assignments: assignments || [],        // other projects
    };

    delete employee.password; // never send password hash
    res.json(employee);

  } catch (err) {
    console.error(`Error fetching employee with ID ${id}:`, err);
    res.status(500).json({ message: 'Server error fetching employee details.' });
  }
});


// Public: create a new employee (no auth) - Updated for new schema
app.post('/api/employees', async (req, res) => {
  const {
    // TMD is now auto-generated
    password,
    role,
    employee_name,
    position, // This is the main job title, not project position
    main_pj_id,
    main_pj_position,
    project_assignments = [], // This will now only contain "other" projects
    wfh_office,
    marital_status,
    joined_date, // Added joined_date to destructuring
    nrc_no,
    probation_period,
    after_probation,
    real_birth_date,
    birth_date_on_nrc,
    kbz_bank_account,
    bank,
    bank_acc,
    email,
    contact_no,
    parents_contact_no,
    current_address,
    address,
    contract_date,
    contract_by
  } = req.body;

  // Sanitize numeric inputs: convert empty strings to null, which is valid for numeric columns.
  const sanitizedProbation = probation_period === '' ? null : probation_period;
  const sanitizedAfterProbation = after_probation === '' ? null : after_probation;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Email duplication check
    const [existing] = await connection.query('SELECT id FROM employees WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'An employee with this email already exists.' });
    }

    // --- Auto-generate TMD ---
    const [lastEmployee] = await connection.query('SELECT TMD FROM employees ORDER BY id DESC LIMIT 1');
    let newTMD;

    if (lastEmployee.length === 0) {
      newTMD = 'TMD001';
    } else {
      const lastTMD = lastEmployee[0].TMD || 'TMD000';
      const lastNumber = parseInt(lastTMD.replace('TMD', ''), 10);
      const newNumber = lastNumber + 1;
      newTMD = `TMD${String(newNumber).padStart(3, '0')}`;
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    let final_main_pj_id = main_pj_id;

    // If main_pj_id is a string (like 'MOT' or 'MOE'), it's a default team.
    // We need to find its ID or create it if it doesn't exist.
    if (main_pj_id && isNaN(parseInt(main_pj_id))) {
      const mainProjectName = String(main_pj_id);
      // Check if a project with this name already exists
      const [existingProject] = await connection.query('SELECT id FROM projects WHERE name = ?', [mainProjectName]);

      if (existingProject.length > 0) {
        // Project exists, use its ID
        final_main_pj_id = existingProject[0].id;
      } else {
        // Project does not exist, create it
        const [newProjectResult] = await connection.query('INSERT INTO projects (name) VALUES (?)', [mainProjectName]);
        final_main_pj_id = newProjectResult.insertId;
        console.log(`Created new project '${mainProjectName}' with ID: ${final_main_pj_id}`);
      }
    }


    const [result] = await connection.query(
      `INSERT INTO employees (
        TMD, employee_name, password, role, position, main_pj_id, main_pj_position, wfh_office, joined_date, 
        marital_status, nrc_no, probation_period, after_probation, real_birth_date,
        birth_date_on_nrc, kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no,
        current_address, address, contract_date, contract_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTMD, employee_name, hashedPassword, role, position, final_main_pj_id, main_pj_position, wfh_office, joined_date,
        marital_status, nrc_no, sanitizedProbation, sanitizedAfterProbation, real_birth_date,
        birth_date_on_nrc, kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no,
        current_address, address, contract_date, contract_by
      ]
    );

    const newEmployeeId = result.insertId;

    if (project_assignments && project_assignments.length > 0) {
      // Process assignments one by one to handle new projects
      for (const assignment of project_assignments) {
        let projectId = assignment.project_id;

        // If project_id is a string (e.g., 'new_123...'), it's a new project.
        if (projectId && isNaN(parseInt(projectId))) {
          const projectName = assignment.project_name || String(projectId); // Use project_name if available
          
          // Check if it exists, otherwise create it
          const [existingProject] = await connection.query('SELECT id FROM projects WHERE name = ?', [projectName]);
          if (existingProject.length > 0) {
            projectId = existingProject[0].id;
          } else {
            const [newProjectResult] = await connection.query('INSERT INTO projects (name) VALUES (?)', [projectName]);
            projectId = newProjectResult.insertId;
            console.log(`Created new other project '${projectName}' with ID: ${projectId}`);
          }
        }

        // Now insert the assignment with a valid integer projectId
        await connection.query(
          'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
          [newEmployeeId, projectId, assignment.position_on_project, false]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      id: newEmployeeId,
      TMD: newTMD, // Add the newly generated TMD to the response
      name: employee_name, // Map back to 'name' for frontend compatibility
      email,
      position,
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: "Database table 'employees' not found." });
    }
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ message: `A field is missing or incorrect in your 'employees' table. Details: ${error.sqlMessage}` });
    }
    await connection.rollback();
    res.status(500).json({ message: 'Error creating employee.' });
  } finally {
    if (connection) connection.release();
  }
});

// UPDATE AN EMPLOYEE
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const {
    employee_name,
    password,
    role,
    position,
    main_pj_id,
    main_pj_position,
    project_assignments = [],
    wfh_office,
    marital_status,
    joined_date,
    nrc_no,
    probation_period,
    after_probation,
    real_birth_date,
    birth_date_on_nrc,
    kbz_bank_account,
    bank,
    bank_acc,
    email,
    contact_no,
    parents_contact_no,
    current_address,
    address,
    contract_date,
    contract_by
  } = req.body;

  // Sanitize numeric inputs for the update as well.
  const sanitizedProbation = probation_period === '' ? null : probation_period;
  const sanitizedAfterProbation = after_probation === '' ? null : after_probation;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Check for email duplication, excluding the current employee
    const [existing] = await connection.query('SELECT id FROM employees WHERE email = ? AND id != ?', [email, id]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'An employee with this email already exists.' });
    }

    let final_main_pj_id = main_pj_id;
    // Same logic as create: if main_pj_id is a string, find or create the project and get its ID.
    if (main_pj_id && isNaN(parseInt(main_pj_id))) {
      const mainProjectName = String(main_pj_id);
      const [existingProject] = await connection.query('SELECT id FROM projects WHERE name = ?', [mainProjectName]);

      if (existingProject.length > 0) {
        final_main_pj_id = existingProject[0].id;
      } else {
        const [newProjectResult] = await connection.query('INSERT INTO projects (name) VALUES (?)', [mainProjectName]);
        final_main_pj_id = newProjectResult.insertId;
        console.log(`Created new project '${mainProjectName}' with ID: ${final_main_pj_id} during update.`);
      }
    }


    let updateFields = `
      employee_name = ?, role = ?, position = ?, main_pj_id = ?, main_pj_position = ?, wfh_office = ?, 
      marital_status = ?, joined_date = ?, nrc_no = ?, probation_period = ?, after_probation = ?,
      real_birth_date = ?, birth_date_on_nrc = ?, kbz_bank_account = ?, bank = ?, bank_acc = ?,
      email = ?, contact_no = ?, parents_contact_no = ?, current_address = ?, address = ?,
      contract_date = ?, contract_by = ?
    `;

    let params = [
      employee_name, role, position, final_main_pj_id, main_pj_position, wfh_office, marital_status, joined_date, nrc_no,
      sanitizedProbation, sanitizedAfterProbation, real_birth_date, birth_date_on_nrc,
      kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no,
      current_address, address, contract_date, contract_by
    ];

    // Only hash and update password if a new one is provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields += ', password = ?';
      params.push(hashedPassword);
    }

    params.push(id);

    await connection.query(`UPDATE employees SET ${updateFields} WHERE id = ?`, params);

    // Simple strategy: delete all old assignments and insert the new ones.
    await connection.query('DELETE FROM employee_project_positions WHERE employee_id = ?', [id]);

    if (project_assignments && project_assignments.length > 0) {
      // Process assignments one by one to handle new projects during an update
      for (const assignment of project_assignments) {
        let projectId = assignment.project_id;

        // If project_id is a string (e.g., 'new_123...'), it's a new project.
        if (projectId && isNaN(parseInt(projectId))) {
          const projectName = assignment.project_name || String(projectId);
          
          // Check if it exists, otherwise create it
          const [existingProject] = await connection.query('SELECT id FROM projects WHERE name = ?', [projectName]);
          if (existingProject.length > 0) {
            projectId = existingProject[0].id;
          } else {
            const [newProjectResult] = await connection.query('INSERT INTO projects (name) VALUES (?)', [projectName]);
            projectId = newProjectResult.insertId;
            console.log(`Created new other project '${projectName}' with ID: ${projectId} during update.`);
          }
        }

        await connection.query(
          'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
          [id, projectId, assignment.position_on_project, false]
        );
      }
    }

    await connection.commit();
    res.status(200).json({ message: 'Employee updated successfully.' });
  } catch (error) {
    console.error('Error updating employee:', error);
    await connection.rollback();
    res.status(500).json({ message: 'Error updating employee.' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE AN EMPLOYEE
app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM employees WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ message: 'Error deleting employee.' });
  }
});

// GET ALL PROJECTS
app.get('/api/projects', async (req, res) => {
  try {
    const [projects] = await db.query('SELECT * FROM projects ORDER BY name ASC');
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Server error fetching projects.' });
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

// GET TODAY'S REPORT FOR THE LOGGED-IN EMPLOYEE (replaces the /:id version)
app.get(
  "/api/reports/employee/today",
  authenticateToken, // Ensures user is logged in
  async (req, res) => {
    const employee_id = req.user.id; // Securely get ID from the token
    const today = new Date().toISOString().split("T")[0];

    try {
      const [rows] = await db.query(
        "SELECT * FROM reports WHERE employee_id = ? AND report_date = ?",
        [employee_id, today]
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

// CREATE REPORT (public) — accepts both new and legacy keys and supports many schema variants
app.post("/api/reports", authenticateToken, async (req, res) => {
  const employee_id = req.user.id; // Get user ID from authenticated token
  const { report_text, submission_time, report_date } = req.body;

  // Validate required fields
  const missingFields = [];
  if (!report_text || report_text.trim() === '') missingFields.push('report_text');
  if (!submission_time) missingFields.push('submission_time');
  if (!report_date) missingFields.push('report_date');

  if (missingFields.length > 0) {
    return res.status(400).json({ 
      message: `Missing required fields: ${missingFields.join(', ')}.`,
      missingFields: missingFields
    });
  }

  try {
    // Check if report already submitted today by this employee
    const [existing] = await db.query(
      "SELECT id FROM reports WHERE employee_id = ? AND report_date = ?",
      [employee_id, report_date]
    );

    if (existing.length) {
      return res.status(409).json({ 
        message: "You have already submitted a report for today.",
        code: "DUPLICATE_REPORT"
      });
    }

    const [result] = await db.query( // The compliance_status is already being set by the database trigger.
      "INSERT INTO reports (employee_id, report_text, submission_time, report_date, compliance_status) VALUES (?, ?, ?, ?, ?)",
      [employee_id, report_text, submission_time, report_date, compliance_status]
    );

    // Fetch the newly created report to return complete data to the frontend
    const [newReport] = await db.query("SELECT * FROM reports WHERE id = ?", [result.insertId]);
    return res.status(201).json(newReport[0]);

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ 
      message: "Database error submitting report.",
      error: err.message 
    });
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
        await db.query("ALTER TABLE employees ADD COLUMN total_annual_leave INT DEFAULT 12");
        await db.query("ALTER TABLE employees ADD COLUMN remaining_annual_leave INT DEFAULT 12");
        
        // Update the current employee with default values
        await db.query(
          "UPDATE employees SET total_annual_leave = 12, remaining_annual_leave = 12 WHERE id = ?",
          [userId]
        );
        
        console.log("Created annual leave columns and set default values for employee", userId);
        
        res.json({
          totalAL: 12,
          remainingAL: 12
        });
      } catch (alterError) {
        console.error("Error creating annual leave columns:", alterError);
        res.json({
          totalAL: 12,
          remainingAL: 12
        });
      }
    }
  } catch (err) {
    console.error("Error fetching employee stats:", err);
    // If there's an error, return default values instead of failing
    res.json({
      totalAL: 12,
      remainingAL: 12
    });
  }
});

// GET EMPLOYEE PERSONAL REPORT STATS
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

// FETCH LEAVES (All)
app.get(
  "/api/leaves",
  async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT l.*, e.employee_name AS name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id ORDER BY l.created_at DESC`
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
             l.status, l.created_at, l.medical_certificate_url, e.employee_name as name
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

app.post("/api/leaves", authenticateToken, upload, async (req, res) => {
  try {
    const employee_id = req.user.id; // Securely get user ID from token
    const {
      leave_type,
      start_date,
      end_date,
      reason,
      backup_person,
    } = req.body;

    // --- Validation ---
    // Merged the two if statements into one
    if (!employee_id || !leave_type || !start_date || !end_date || !reason) {
      return res.status(400).json({ message: "Missing required fields." });
    }
    // The 'if' block is now correctly closed.

    // Construct the URL for the uploaded file, if it exists
    const medical_certificate_url = req.file ? `/uploads/${req.file.filename}` : null;

    // Check for overlapping leave requests
    const [overlapping] = await db.query(
      `SELECT id FROM leaves WHERE employee_id = ? AND status NOT IN ('Rejected', 'Cancelled') AND (
          (? BETWEEN start_date AND end_date) OR 
          (start_date BETWEEN ? AND ?)
        )`,
      [employee_id, start_date, end_date, start_date, end_date]
    );
    
    if (overlapping.length > 0) {
      return res
        .status(409)
        .json({ message: "Leave request overlaps with an existing one." });
    }

    // --- Database Insertion ---
    const [result] = await db.query(
      "INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, backup_person, medical_certificate_url, status, pj_lead_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending')",
      [
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason,
        backup_person,
        medical_certificate_url
      ]
    );

    // --- Success Response ---
    const [newLeave] = await db.query("SELECT * FROM leaves WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(newLeave[0]);

  } catch (dbErr) {
    console.error("Database error on leave creation:", dbErr);
    res.status(500).json({ message: "Database error." });
  }
});

// UPDATE LEAVE STATUS
app.put(
  "/api/leaves/:id",
  async (req, res) => {
    const { id } = req.params;
    const { status, leave_type, approver_role, approver_id } = req.body; // Added approver role and id

    const VALID_LEAVE_TYPES = ["AL", "ML", "UPL", "HML", "HEL", "HUPL"];
    if (leave_type && !VALID_LEAVE_TYPES.includes(leave_type.toUpperCase()))
      return res
        .status(400)
        .json({ message: `Invalid leave type: ${leave_type}` });

    let updateFields = [];
    let params = [];

    // --- NEW APPROVAL LOGIC ---
    if (status && approver_role && approver_id) {
      if (approver_role.toLowerCase() === 'pj lead') {
        // Project Lead is making a decision
        const [leadRows] = await db.query("SELECT employee_name FROM employees WHERE id = ?", [approver_id]);
        if (leadRows.length > 0) {
          updateFields.push("pj_lead_status = ?");
          params.push(status); // 'Approved' or 'Rejected'
          updateFields.push("approved_by_pj_lead = ?");
          params.push(leadRows[0].employee_name);
          // If PJL rejects, the main status also becomes Rejected.
          if (status === 'Rejected') {
            updateFields.push("status = ?");
            params.push('Rejected');
          }
        }
      } else if (approver_role.toLowerCase() === 'admin' && status === 'Approved') {
        // Admin is giving final approval
        updateFields.push("status = ?");
        params.push('Approved');
      } else { // For rejections or other status changes
        updateFields.push("status = ?");
        params.push(status);
      }
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
        `SELECT l.*, e.employee_name AS name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
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
        `SELECT l.*, e.employee_name AS name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
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
  {
    console.log(`✅ Server running at http://${HOST}:${PORT}`);
    createDefaultAdmin();
  }
);
