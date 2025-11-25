const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken"); // Import jsonwebtoken
const db = require("./db");
const multer = require("multer");
const fs = require("fs");
const cron = require("node-cron");
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

app.use(express.json());

// Enable CORS
app.use(cors());

// Simple request logger for debugging incoming API calls
app.use((req, res, next) => {
  try {
    const auth = req.headers && req.headers.authorization ? '[auth]' : '[no-auth]';
    console.log(`--> ${req.method} ${req.originalUrl} ${auth}`);
  } catch (e) {
    // ignore logging errors
  }
  next();
});


// Use a secret from .env or a default. In production, always use .env!
const JWT_SECRET = process.env.JWT_SECRET || "your-default-super-secret-key";
// Access token TTL and refresh token TTL
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "1h";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "7d";

// Utility: determine if a given position string represents a lead role
const isLeadPosition = (pos) => {
  if (!pos) return false;
  return /\blead\b/i.test(String(pos));
};

// Utility: normalize various date inputs to MySQL-friendly 'YYYY-MM-DD' or null
// - Blank/undefined/placeholder -> null
// - dd/mm/yyyy or dd.mm.yyyy -> yyyy-mm-dd
// - Otherwise return as-is (assumed yyyy-mm-dd or Date)
const toDateOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === 'null' || s === 'NULL' || /^0{4}-0{2}-0{2}$/.test(s) || /^[-]+$/.test(s)) return null;
  const m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
};

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
          \`TMD\`, \`employee_name\`, \`email\`, \`password\`, \`role\`, \`position\`, \`project\`, \`other_project\`, \`wfh_office\`, \`joined_date\`,
          \`marital_status\`, \`nrc_no\`, \`probation_period\`, \`after_probation\`, \`real_birth_date\`, \`birth_date_on_nrc\`,
          \`kbz_bank_account\`, \`bank\`, \`bank_acc\`,
          \`contact_no\`, \`parents_contact_no\`, \`current_address\`, \`address\`, \`contract_date\`, \`contract_by\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "TMD001", adminName, adminEmail, hashedPassword, "admin", "Administrator",
          'Internal', null, 'Office', adminJoinDate, '-', '-', 0, 0, // project, other_project, wfh_office, joined_date, marital_status, nrc_no, probation_period, after_probation
          adminBirthDate, null, '-', '-', '-', // real_birth_date, birth_date_on_nrc, kbz_bank_account, bank, bank_acc
          '-', '-', '-', '-', adminJoinDate, 'System' // contact_no, parents_contact_no, current_address, address, contract_date, contract_by
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

// One-time startup backfill: migrate legacy `project` text column into `main_pj_id`
// and ensure a main assignment row exists in `employee_project_positions`.
const backfillMainProjects = async () => {
  try {
    // Detect legacy `project` column presence first
    const [projCol] = await db.query("SHOW COLUMNS FROM `employees` LIKE 'project'");
    if (projCol.length === 0) return; // nothing to migrate

    const [rows] = await db.query(`
      SELECT id, project, position, main_pj_position
      FROM employees
      WHERE (main_pj_id IS NULL OR main_pj_id = 0)
        AND project IS NOT NULL
        AND TRIM(project) <> ''
        AND project <> '-'
    `);

    if (!rows.length) return;

    let updated = 0;
    for (const emp of rows) {
      const name = String(emp.project).trim();
      try {
        // Find or create project by name
        let projId = null;
        const [p] = await db.query('SELECT id FROM projects WHERE name = ?', [name]);
        if (p.length) projId = p[0].id;
        else {
          const [ins] = await db.query('INSERT INTO projects (name) VALUES (?)', [name]);
          projId = ins.insertId;
        }

        // Update employee main_pj_id
        await db.query('UPDATE employees SET main_pj_id = ? WHERE id = ?', [projId, emp.id]);

        // Upsert main assignment row
        const [existingMain] = await db.query(
          'SELECT id FROM employee_project_positions WHERE employee_id = ? AND is_main_project = 1',
          [emp.id]
        );
        const pos = emp.main_pj_position || emp.position || null;
        if (existingMain.length) {
          await db.query(
            'UPDATE employee_project_positions SET project_id = ?, position_on_project = ? WHERE id = ?',
            [projId, pos, existingMain[0].id]
          );
        } else {
          await db.query(
            'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, 1)',
            [emp.id, projId, pos]
          );
        }
        updated++;
      } catch (e) {
        console.warn(`Backfill main project failed for employee ${emp.id} (${name}):`, e.message);
      }
    }

    if (updated) console.log(`Backfill complete: updated main project for ${updated} employee(s).`);
  } catch (err) {
    console.warn('Backfill main projects skipped:', err.message);
  }
};

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
      const status = err.name === 'TokenExpiredError' ? 401 : 403;
      return res.status(status).json({
        message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
        code: err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token'
      });
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

// Multer file filter for general uploads (medical certificates): allow PDFs and common images
const fileFilter = (req, file, cb) => {
  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
  if (allowed.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Only PDF/JPEG/PNG files are allowed for this upload'), false);
};

// File filter for employee import files (CSV or Excel)
const importFileFilter = (req, file, cb) => {
  const filename = (file.originalname || '').toString().toLowerCase();
  const isCsv = filename.endsWith('.csv');
  const isXlsx = filename.endsWith('.xlsx') || filename.endsWith('.xls');

  const allowedMimes = new Set([
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/octet-stream'
  ]);

  if (isCsv || isXlsx || allowedMimes.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Only CSV or Excel (.xlsx/.xls) files are allowed for employee import'), false);
};

// Multer instance (do not call .single here so we can reuse for different routes if needed)
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Separate uploader for employee imports (CSV or Excel)
const importUpload = multer({ storage, fileFilter: importFileFilter, limits: { fileSize: 8 * 1024 * 1024 } });

// Serve static uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));



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
    const payload = { id: user.id, role: user.role, name: user.employee_name };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });

    delete user.password;
    // Send back token and user info
    res.json({ token, refreshToken, user, expiresIn: ACCESS_TOKEN_TTL });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// GET all QA records
app.get('/api/qa', async (req, res) => {
  try {
    const [qaRecords] = await db.query(`
      SELECT qa.*, e.employee_name 
      FROM qa_records qa
      JOIN employees e ON qa.employee_id = e.id
      ORDER BY qa.created_at DESC
    `);
    res.json(qaRecords);
  } catch (error) {
    console.error('Error fetching QA records:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh access token using a valid refresh token
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const bodyToken = req.body?.refreshToken;
    const refreshToken = headerToken || bodyToken;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required.' });
    }

    jwt.verify(refreshToken, JWT_SECRET, (err, user) => {
      if (err) {
        const status = err.name === 'TokenExpiredError' ? 401 : 403;
        return res.status(status).json({
          message: err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token',
          code: err.name === 'TokenExpiredError' ? 'refresh_expired' : 'invalid_refresh'
        });
      }

      const payload = { id: user.id, role: user.role, name: user.name };
      const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
      return res.json({ token: newAccessToken, expiresIn: ACCESS_TOKEN_TTL });
    });
  } catch (err) {
    console.error('Error refreshing token:', err);
    res.status(500).json({ message: 'Server error.' });
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
    const { main_project: mainProjectFilter, position: positionFilter } = req.query;
    
    // Build the base query with optional filters
    let query = `
      SELECT e.*, p.name as main_project_name 
      FROM employees e 
      LEFT JOIN projects p ON e.main_pj_id = p.id
      WHERE 1=1
    `;
    const queryParams = [];

    // Add main project filter if provided
    if (mainProjectFilter) {
      query += ' AND p.name LIKE ?';
      queryParams.push(`%${mainProjectFilter}%`);
    }

    // Add position filter if provided
    if (positionFilter) {
      query += ' AND e.position LIKE ?';
      queryParams.push(`%${positionFilter}%`);
    }

    const [employees] = await connection.query(query, queryParams);
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


    // Enforce: Only one main project lead per project
    const isMainLead = isLeadPosition(main_pj_position || position);
    if (final_main_pj_id && isMainLead) {
      const [existingLead] = await connection.query(
        `SELECT epp.employee_id, e.employee_name
         FROM employee_project_positions epp
         JOIN employees e ON epp.employee_id = e.id
         WHERE epp.project_id = ?
           AND epp.is_main_project = 1
           AND LOWER(COALESCE(epp.position_on_project, '')) LIKE '%lead%'
         LIMIT 1`,
        [final_main_pj_id]
      );
      if (existingLead.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: `This main project already has a project lead (${existingLead[0].employee_name}).`,
          code: 'MAIN_PROJECT_LEAD_EXISTS'
        });
      }
    }

    // Normalize dates to avoid '' into DATE columns
    const normJoined = toDateOrNull(joined_date);
    const normRealBirth = toDateOrNull(real_birth_date);
    const normBirthOnNrc = toDateOrNull(birth_date_on_nrc);
    const normContract = toDateOrNull(contract_date);

    const [result] = await connection.query(
      `INSERT INTO employees (
        \`TMD\`, \`employee_name\`, \`password\`, \`role\`, \`position\`, \`main_pj_id\`, \`main_pj_position\`, \`wfh_office\`, \`joined_date\`, 
        \`marital_status\`, \`nrc_no\`, \`probation_period\`, \`after_probation\`, \`real_birth_date\`,
        \`birth_date_on_nrc\`, \`kbz_bank_account\`, \`bank\`, \`bank_acc\`, \`email\`, \`contact_no\`, \`parents_contact_no\`,
        \`current_address\`, \`address\`, \`contract_date\`, \`contract_by\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTMD, employee_name, hashedPassword, role, position, final_main_pj_id, main_pj_position, wfh_office, normJoined,
        marital_status, nrc_no, sanitizedProbation, sanitizedAfterProbation, normRealBirth,
        normBirthOnNrc, kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no,
        current_address, address, normContract, contract_by
      ]
    );

    const newEmployeeId = result.insertId;

    // Ensure main project assignment exists in employee_project_positions as is_main_project
    try {
      if (final_main_pj_id) {
        await connection.query(
          'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
          [newEmployeeId, final_main_pj_id, main_pj_position || position || null, true]
        );
      }
    } catch (eppErr) {
      console.warn('Failed to insert main project assignment (non-fatal):', eppErr.message);
    }

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


    // Normalize dates to avoid writing '' into DATE columns
    const normJoined = toDateOrNull(joined_date);
    const normRealBirth = toDateOrNull(real_birth_date);
    const normBirthOnNrc = toDateOrNull(birth_date_on_nrc);
    const normContract = toDateOrNull(contract_date);

    let updateFields = `
      \`employee_name\` = ?, \`role\` = ?, \`position\` = ?, \`main_pj_id\` = ?, \`main_pj_position\` = ?, \`wfh_office\` = ?, 
      \`marital_status\` = ?, \`joined_date\` = ?, \`nrc_no\` = ?, \`probation_period\` = ?, \`after_probation\` = ?,
      \`real_birth_date\` = ?, \`birth_date_on_nrc\` = ?, \`kbz_bank_account\` = ?, \`bank\` = ?, \`bank_acc\` = ?,
      \`email\` = ?, \`contact_no\` = ?, \`parents_contact_no\` = ?, \`current_address\` = ?, \`address\` = ?,
      \`contract_date\` = ?, \`contract_by\` = ?
    `;

    let params = [
      employee_name, role, position, final_main_pj_id, main_pj_position, wfh_office, marital_status, normJoined, nrc_no,
      sanitizedProbation, sanitizedAfterProbation, normRealBirth, normBirthOnNrc,
      kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no,
      current_address, address, normContract, contract_by
    ];

    // Only hash and update password if a new one is provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields += ', \`password\` = ?';
      params.push(hashedPassword);
    }

    params.push(id);

    // Enforce: Only one main project lead per project on update
    const isMainLead = isLeadPosition(main_pj_position || position);
    if (final_main_pj_id && isMainLead) {
      const [existingLead] = await connection.query(
        `SELECT epp.employee_id, e.employee_name
         FROM employee_project_positions epp
         JOIN employees e ON epp.employee_id = e.id
         WHERE epp.project_id = ?
           AND epp.is_main_project = 1
           AND LOWER(COALESCE(epp.position_on_project, '')) LIKE '%lead%'
           AND epp.employee_id <> ?
         LIMIT 1`,
        [final_main_pj_id, id]
      );
      if (existingLead.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: `This main project already has a project lead (${existingLead[0].employee_name}).`,
          code: 'MAIN_PROJECT_LEAD_EXISTS'
        });
      }
    }

    await connection.query(`UPDATE employees SET ${updateFields} WHERE id = ?`, params);

    // Simple strategy: delete all old assignments and insert the new ones.
    await connection.query('DELETE FROM employee_project_positions WHERE employee_id = ?', [id]);

    // Recreate main project assignment row
    try {
      if (final_main_pj_id) {
        await connection.query(
          'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
          [id, final_main_pj_id, main_pj_position || position || null, true]
        );
      }
    } catch (eppErr) {
      console.warn('Failed to upsert main project assignment during update (non-fatal):', eppErr.message);
    }

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

// DELETE a leave (admin or owner can remove unapproved/pending leaves)
app.delete('/api/leaves/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = (req.user?.role || '').toString().toLowerCase();
  console.log(`DELETE /api/leaves/${id} requested by user ${userId} (role=${userRole})`);

  try {
    const [rows] = await db.query('SELECT * FROM leaves WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Leave not found' });

    const leave = rows[0];

    // Ensure necessary columns exist on `leaves` table to avoid SQL errors
    try {
      const ensureCols = async (colName, alterSql) => {
        const [c] = await db.query(`SHOW COLUMNS FROM leaves LIKE ?`, [colName]);
        if (!c || c.length === 0) {
          await db.query(alterSql);
          console.log(`Added column ${colName} to leaves table (migration)`);
        }
      };
      await ensureCols('approved_days', 'ALTER TABLE leaves ADD COLUMN approved_days DECIMAL(6,2) NULL');
      await ensureCols('approved_by_pj_lead', 'ALTER TABLE leaves ADD COLUMN approved_by_pj_lead INT NULL');
      // Use the existing column name `pj_approval_date` (schema uses this name)
      await ensureCols('pj_approval_date', 'ALTER TABLE leaves ADD COLUMN pj_approval_date DATETIME NULL');
    } catch (colErr) {
      console.warn('Could not ensure leaves approval columns exist (non-fatal):', colErr.message);
    }
    // Only admin or the owner can delete
    if (userRole !== 'admin' && Number(leave.employee_id) !== Number(userId)) {
      return res.status(403).json({ message: 'Not authorized to delete this leave' });
    }

    // Prevent deleting already-approved leaves
    const isApproved = (leave.status || '').toString().toLowerCase() === 'approved' ||
      (leave.pj_lead_status || '').toString().toLowerCase() === 'approved' ||
      (leave.admin_approval_status || '').toString().toLowerCase() === 'approved';

    if (isApproved) {
      return res.status(400).json({ message: 'Cannot delete an approved leave' });
    }

    await db.query('DELETE FROM leaves WHERE id = ?', [id]);
    res.json({ success: true, message: 'Leave deleted' });
  } catch (err) {
    console.error('Error deleting leave:', err);
    res.status(500).json({ message: 'Error deleting leave' });
  }
});

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
    // Determine compliance status based on submission time thresholds
    const parseDate = (val) => {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const submittedAt = parseDate(submission_time) || new Date();
    const base = new Date(
      submittedAt.getFullYear(),
      submittedAt.getMonth(),
      submittedAt.getDate(),
      submittedAt.getHours(),
      submittedAt.getMinutes(),
      submittedAt.getSeconds(),
      0
    );
    const t1001 = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 1, 0, 0);
    const t1230 = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 30, 0, 0);
    // Log the timestamps to help debug timezone/formatting issues
    console.log('⏱️ DEBUG: submittedAt:', submittedAt.toISOString(), 'base:', base.toISOString(), 't1001:', t1001.toISOString(), 't1230:', t1230.toISOString());

    // Inclusive thresholds: submissions at 10:01 and 12:30 are considered late
    let computedStatus = 'OnTime';
    if (base >= t1230) computedStatus = 'UPL';
    else if (base >= t1001) computedStatus = 'HUL';

    // Use server-evaluated status regardless of client-provided value
    const finalCompliance = computedStatus;
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

    const [result] = await db.query(
      "INSERT INTO reports (employee_id, report_text, submission_time, report_date, compliance_status) VALUES (?, ?, ?, ?, ?)",
      [employee_id, report_text, submittedAt, report_date, finalCompliance]
    );

    // Auto-create leave record for late reports
    // Use leave_type identical to compliance_status (HUL or UPL) for consistency with UI expectations.
    // Previously used HUPL for half unpaid leave which caused mismatch in Leave Records display.
    console.log('🔍 DEBUG: Checking auto-creation logic. finalCompliance:', finalCompliance, 'employee_id:', employee_id, 'report_date:', report_date);

    if (finalCompliance === 'HUL' || finalCompliance === 'UPL') {
      console.log('✅ DEBUG: Auto-creation condition met, proceeding with leave record creation');
      try {
        const leaveType = finalCompliance; // 'HUL' or 'UPL'
        const day = new Date(report_date);
        const start = isNaN(day.getTime()) ? new Date(submittedAt) : day;
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, '0');
        const d = String(start.getDate()).padStart(2, '0');
        const dateYMD = `${y}-${m}-${d}`;

        console.log('📅 DEBUG: Calculated date:', dateYMD, 'leaveType:', leaveType);

        // Skip if any leave already exists on that date for this employee
        // Use an explicit overlap check (start_date <= date <= end_date)
        const [existingLeave] = await db.query(
          `SELECT id FROM leaves
           WHERE employee_id = ?
             AND start_date <= ?
             AND end_date >= ?
           LIMIT 1`,
          [employee_id, dateYMD, dateYMD]
        );

        console.log('🔍 DEBUG: Existing leave check result:', Array.isArray(existingLeave) ? existingLeave.length : existingLeave, 'records found');

        if (!existingLeave || existingLeave.length === 0) {
          console.log('➕ DEBUG: No existing leave found, creating new leave record');
          try {
            const [ins] = await db.query(
              `INSERT INTO leaves
                (employee_id, start_date, end_date, leave_type, reason, status)
               VALUES (?, ?, ?, ?, ?, 'pending')`,
              [employee_id, dateYMD, dateYMD, leaveType, `Auto-created due to late report (${finalCompliance})`]
            );
            console.log('✅ DEBUG: Leave record created successfully, id:', ins.insertId);
          } catch (insErr) {
            // Some schemas or migrations may expect 'HUPL' for half unpaid leave; try fallback
            console.warn('❗ WARN: Insert failed for leaveType', leaveType, '- trying fallback mapping if applicable. Error:', insErr.message);
            try {
              const fallbackType = leaveType === 'HUL' ? 'HUPL' : leaveType;
              const [ins2] = await db.query(
                `INSERT INTO leaves
                  (employee_id, start_date, end_date, leave_type, reason, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [employee_id, dateYMD, dateYMD, fallbackType, `Auto-created due to late report (fallback ${fallbackType})`]
              );
              console.log('✅ DEBUG: Leave record created with fallback type, id:', ins2.insertId);
            } catch (ins2Err) {
              console.error('❌ Failed to auto-create leave even with fallback:', ins2Err);
            }
          }
        } else {
          console.log('⏭️ DEBUG: Skipping creation - leave already exists for this date');
        }
      } catch (autoErr) {
        console.warn('❌ Auto-create leave for late report failed (non-fatal):', autoErr.message);
        console.error('❌ Full error details:', autoErr);
      }
    } else {
      console.log('⏭️ DEBUG: Auto-creation condition not met - compliance status is:', finalCompliance);
    }

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
// In your reports endpoint, modify the query to include other_projects
app.get("/api/reports", authenticateToken, async (req, res) => {
  try {
    const [reports] = await db.query(`
      SELECT r.*, 
             e.employee_name as employee_name
      FROM reports r
      JOIN employees e ON r.employee_id = e.id
      ORDER BY r.report_date DESC, r.submission_time DESC
    `);
    res.json(reports);
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ message: "Error fetching reports" });
  }
});

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
app.get("/api/reports/employee/:id/today", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];

  try {
    const [rows] = await db.query(
      "SELECT * FROM reports WHERE employee_id = ? AND report_date = ?",
      [id, today]
    );

    if (rows.length) {
      // Return the report object when found
      res.json(rows[0]);
    } else {
      // Return an empty array for consistency with other endpoints (avoid client 404 errors)
      res.json([]);
    }
  } catch (err) {
    console.error("Error fetching today's report:", err);
    res.status(500).json({ message: "Error fetching today's report." });
  }
});

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

// Debug: get a single leave by id (non-conflicting path)
app.get('/api/leaves/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT l.*, e.employee_name AS employee_name, a.employee_name AS approved_by_admin_name, pj.employee_name AS approved_by_pj_lead_name
       FROM leaves l
       LEFT JOIN employees e ON l.employee_id = e.id
       LEFT JOIN employees a ON l.approved_by_admin = a.id
       LEFT JOIN employees pj ON l.approved_by_pj_lead = pj.id
       WHERE l.id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Leave not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching leave detail:', err);
    res.status(500).json({ message: 'Error fetching leave' });
  }
});

// GET LEAVES FOR A SPECIFIC EMPLOYEE (BY ID)
// GET LEAVE BY ID (with employee details)
app.get('/api/leaves/employee/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // 1) Load leave + employee + main project name (via join to projects)
    const [leaves] = await db.query(
      `SELECT l.*, 
              e.employee_name AS employee_name,
              e.email AS employee_email,
              e.position,
              e.main_pj_id,
              pm.name AS main_project
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       LEFT JOIN projects pm ON e.main_pj_id = pm.id
       WHERE l.id = ?`,
      [id]
    );

    if (!leaves.length) {
      // Fallback: treat :id as employee_id and return that employee's leaves list
      try {
        const [empLeaves] = await db.query(
          `SELECT l.*, e.employee_name as employee_name, e.email as employee_email,
                  a.employee_name AS approved_by_admin_name,
                  pj.employee_name AS approved_by_pj_lead_name
           FROM leaves l
           JOIN employees e ON l.employee_id = e.id
           LEFT JOIN employees a ON l.approved_by_admin = a.id
           LEFT JOIN employees pj ON l.approved_by_pj_lead = pj.id
           WHERE l.employee_id = ?
           ORDER BY l.created_at DESC`,
          [id]
        );
        return res.json(Array.isArray(empLeaves) ? empLeaves : []);
      } catch (innerErr) {
        console.warn('Fallback leaves-by-employee failed:', innerErr.message);
        return res.status(404).json({ message: 'Leave request not found' });
      }
    }

    const leave = leaves[0];

    // 2) Load other project assignments for the employee (exclude main)
    let assignments = [];
    try {
      const [rows] = await db.query(
        `SELECT epp.position_on_project, p.id AS project_id, p.name AS project_name
         FROM employee_project_positions epp
         JOIN projects p ON epp.project_id = p.id
         WHERE epp.employee_id = ? AND epp.is_main_project = 0`,
        [leave.employee_id]
      );
      assignments = rows || [];
    } catch (assignErr) {
      console.warn('Other project assignments lookup failed (non-fatal):', assignErr.message);
    }

    // Build pretty formatted string like "AI (Employee), Myay Agent (Employee)"
    const other_project = (assignments || [])
      .map(a => a.project_name + (a.position_on_project ? ` (${a.position_on_project})` : ''))
      .join(', ');

    // 3) Get team members for the same main project
    let team_members = [];
    if (leave.main_pj_id) {
      try {
        const [teamMembers] = await db.query(
          `SELECT e.id, e.employee_name AS name, e.email, e.position
           FROM employees e
           JOIN employee_project_positions pm ON e.id = pm.employee_id
           WHERE pm.project_id = ? AND e.id != ?`,
          [leave.main_pj_id, leave.employee_id]
        );
        team_members = teamMembers;
      } catch (innerErr) {
        console.warn('Team members lookup failed (non-fatal):', innerErr.message);
      }
    }

    res.json({ ...leave, other_project, project_assignments: assignments, team_members });
  } catch (error) {
    console.error('Error fetching leave details:', error);
    res.status(500).json({
      message: 'Error fetching leave details',
      error: error.message
    });
  }
});

// Get today's report(s) for a specific employee (by employee id)
app.get('/api/reports/employee/:id/today', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT r.*
       FROM reports r
       WHERE r.employee_id = ?
         AND (
           DATE(r.report_date) = CURDATE() OR
           DATE(r.submission_time) = CURDATE() OR
           DATE(r.created_at) = CURDATE()
         )
       ORDER BY r.submission_time DESC, r.created_at DESC`,
      [id]
    );
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error('Error fetching today reports:', err);
    return res.json([]); // respond with empty list instead of 404
  }
});

// GET leave requests for PJ Leads (pending) - used by PJLeadDashboard
app.get("/api/leaves/pj-lead", authenticateToken, async (req, res) => {
  try {
    const pjLeadId = req.user.id;

    // Determine projects where the user holds a lead role via employee_project_positions
    const [projects] = await db.query(
      `SELECT DISTINCT project_id
       FROM employee_project_positions
       WHERE employee_id = ?
         AND (LOWER(position_on_project) LIKE '%lead%' OR LOWER(position_on_project) LIKE '%pj lead%' OR LOWER(position_on_project) LIKE '%project lead%')`,
      [pjLeadId]
    );

    const projectIds = projects.map((p) => p.project_id);
    console.log(`PJ-LEAD GET: user=${pjLeadId} projectIds=${JSON.stringify(projectIds)}`);

    // Fetch pending leaves for team members in those projects OR explicitly assigned to this PJ lead
    let leaves = [];
    if (projectIds.length === 0) {
      // No lead projects found, fall back to returning leaves explicitly assigned to this PJ lead
      console.log(`PJ-LEAD GET: user=${pjLeadId} - no lead projects, returning assigned leaves only`);
      const [rows] = await db.query(
        `SELECT l.*, e.employee_name as employee_name, e.email as employee_email
         FROM leaves l
         JOIN employees e ON l.employee_id = e.id
         WHERE l.assigned_pj_lead = ?
           AND l.employee_id != ?
           AND LOWER(COALESCE(l.leave_type, '')) <> 'upl'
           AND (
             LOWER(COALESCE(l.pj_lead_status, '')) = 'pending'
             OR LOWER(COALESCE(l.pj_approval_status, '')) = 'pending'
             OR LOWER(COALESCE(l.status, '')) = 'pending'
           )
          ORDER BY l.created_at DESC`,
        [pjLeadId, pjLeadId]
      );
      leaves = rows;
    } else {
      // Use EXISTS subquery to avoid duplicate rows when an employee has multiple project assignments
      const [rows] = await db.query(
        `SELECT l.*, e.employee_name as employee_name, e.email as employee_email
          FROM leaves l
          JOIN employees e ON l.employee_id = e.id
          WHERE (l.assigned_pj_lead = ? OR EXISTS (
            SELECT 1 FROM employee_project_positions epp2 WHERE epp2.employee_id = e.id AND epp2.project_id IN (?))
            OR e.main_pj_id IN (?))
            AND l.employee_id != ?
            AND LOWER(COALESCE(l.leave_type, '')) <> 'upl'
            AND (
              LOWER(COALESCE(l.pj_lead_status, '')) = 'pending'
              OR LOWER(COALESCE(l.pj_approval_status, '')) = 'pending'
              OR LOWER(COALESCE(l.status, '')) = 'pending'
            )
          ORDER BY l.created_at DESC`,
        [pjLeadId, projectIds, projectIds, pjLeadId]
      );
      leaves = rows;
    }

    console.log(`PJ-LEAD GET: returning ${Array.isArray(leaves) ? leaves.length : 0} leaves for user=${pjLeadId}`);
    if (Array.isArray(leaves) && leaves.length) console.log('PJ-LEAD LEAVE IDS:', leaves.map((l) => l.id));
    res.json(Array.isArray(leaves) ? leaves : []);
  } catch (err) {
    console.error('Failed to fetch PJ lead leaves:', err);
    res.status(500).json({ message: 'Failed to fetch leave requests.' });
  }
});

// GET all leaves for members of the PJ Lead's main project (used for counts)
app.get("/api/leaves/pj-lead/all", authenticateToken, async (req, res) => {
  try {
    const pjLeadId = req.user.id;

    // Determine projects where the user holds a lead role via employee_project_positions
    const [projects] = await db.query(
      `SELECT DISTINCT project_id
       FROM employee_project_positions
       WHERE employee_id = ?
         AND (LOWER(position_on_project) LIKE '%lead%' OR LOWER(position_on_project) LIKE '%pj lead%' OR LOWER(position_on_project) LIKE '%project lead%')`,
      [pjLeadId]
    );

    const projectIds = projects.map((p) => p.project_id);
    console.log(`PJ-LEAD-ALL GET: user=${pjLeadId} projectIds=${JSON.stringify(projectIds)}`);

    let leaves = [];
    if (projectIds.length === 0) {
      console.log(`PJ-LEAD-ALL GET: user=${pjLeadId} - no lead projects, returning assigned leaves only`);
      const [rows] = await db.query(
        `SELECT l.*, e.employee_name as employee_name, e.email as employee_email
         FROM leaves l
         JOIN employees e ON l.employee_id = e.id
         WHERE l.assigned_pj_lead = ?
           AND l.employee_id != ?
         ORDER BY l.created_at DESC`,
        [pjLeadId, pjLeadId]
      );
      leaves = rows;
    } else {
      // Use EXISTS subquery to avoid duplicate rows when employees have multiple project assignments
      const [rows] = await db.query(
        `SELECT l.*, e.employee_name as employee_name, e.email as employee_email
         FROM leaves l
         JOIN employees e ON l.employee_id = e.id
         WHERE (l.assigned_pj_lead = ? OR EXISTS (
           SELECT 1 FROM employee_project_positions epp2 WHERE epp2.employee_id = e.id AND epp2.project_id IN (?)))
           AND l.employee_id != ?
         ORDER BY l.created_at DESC`,
        [pjLeadId, projectIds, pjLeadId]
      );
      leaves = rows;
    }

    console.log(`PJ-LEAD-ALL GET: returning ${Array.isArray(leaves) ? leaves.length : 0} leaves for user=${pjLeadId}`);
    res.json(Array.isArray(leaves) ? leaves : []);
  } catch (err) {
    console.error('Failed to fetch PJ lead all leaves:', err);
    res.status(500).json({ message: 'Failed to fetch leave requests.' });
  }
});

// Add this endpoint to server.js
app.get('/api/employees/project/:projectId/leads', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Return project leads by checking multiple indicators:
    // - explicit role 'pj lead'
    // - position_on_project containing Lead/Manager
    // - employee.position containing Lead/Manager
    // This makes the endpoint tolerant to different ways leads are recorded.
    const [leads] = await db.query(`
      SELECT DISTINCT 
        e.id,
        e.employee_name,
        e.email,
        e.position AS position,
        epp.position_on_project AS position_on_project
      FROM employees e
      JOIN employee_project_positions epp ON e.id = epp.employee_id
      WHERE epp.project_id = ?
        AND (
          LOWER(COALESCE(e.role, '')) = 'pj lead'
          OR LOWER(COALESCE(e.role, '')) = 'project lead'
          OR LOWER(COALESCE(e.role, '')) LIKE '%lead%'
          OR LOWER(COALESCE(epp.position_on_project, '')) LIKE '%lead%'
          OR LOWER(COALESCE(epp.position_on_project, '')) LIKE '%manager%'
          OR LOWER(COALESCE(e.position, '')) LIKE '%lead%'
          OR LOWER(COALESCE(e.position, '')) LIKE '%manager%'
        )
    `, [projectId]);

    res.json(leads);
  } catch (error) {
    console.error('Error fetching project leads:', error);
    res.status(500).json({ message: 'Error fetching project leads' });
  }
});

// DEBUG: detailed info to help diagnose PJ lead visibility issues
// Returns: projectIds, employee_project_positions rows for this pj lead,
// assigned leaves (where assigned_pj_lead = pjLeadId), and candidate leaves
// that match either project membership or assignment (no status filtering).
app.get('/api/leaves/pj-lead/debug', authenticateToken, async (req, res) => {
  try {
    const pjLeadId = req.user.id;

    // Projects where user is marked as lead
    const [projects] = await db.query(
      `SELECT DISTINCT project_id, position_on_project FROM employee_project_positions WHERE employee_id = ?`,
      [pjLeadId]
    );
    const projectIds = projects.map(p => p.project_id);

    // All employee_project_positions for team members in those projects
    let teamRows = [];
    if (projectIds.length) {
      const [rows] = await db.query(
        `SELECT * FROM employee_project_positions WHERE project_id IN (?)`,
        [projectIds]
      );
      teamRows = rows;
    }

    // Leaves explicitly assigned to this PJ lead
    const [assignedLeaves] = await db.query(
      `SELECT l.*, e.employee_name as employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.assigned_pj_lead = ?`,
      [pjLeadId]
    );

    // Candidate leaves: either belonging to employees who are in the projects OR assigned to this PJ lead
    let candidateLeaves = [];
    if (projectIds.length) {
      // Use EXISTS to avoid duplicate rows when employees have multiple project assignments
      const [c] = await db.query(
        `SELECT l.*, e.employee_name as employee_name FROM leaves l
         JOIN employees e ON l.employee_id = e.id
         WHERE (l.assigned_pj_lead = ? OR EXISTS (
           SELECT 1 FROM employee_project_positions epp2 WHERE epp2.employee_id = e.id AND epp2.project_id IN (?)))
         AND l.employee_id != ?
         ORDER BY l.created_at DESC`,
        [pjLeadId, projectIds, pjLeadId]
      );
      candidateLeaves = c;
    } else {
      // No projects: return assigned leaves only as candidate set
      candidateLeaves = assignedLeaves;
    }

    return res.json({
      projectIds,
      projectRows: projects,
      teamRows,
      assignedLeaves,
      candidateLeaves,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('PJ-LEAD-DEBUG ERROR:', err);
    res.status(500).json({ message: 'Debug query failed', error: err.message });
  }
});

// Notifications: birthdays and annual counts/lists (admin)
app.get('/api/notifications/birthdays', authenticateToken, async (req, res) => {
  try {
    const userRole = (req.user && req.user.role || '').toString().toLowerCase();
    const userId = req.user && req.user.id;

    const today = new Date();
    const m = today.getMonth() + 1;
    const d = today.getDate();

    // Return all today's birthdays for authenticated users (admins, pj leads, and employees).
    // Note: the UI can opt to hide the current user's own birthday (EmployeeDashboard passes `excludeCurrentUser={true}`).
    try {
      const [rows] = await db.query(
        `SELECT id, employee_name, DATE_FORMAT(real_birth_date, '%Y-%m-%d') AS real_birth_date, DATE_FORMAT(birth_date_on_nrc, '%Y-%m-%d') AS birth_date_on_nrc FROM employees
         WHERE (real_birth_date IS NOT NULL AND MONTH(real_birth_date) = ? AND DAY(real_birth_date) = ?)
            OR (birth_date_on_nrc IS NOT NULL AND MONTH(birth_date_on_nrc) = ? AND DAY(birth_date_on_nrc) = ?)`,
        [m, d, m, d]
      );
      return res.json({ count: Array.isArray(rows) ? rows.length : 0, rows });
    } catch (sqlErr) {
      console.warn('Birthday SQL fallback:', sqlErr.message);
      const [emps] = await db.query("SELECT id, employee_name, DATE_FORMAT(real_birth_date, '%Y-%m-%d') AS real_birth_date, DATE_FORMAT(birth_date_on_nrc, '%Y-%m-%d') AS birth_date_on_nrc FROM employees");
      const out = (emps || []).filter((e) => {
        const bd = e.real_birth_date || e.birth_date_on_nrc || null;
        if (!bd) return false;
        const dt = new Date(bd);
        if (isNaN(dt.getTime())) return false;
        return dt.getMonth() + 1 === m && dt.getDate() === d;
      });
      return res.json({ count: out.length, rows: out });
    }
  } catch (err) {
    console.error('Error /api/notifications/birthdays:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Simple health check for debugging
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/notifications/annual', authenticateToken, async (req, res) => {
  try {
    const userRole = (req.user && req.user.role || '').toString().toLowerCase();
    const userId = req.user && req.user.id;

    // If employee, return only their own annual info if it's their joined anniversary
    if (userRole === 'employee') {
      try {
        // Select joined_date to check for anniversary
        const [empRows] = await db.query("SELECT id, employee_name, remaining_annual_leave, DATE_FORMAT(joined_date, '%Y-%m-%d') AS joined_date FROM employees WHERE id = ?", [userId]);

        if (!empRows || empRows.length === 0) return res.json({ count: 0, rows: [] });

        const e = empRows[0];
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const jd = new Date(e.joined_date);

        // Check for joined date anniversary
        if (!isNaN(jd.getTime()) && jd.getMonth() + 1 === m && jd.getDate() === d) {
          // Set a property to explicitly mark this as an anniversary notification
          e.occasion = 'anniversary';
          return res.json({ count: 1, rows: [e] });
        }

        return res.json({ count: 0, rows: [] });

      } catch (errEmp) {
        console.warn('/api/notifications/annual employee check failed:', errEmp.message);
        return res.json({ count: 0, rows: [] });
      }
    }

    // For admin or pj lead, ONLY return employees whose joined_date anniversary is today
    if (userRole.includes('admin') || userRole.includes('pj') && userRole.includes('lead')) {
      try {
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();

        // Fetch all non-admin employees to check their joined_date locally
        // We must include joined_date in the select
        const [emps] = await db.query('SELECT id, employee_name, remaining_annual_leave, joined_date FROM employees WHERE LOWER(COALESCE(role,\'\')) <> \"admin\"');

        const anniversaryEmployees = (emps || []).filter((e) => {
          if (!e.joined_date) return false;

          const jd = new Date(e.joined_date);
          if (isNaN(jd.getTime())) return false;

          // Check if month and day match
          return jd.getMonth() + 1 === m && jd.getDate() === d;
        }).map(e => ({
          ...e,
          occasion: 'anniversary' // Explicitly mark the occasion for frontend filtering
        }));

        // Note: If you need to include low leave count as well, the logic here would need to merge two separate query results.
        // For the sidebar badge (Wishes), we focus only on anniversaries.

        return res.json({ count: anniversaryEmployees.length, rows: anniversaryEmployees });
      } catch (err2) {
        console.error('Annual anniversary check error:', err2);
        return res.json({ count: 0, rows: [] });
      }
    }

    return res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    console.error('Error /api/notifications/annual:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST a wish/message for an employee (persisted)
app.post('/api/notifications/wish', authenticateToken, async (req, res) => {
  try {
    const userRole = (req.user && req.user.role || '').toString().toLowerCase();
    const createdBy = req.user && req.user.id;
    if (userRole !== 'admin') return res.status(403).json({ message: 'Only admins can send wishes' });

    const { employee_id, message } = req.body;
    if (!employee_id || !message) return res.status(400).json({ message: 'employee_id and message are required' });

    // Ensure table exists with desired columns (occasion, is_read)
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS employee_wishes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          employee_id INT NOT NULL,
          message_template TEXT NOT NULL,
          created_by INT NOT NULL,
          occasion VARCHAR(32) DEFAULT 'other',
          is_read TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (createErr) {
      console.warn('Could not ensure employee_wishes table exists:', createErr.message);
    }

    // Insert wish including occasion when provided
    const [ins] = await db.query(
      'INSERT INTO employee_wishes (employee_id, message_template, created_by, occasion) VALUES (?, ?, ?, ?)',
      [employee_id, message, createdBy, req.body?.occasion || 'other']
    );

    // Return the inserted row with sender name
    const [row] = await db.query(
      `SELECT w.*, e.employee_name AS created_by_name
       FROM employee_wishes w
       LEFT JOIN employees e ON e.id = w.created_by
       WHERE w.id = ?`,
      [ins.insertId]
    );
    return res.status(201).json(row[0]);
  } catch (err) {
    console.error('Error /api/notifications/wish:', err);
    res.status(500).json({ message: 'Server error saving wish' });
  }
});

// GET wishes for an employee
app.get('/api/notifications/wishes/:employeeId', authenticateToken, async (req, res) => {
  try {
    const viewerRole = (req.user && req.user.role || '').toString().toLowerCase();
    const viewerId = req.user && req.user.id;
    const { employeeId } = req.params;

    // Admins and the employee themselves can view wishes; PJ leads can view wishes for their team members
    if (viewerRole !== 'admin' && Number(viewerId) !== Number(employeeId)) {
      // check if pj lead for the employee's main project
      const [isLead] = await db.query(
        `SELECT 1 FROM employee_project_positions epp
         JOIN employees e ON e.id = epp.employee_id
         WHERE e.id = ? AND epp.project_id IN (
           SELECT project_id FROM employee_project_positions WHERE employee_id = ? AND (LOWER(position_on_project) LIKE '%lead%')
         ) LIMIT 1`,
        [employeeId, viewerId]
      );
      // If not lead, forbid
      if (!isLead || isLead.length === 0) return res.status(403).json({ message: 'Forbidden' });
    }

    const [rows] = await db.query(
      `SELECT w.*, e.employee_name AS created_by_name
       FROM employee_wishes w
       LEFT JOIN employees e ON e.id = w.created_by
       WHERE w.employee_id = ?
       ORDER BY w.created_at DESC`,
      [employeeId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching wishes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET LEAVES FOR THE CURRENTLY LOGGED-IN EMPLOYEE
app.get("/api/leaves/employee/me", authenticateToken, async (req, res) => {
  const employeeId = req.user.id; // Get from token
  console.log('🔍 DEBUG: Fetching leaves for employee ID:', employeeId);

  try {
    console.log('🔍 DEBUG: Executing query: SELECT leaves with approver names for employee', employeeId);
    const [leaves] = await db.query(
      `SELECT l.*, 
              a.employee_name AS approved_by_admin_name,
              pj.employee_name AS approved_by_pj_lead_name
       FROM leaves l
       LEFT JOIN employees a ON l.approved_by_admin = a.id
       LEFT JOIN employees pj ON l.approved_by_pj_lead = pj.id
       WHERE l.employee_id = ?
       ORDER BY l.created_at DESC`,
      [employeeId]
    );
    console.log('🔍 DEBUG: Query result:', leaves.length, 'leaves found for employee', employeeId);
    if (leaves.length > 0) {
      console.log('🔍 DEBUG: Leave details:', leaves);
    }
    res.json(leaves);
  } catch (err) {
    console.error("Error fetching employee leaves:", err);
    res.status(500).json({ message: "Error fetching leaves." });
  }
});

// Create leave with optional single file upload under field name "medical_certificate"
app.post("/api/leaves", authenticateToken, upload.single('medical_certificate'), async (req, res) => {
  try {
    const { start_date, end_date, leave_type, reason } = req.body;
    const employee_id = req.user.id;

    // Validate required fields
    if (!start_date || !end_date || !leave_type) {
      return res.status(400).json({
        message: "Missing required fields",
        required: ["start_date", "end_date", "leave_type"]
      });
    }

    // --- Annual Leave Eligibility: must be 3 months past joined_date ---
    if ((leave_type || '').toUpperCase() === 'AL') {
      const [empRows] = await db.query("SELECT joined_date FROM employees WHERE id = ?", [employee_id]);
      const joinedDate = empRows[0]?.joined_date ? new Date(empRows[0].joined_date) : null;
      if (joinedDate && !isNaN(joinedDate.getTime())) {
        const eligibilityDate = new Date(joinedDate);
        eligibilityDate.setMonth(eligibilityDate.getMonth() + 3);
        const requestedStart = new Date(start_date);
        if (requestedStart < eligibilityDate) {
          return res.status(400).json({
            message: `Annual Leave not eligible until ${eligibilityDate.toISOString().split('T')[0]}`,
            code: 'AL_NOT_ELIGIBLE',
            eligible_from: eligibilityDate.toISOString().split('T')[0]
          });
        }
      }
    }

    // Normalize start/end to date-only (YYYY-MM-DD) for overlap checks and storage
    const normalizedStart = toDateOrNull(start_date);
    const normalizedEnd = toDateOrNull(end_date);
    console.log(`POST /api/leaves: employee=${employee_id} start_date(raw)='${start_date}' end_date(raw)='${end_date}' normalizedStart='${normalizedStart}' normalizedEnd='${normalizedEnd}'`);

    // Check for date overlap (excluding rejected leaves)
    const [overlapping] = await db.query(
      `SELECT id, start_date, end_date, status FROM leaves 
       WHERE employee_id = ? 
         AND LOWER(status) != 'rejected'
         AND (
           (DATE(start_date) BETWEEN ? AND ?) 
           OR (DATE(end_date) BETWEEN ? AND ?)
           OR (? <= DATE(start_date) AND ? >= DATE(end_date))
         )`,
      [employee_id, normalizedStart, normalizedEnd, normalizedStart, normalizedEnd, normalizedStart, normalizedEnd]
    );

    if (overlapping.length > 0) {
      console.log('POST /api/leaves: overlap detected for employee=', employee_id, 'existing:', overlapping);
      return res.status(409).json({
        message: "Leave request already exit.",
        overlaps: overlapping
      });
    }

    // Handle file upload if present
    let medical_certificate_url = null;
    if (req.file) {
      medical_certificate_url = `/uploads/${req.file.filename}`;
    }

    // Normalize and validate leave_type client-provided value
    let normalizedLeaveType = (leave_type || '').toUpperCase();

    // Some deployments historically used 'HUL' while others used 'HUPL'.
    // We'll consult the database column metadata (if possible) to pick a compatible value
    // to avoid "Data truncated" warnings when inserting.
    const ALLOWED_LEAVE_TYPES = ['AL', 'ML', 'UPL', 'HML', 'HEL', 'HUPL', 'HUL'];
    if (!ALLOWED_LEAVE_TYPES.includes(normalizedLeaveType)) {
      return res.status(400).json({ message: `Invalid or unsupported leave_type: ${leave_type}` });
    }

    // Determine the actual value to insert by inspecting the column definition
    let insertLeaveType = normalizedLeaveType;
    try {
      const [colInfo] = await db.query(
        `SELECT COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leaves' AND COLUMN_NAME = 'leave_type'`
      );
      const info = Array.isArray(colInfo) && colInfo.length ? colInfo[0] : null;
      if (info) {
        const columnType = info.COLUMN_TYPE || '';
        const charMax = info.CHARACTER_MAXIMUM_LENGTH;

        // If column is ENUM, try to pick a matching enum value
        const enumMatch = columnType.match(/^enum\((.*)\)$/i);
        if (enumMatch) {
          // Parse enum values like '"AL","ML","HUL"'
          const opts = enumMatch[1].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(s => s.trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, ''));
          // Prefer exact match
          if (opts.includes(normalizedLeaveType)) {
            insertLeaveType = normalizedLeaveType;
          } else {
            // Try common variants for HUL/HUPL
            if (['HUPL', 'HUL'].includes(normalizedLeaveType)) {
              if (opts.includes('HUL')) insertLeaveType = 'HUL';
              else if (opts.includes('HUPL')) insertLeaveType = 'HUPL';
            }
            // Fallback: if any enum value startsWith the first 3 chars, pick that
            if (!opts.includes(insertLeaveType)) {
              const short = normalizedLeaveType.slice(0, 3);
              const found = opts.find(o => o.slice(0, 3) === short);
              if (found) insertLeaveType = found;
            }
          }
        } else if (charMax && normalizedLeaveType.length > charMax) {
          // If it's a varchar/char with small size, truncate to fit
          insertLeaveType = normalizedLeaveType.slice(0, charMax);
        }
      }
    } catch (metaErr) {
      // If we can't access INFORMATION_SCHEMA, fall back to conservative mapping
      if (normalizedLeaveType === 'HUPL') insertLeaveType = 'HUL';
    }

    // Final sanity: ensure insertLeaveType is short enough (avoid server errors)
    if (typeof insertLeaveType === 'string' && insertLeaveType.length > 8) {
      insertLeaveType = insertLeaveType.slice(0, 8);
    }

    // Determine the employee's main project and try to find a PJ lead for assignment
    let assignedPjLeadId = null;
    // Also detect if the submitting employee is themselves a PJ lead so we can auto-approve PJ stage
    let creatorIsPjLead = false;
    try {
      const [empRows] = await db.query('SELECT main_pj_id, role, position FROM employees WHERE id = ?', [employee_id]);
      const mainPjId = empRows && empRows[0] ? empRows[0].main_pj_id : null;
      const empRole = empRows && empRows[0] ? empRows[0].role : null;
      const empPosition = empRows && empRows[0] ? empRows[0].position : null;
      // If the creator has 'lead' in role or position, treat them as PJ lead
      creatorIsPjLead = /\blead\b/i.test(String(empRole || '')) || /\blead\b/i.test(String(empPosition || ''));
      if (mainPjId) {
        const [leads] = await db.query(
          `SELECT e.id FROM employees e
           JOIN employee_project_positions epp ON e.id = epp.employee_id
           WHERE epp.project_id = ?
             AND (
               LOWER(epp.position_on_project) LIKE '%lead%'
               OR LOWER(e.position) LIKE '%lead%'
               OR LOWER(e.role) LIKE '%lead%'
             )
           LIMIT 1`,
          [mainPjId]
        );
        if (leads && leads.length) assignedPjLeadId = leads[0].id;
      }
    } catch (assignErr) {
      console.warn('Failed to lookup assigned PJ lead (non-fatal):', assignErr.message);
    }

    console.log(`CREATE LEAVE: user=${employee_id} creatorIsPjLead=${creatorIsPjLead} assignedPjLeadId=${assignedPjLeadId} insertLeaveType=${insertLeaveType}`);

    // Insert leave request (use insertLeaveType) and mark it as pending PJ lead approval by default
    // Also set admin_approval_status to 'Pending' so admin UI can differentiate
    // Ensure `assigned_pj_lead` column exists; if not, create it so we can persist assignment
    try {
      const [col] = await db.query("SHOW COLUMNS FROM leaves LIKE 'assigned_pj_lead'");
      if (!col || col.length === 0) {
        await db.query('ALTER TABLE leaves ADD COLUMN assigned_pj_lead INT NULL');
        console.log('Added column assigned_pj_lead to leaves table (migration)');
      }
    } catch (colErr) {
      console.warn('Could not ensure assigned_pj_lead column exists (non-fatal):', colErr.message);
    }

    // If the creator is a PJ lead, auto-mark PJ stage as Approved so it routes to admin directly
    const initialPjLeadStatus = creatorIsPjLead ? 'Approved' : 'Pending';
    const [result] = await db.query(
      `INSERT INTO leaves 
       (employee_id, start_date, end_date, leave_type, reason, medical_certificate_url, status, pj_lead_status, admin_approval_status, assigned_pj_lead)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'Pending', ?)`,
      [employee_id, start_date, end_date, insertLeaveType, reason, medical_certificate_url, initialPjLeadStatus, assignedPjLeadId]
    );

    // Get the created leave with employee details
    const [newLeave] = await db.query(
      `SELECT l.*, e.employee_name as employee_name 
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       WHERE l.id = ?`,
      [result.insertId]
    );

    res.status(201).json(newLeave[0]);
    console.log('CREATE LEAVE RESULT:', { insertId: result.insertId, newLeave: newLeave[0] });
  } catch (error) {
    console.error("Error creating leave:", error);
    res.status(500).json({
      message: "Error creating leave request",
      error: error.message
    });
  }
});

// PJ Lead approve/reject endpoint
app.patch('/api/leaves/pj/:id', authenticateToken, async (req, res) => {
  const pjId = req.user.id;
  const leaveId = req.params.id;
  // Accept multiple field names for compatibility with different frontends
  const incomingStatus = req.body.pj_approval_status || req.body.pj_approval || req.body.action || req.body.status;
  const approvedLeaveDays = req.body.approved_leave_days || req.body.approved_days;
  console.log(`PJ PATCH: user=${pjId} leaveId=${leaveId} incomingStatus=${incomingStatus} approvedLeaveDays=${approvedLeaveDays} body=${JSON.stringify(req.body)}`);

  try {
    const [rows] = await db.query(
      `SELECT l.*, e.main_pj_id FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
      [leaveId]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Leave not found' });
    const leave = rows[0];

    // Check explicit assigned pj lead first
    if (leave.assigned_pj_lead && Number(leave.assigned_pj_lead) !== Number(pjId)) {
      // If assigned and doesn't match, deny
      console.log(`PJ PATCH DENY: leave.assigned_pj_lead=${leave.assigned_pj_lead} acting=${pjId}`);
      return res.status(403).json({ message: 'Not authorized to approve this leave' });
    }

    // If not assigned, ensure the user is a lead on the employee's main project
    if (!leave.assigned_pj_lead) {
      const [leadCheck] = await db.query(
        `SELECT 1 FROM employee_project_positions epp
         WHERE epp.project_id = ? AND epp.employee_id = ? AND (LOWER(epp.position_on_project) LIKE '%lead%' OR LOWER(epp.position_on_project) LIKE '%pj lead%') LIMIT 1`,
        [leave.main_pj_id, pjId]
      );
      if (!leadCheck || leadCheck.length === 0) {
        // Fallback: some setups store a user's main project and role/position on the employees table
        try {
          const [empRows] = await db.query('SELECT main_pj_id, role, position, employee_name FROM employees WHERE id = ?', [pjId]);
          const emp = empRows && empRows.length ? empRows[0] : null;
          const empMainPj = emp ? emp.main_pj_id : null;
          const empRole = emp ? String(emp.role || '') : '';
          const empPosition = emp ? String(emp.position || '') : '';

          const looksLikeLead = /lead/i.test(empRole) || /lead/i.test(empPosition) || /pj lead/i.test(empPosition);
          if (!(looksLikeLead && empMainPj && Number(empMainPj) === Number(leave.main_pj_id))) {
            console.log('PJ PATCH DENY: not a project lead for employee main_pj_id=', leave.main_pj_id, 'actingEmpMainPj=', empMainPj, 'role=', empRole, 'position=', empPosition);
            return res.status(403).json({ message: 'Not authorized to approve this leave' });
          }
          // Otherwise allow through (user appears to be lead for same main project)
        } catch (fallbackErr) {
          console.log('PJ PATCH DENY (fallback check failed):', fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr);
          return res.status(403).json({ message: 'Not authorized to approve this leave' });
        }
      }
    }

    const normalized = (incomingStatus || '').toString().trim().toLowerCase();
    if (!normalized) return res.status(400).json({ message: 'No action provided' });

    if (normalized === 'approved' || normalized === 'approve') {
      await db.query(
        `UPDATE leaves SET pj_lead_status = 'Approved', approved_by_pj_lead = ?, pj_approval_date = NOW(), approved_days = COALESCE(?, approved_days), status = 'pending', admin_approval_status = 'Pending' WHERE id = ?`,
        [pjId, approvedLeaveDays || null, leaveId]
      );
      console.log(`PJ PATCH: leave ${leaveId} approved by pj=${pjId}`);
      const [updated] = await db.query(`SELECT l.*, e.employee_name as employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`, [leaveId]);
      return res.json(updated[0]);
    }

    if (normalized === 'rejected' || normalized === 'reject') {
      await db.query(
        `UPDATE leaves SET pj_lead_status = 'Rejected', approved_by_pj_lead = ?, pj_approval_date = NOW(), status = 'rejected', admin_approval_status = 'Rejected' WHERE id = ?`,
        [pjId, leaveId]
      );
      console.log(`PJ PATCH: leave ${leaveId} rejected by pj=${pjId}`);
      const [updated] = await db.query(`SELECT l.*, e.employee_name as employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`, [leaveId]);
      return res.json(updated[0]);
    }

    return res.status(400).json({ message: 'Invalid action for PJ lead' });
  } catch (err) {
    console.error('Error in PJ lead patch:', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Failed to update leave', error: err?.message || String(err) });
  }
});

// Bulk import employees from CSV
// CSV columns (case-insensitive):
// employee_name,email,password,role,position,main_pj_id,main_pj_position,other_projects,wfh_office,joined_date,marital_status,nrc_no,probation_period,after_probation,real_birth_date,birth_date_on_nrc,kbz_bank_account,bank,bank_acc,contact_no,parents_contact_no,current_address,address,contract_date,contract_by
app.post('/api/employees/import', authenticateToken, importUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required under field name "file".' });
    }
    const pathToFile = req.file.path;
    const originalName = req.file.originalname.toLowerCase();
    let csvText = '';

    // If Excel, parse first sheet to CSV using xlsx library
    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(pathToFile);
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        csvText = XLSX.utils.sheet_to_csv(firstSheet, { FS: ',', RS: '\n' });
      } catch (excelErr) {
        console.error('Excel parse error:', excelErr);
        return res.status(400).json({ message: 'Failed to parse Excel file', error: excelErr.message });
      }
    } else {
      csvText = fs.readFileSync(pathToFile, 'utf8');
    }

    // Simple CSV parser that respects basic quoted fields
    const parseCsvLine = (line) => {
      const out = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { // escaped quote
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };

    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ message: 'CSV must include a header and at least one data row.' });
    }

    // Parse and normalize header: trim, lowercase and remove BOM/zero-width chars
    const rawHeader = parseCsvLine(lines[0]);
    const header = rawHeader.map((h) =>
      String(h || '')
        .replace(/\uFEFF|[\u200B-\u200D]/g, '') // strip BOM and zero-width spaces
        .trim()
        .toLowerCase()
    );
    const idx = (name) => header.indexOf(String(name).toLowerCase());
    const aliasMap = {
      employee_name: ['employee data', 'name'],
      // Allow flexible main project column naming in import CSV/XLSX
      // "main_pj_id" remains the canonical DB column; aliases map to it.
      main_pj_id: ['project', 'main project', 'main_pj', 'main pj', 'main_project', 'main project id', 'main pj id'],
      main_pj_position: ['main position', 'main project position'],
      other_projects: ['other project', 'other projects', 'additional projects', 'secondary projects'],
      wfh_office: ['wfh/office', 'wfh status', 'wfh'],
      joined_date: ['joined date'],
      marital_status: ['marital status'],
      nrc_no: ['nrc no.', 'nrc no'],
      probation_period: ['probation period'],
      after_probation: ['after probation'],
      real_birth_date: ['real birth date'],
      birth_date_on_nrc: ['birth date on nrc'],
      kbz_bank_account: ['kbz bank account'],
      bank_acc: ['bank acc'],
      contact_no: ['contact no.', 'contact no'],
      parents_contact_no: ["parent's contact no.", 'parents contact no'],
      current_address: ['current address'],
      contract_date: ['contract date'],
      contract_by: ['contract by'],
    };
    const getVal = (cols, name) => {
      let i = idx(name);
      if (i >= 0) return cols[i];
      const aliases = aliasMap[name] || [];
      for (const alt of aliases) {
        const j = idx(alt);
        if (j >= 0) return cols[j];
      }
      return '';
    };

    const hasHeader = (name) => {
      if (idx(name) >= 0) return true;
      const aliases = aliasMap[name] || [];
      return aliases.some((alt) => idx(alt) >= 0);
    };

    const normalizeWFH = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!s) return null;
      if (s.startsWith('work from')) return 'WFH';
      if (s === 'wfh') return 'WFH';
      if (s === 'office') return 'Office';
      return v;
    };

    const normalizeNumber = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).replace(/,/g, '').trim();
      return s || null;
    };

    const normalizeDate = (v) => {
      const s = String(v || '').trim();
      if (!s) return null; // blank -> NULL (avoid writing '')
      // dd.mm.yyyy or dd/mm/yyyy -> yyyy-mm-dd
      let m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return `${yyyy}-${mm}-${dd}`;
      }
      // Accept common US format M/D/YY or M/D/YYYY (e.g., 1/20/24 or 01/20/2024)
      m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
      if (m) {
        let [, mm, dd, yy] = m;
        mm = mm.padStart(2, '0');
        dd = dd.padStart(2, '0');
        if (yy.length === 2) {
          // Use a century pivot to decide 19xx vs 20xx.
          // If two-digit year is <= currentYear%100, assume 2000s, else 1900s.
          const two = parseInt(yy, 10);
          const cutoff = new Date().getFullYear() % 100;
          if (!isNaN(two)) {
            yy = two <= cutoff ? String(2000 + two) : String(1900 + two);
          } else {
            yy = `20${yy}`;
          }
        }
        return `${yy}-${mm}-${dd}`;
      }
      // If we detect an obviously invalid date placeholder like '--' or '0000-00-00'
      if (/^0{4}-0{2}-0{2}$/.test(s) || /^[-]+$/.test(s)) return null;
      return s; // assume already ISO or acceptable
    };

    // Helper to compute next TMD
    const [lastEmployee] = await db.query('SELECT TMD FROM employees ORDER BY id DESC LIMIT 1');
    let nextNum = 1;
    if (lastEmployee.length > 0 && lastEmployee[0].TMD) {
      const n = parseInt(String(lastEmployee[0].TMD).replace('TMD', ''), 10);
      nextNum = isNaN(n) ? 1 : n + 1;
    }
    const nextTMD = () => `TMD${String(nextNum++).padStart(3, '0')}`;

    let created = 0, updated = 0;
    const errors = [];

    // Detect if file includes a main project column to avoid wiping main project when not provided
    const hasMainProjectColumn = hasHeader('main_pj_id');

    for (let li = 1; li < lines.length; li++) {
      try {
        const cols = parseCsvLine(lines[li]);
        // Skip completely empty lines. Excel/CSV exports may include rows like ",,," which
        // produce multiple empty columns; treat those as empty and skip them.
        if (cols.length === 1 && cols[0] === '') continue; // legacy single-empty-cell check
        if (cols.every((c) => String(c || '').trim() === '')) continue; // skip rows where all columns are empty

        const employee_name = getVal(cols, 'employee_name');
        const email = getVal(cols, 'email');
        if (!employee_name || !email) {
          errors.push({ line: li + 1, message: 'Missing required employee_name or email' });
          continue;
        }

        const passwordPlain = getVal(cols, 'password') || 'Password@123';
        const role = (getVal(cols, 'role') || 'employee').toLowerCase();
        const position = getVal(cols, 'position') || null;
        // Only read main project if header exists; otherwise preserve existing DB value on update
        let main_pj_id = hasMainProjectColumn ? (getVal(cols, 'main_pj_id') || null) : undefined; // may be a name like MOT
        const main_pj_position = hasMainProjectColumn ? (getVal(cols, 'main_pj_position') || null) : undefined;
        const wfh_office = normalizeWFH(getVal(cols, 'wfh_office'));
        const joined_date = normalizeDate(getVal(cols, 'joined_date'));
        const marital_status = getVal(cols, 'marital_status') || null;
        const nrc_no = getVal(cols, 'nrc_no') || null;
        const probation_period = normalizeNumber(getVal(cols, 'probation_period'));
        const after_probation = normalizeNumber(getVal(cols, 'after_probation'));
        const real_birth_date = normalizeDate(getVal(cols, 'real_birth_date'));
        const birth_date_on_nrc = normalizeDate(getVal(cols, 'birth_date_on_nrc'));
        const kbz_bank_account = getVal(cols, 'kbz_bank_account') || null;
        const bank = getVal(cols, 'bank') || null;
        const bank_acc = getVal(cols, 'bank_acc') || null;
        const contact_no = getVal(cols, 'contact_no') || null;
        const parents_contact_no = getVal(cols, 'parents_contact_no') || null;
        const current_address = getVal(cols, 'current_address') || null;
        const address = getVal(cols, 'address') || null;
        const contract_date = normalizeDate(getVal(cols, 'contract_date'));
        const contract_by = getVal(cols, 'contract_by') || null;

        // Parse other project assignments (comma-separated list of names). Will assign default position 'Employee'.
        const hasOtherProjectsColumn = hasHeader('other_projects');
        const otherProjectsRaw = hasOtherProjectsColumn ? getVal(cols, 'other_projects') : null;
        // Support formats:
        // - "ProjA" (defaults position to 'Employee')
        // - "ProjA:Lead" or "ProjA - Lead" or "ProjA|Lead"
        const otherProjectEntries = (otherProjectsRaw || '')
          .split(/[,;]+/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((entry) => {
            const m = entry.match(/^(.*?)\s*(?::|\||\s-\s)\s*(.+)$/);
            if (m) {
              return { name: m[1].trim(), position: m[2].trim() || 'Employee' };
            }
            return { name: entry, position: 'Employee' };
          });

        // Ensure main project exists; support plain name
        let final_main_pj_id = main_pj_id;
        if (hasMainProjectColumn) {
          const raw = (final_main_pj_id ?? '').toString().trim();
          if (!raw) {
            final_main_pj_id = null; // explicit clear if column provided but empty
          } else if (isNaN(parseInt(raw))) {
            const [existingProject] = await db.query('SELECT id FROM projects WHERE name = ?', [String(raw)]);
            if (existingProject.length > 0) {
              final_main_pj_id = existingProject[0].id;
            } else {
              const [newProject] = await db.query('INSERT INTO projects (name) VALUES (?)', [String(raw)]);
              final_main_pj_id = newProject.insertId;
            }
          } else {
            final_main_pj_id = parseInt(raw);
          }
        }

        // Upsert by email
        const [existing] = await db.query('SELECT id FROM employees WHERE email = ?', [email]);
        if (existing.length > 0) {
          // Update fields; only touch main project columns if header present
          const updateFields = [
            'employee_name = ?', 'role = ?', 'position = ?', 'wfh_office = ?', 'joined_date = ?',
            'marital_status = ?', 'nrc_no = ?', 'probation_period = ?', 'after_probation = ?', 'real_birth_date = ?', 'birth_date_on_nrc = ?',
            'kbz_bank_account = ?', 'bank = ?', 'bank_acc = ?', 'contact_no = ?', 'parents_contact_no = ?', 'current_address = ?', 'address = ?', 'contract_date = ?', 'contract_by = ?'
          ];
          const params = [
            employee_name, role, position, wfh_office, joined_date,
            marital_status, nrc_no, probation_period, after_probation, real_birth_date, birth_date_on_nrc,
            kbz_bank_account, bank, bank_acc, contact_no, parents_contact_no, current_address, address, contract_date, contract_by
          ];
          if (hasMainProjectColumn) {
            updateFields.splice(3, 0, 'main_pj_id = ?', 'main_pj_position = ?');
            params.splice(3, 0, final_main_pj_id, (main_pj_position ?? null));
          }
          const sql = `UPDATE employees SET ${updateFields.join(', ')} WHERE id = ?`;
          params.push(existing[0].id);
          await db.query(sql, params);
          const employeeId = existing[0].id;
          // Ensure main project assignment row exists/updated only if header provided
          if (hasMainProjectColumn) {
            try {
              // Remove any previous main assignment rows that don't match new main project
              await db.query('DELETE FROM employee_project_positions WHERE employee_id = ? AND is_main_project = 1 AND (project_id <> ? OR ? IS NULL)', [employeeId, final_main_pj_id, final_main_pj_id]);
              if (final_main_pj_id) {
                // Upsert main assignment row
                const [mainRows] = await db.query('SELECT id FROM employee_project_positions WHERE employee_id = ? AND is_main_project = 1', [employeeId]);
                if (mainRows.length > 0) {
                  await db.query('UPDATE employee_project_positions SET project_id = ?, position_on_project = ? WHERE id = ?', [final_main_pj_id, (main_pj_position || position || null), mainRows[0].id]);
                } else {
                  await db.query('INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, 1)', [employeeId, final_main_pj_id, (main_pj_position || position || null)]);
                }
              }
            } catch (eppErr) {
              console.warn('Failed to sync main project assignment (import update, non-fatal):', eppErr.message);
            }
          }
          if (hasOtherProjectsColumn) {
            // Remove existing non-main assignments to replace with new ones (keep main project row intact)
            try {
              await db.query('DELETE FROM employee_project_positions WHERE employee_id = ? AND is_main_project = 0', [employeeId]);
            } catch (cleanErr) {
              console.warn('Failed to clean old other project assignments (non-fatal):', cleanErr.message);
            }

            // Recreate other project assignments
            for (const { name: projName, position: projPos } of otherProjectEntries) {
              try {
                let projId = null;
                const [projRows] = await db.query('SELECT id FROM projects WHERE name = ?', [projName]);
                if (projRows.length > 0) {
                  projId = projRows[0].id;
                } else {
                  const [newProj] = await db.query('INSERT INTO projects (name) VALUES (?)', [projName]);
                  projId = newProj.insertId;
                }
                await db.query(
                  'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
                  [employeeId, projId, projPos || 'Employee', false]
                );
              } catch (assignErr) {
                console.warn(`Failed to assign other project '${projName}' to employee ${employeeId}:`, assignErr.message);
              }
            }
          }
          updated++;
        } else {
          const hashedPassword = await bcrypt.hash(passwordPlain, 10);
          const TMD = nextTMD();
          const [ins] = await db.query(
            `INSERT INTO employees (
              \`TMD\`, \`employee_name\`, \`password\`, \`role\`, \`position\`, \`main_pj_id\`, \`main_pj_position\`, \`wfh_office\`, \`joined_date\`,
              \`marital_status\`, \`nrc_no\`, \`probation_period\`, \`after_probation\`, \`real_birth_date\`, \`birth_date_on_nrc\`,
              \`kbz_bank_account\`, \`bank\`, \`bank_acc\`, \`email\`, \`contact_no\`, \`parents_contact_no\`, \`current_address\`, \`address\`, \`contract_date\`, \`contract_by\`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              TMD, employee_name, hashedPassword, role, position, final_main_pj_id, main_pj_position, wfh_office, joined_date,
              marital_status, nrc_no, probation_period, after_probation, real_birth_date, birth_date_on_nrc,
              kbz_bank_account, bank, bank_acc, email, contact_no, parents_contact_no, current_address, address, contract_date, contract_by
            ]
          );

          // Also insert main project assignment for new employee via import
          try {
            if (final_main_pj_id) {
              await db.query(
                'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
                [ins.insertId, final_main_pj_id, main_pj_position || position || null, true]
              );
            }
          } catch (eppErr) {
            console.warn('Failed to insert main project assignment (import, non-fatal):', eppErr.message);
          }

          // Insert other project assignments (only if column provided)
          if (hasOtherProjectsColumn) {
            for (const { name: projName, position: projPos } of otherProjectEntries) {
              try {
                let projId = null;
                const [projRows] = await db.query('SELECT id FROM projects WHERE name = ?', [projName]);
                if (projRows.length > 0) {
                  projId = projRows[0].id;
                } else {
                  const [newProj] = await db.query('INSERT INTO projects (name) VALUES (?)', [projName]);
                  projId = newProj.insertId;
                }
                await db.query(
                  'INSERT INTO employee_project_positions (employee_id, project_id, position_on_project, is_main_project) VALUES (?, ?, ?, ?)',
                  [ins.insertId, projId, projPos || 'Employee', false]
                );
              } catch (assignErr) {
                console.warn(`Failed to assign other project '${projName}' to new employee ${ins.insertId}:`, assignErr.message);
              }
            }
          }
          created++;
        }
      } catch (rowErr) {
        errors.push({ line: li + 1, message: rowErr.message });
      }
    }

    // Clean up uploaded file
    try { fs.unlinkSync(pathToFile); } catch { }

    res.json({ created, updated, failed: errors.length, errors });
  } catch (err) {
    console.error('Error importing employees:', err);
    res.status(500).json({ message: 'Error importing employees', error: err.message });
  }
});


// UPDATE LEAVE STATUS
app.put(
  "/api/leaves/:id",
  async (req, res) => {
    const { id } = req.params;
    const { status, leave_type, approver_role, approver_id } = req.body; // Added approver role and id

    // Added 'HUL' for Half Unpaid Leave to align with compliance_status and auto-created leave_type
    const VALID_LEAVE_TYPES = ["AL", "ML", "UPL", "HML", "HEL", "HUPL", "HUL"]; // retain HUPL for backward compatibility
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
          params.push(approver_id); // store the approver's employee ID
          // If PJL rejects, the main status also becomes Rejected.
          if (status === 'Rejected') {
            updateFields.push("status = ?");
            params.push('Rejected');
          }
        }
      } else if (approver_role.toLowerCase() === 'admin' && status === 'Approved') {
        // Admin is giving final approval — set both final status and admin approval fields
        // approved_by_admin stores the approver's employee ID (integer) in the DB
        updateFields.push("status = ?");
        params.push('Approved');
        updateFields.push("admin_approval_status = ?");
        params.push('Approved');
        updateFields.push("approved_by_admin = ?");
        params.push(approver_id);
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

// Add this new route to fetch updated leaves for project leads
app.get('/api/leaves/pj-lead/updated', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // First, get all projects where the current user is a project lead
    // Using employee_project_positions.position_on_project to infer lead role
    const [projects] = await db.query(
      `SELECT p.id 
       FROM projects p
       JOIN employee_project_positions epp ON p.id = epp.project_id
       WHERE epp.employee_id = ? AND (
         LOWER(epp.position_on_project) LIKE '%lead%' OR
         LOWER(epp.position_on_project) LIKE '%pj lead%' OR
         LOWER(epp.position_on_project) LIKE '%project lead%'
       )`,
      [userId]
    );

    if (projects.length === 0) {
      return res.json({ success: true, data: [], count: 0 }); // No projects where user is lead
    }

    const projectIds = projects.map(p => p.id);

    // Get all team members in those projects
    const [teamMembers] = await db.query(
      `SELECT DISTINCT employee_id 
       FROM employee_project_positions 
       WHERE project_id IN (?) AND employee_id != ?`,
      [projectIds, userId]
    );

    if (teamMembers.length === 0) {
      return res.json({ success: true, data: [], count: 0 }); // No team members in projects
    }

    const teamMemberIds = teamMembers.map(m => m.employee_id);

    // Get leaves that have been acted on by PJ lead (Approved or Rejected)
    const [leaves] = await db.query(
      `SELECT l.*, e.employee_name as employee_name, e.email as employee_email,
              p.name as project_name, p.id as project_id
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       LEFT JOIN employee_project_positions epp ON e.id = epp.employee_id
       LEFT JOIN projects p ON epp.project_id = p.id
       WHERE l.employee_id IN (?)
       AND (
         LOWER(COALESCE(l.pj_lead_status, '')) = 'approved'
         OR LOWER(COALESCE(l.pj_lead_status, '')) = 'rejected'
       )
       ORDER BY l.created_at DESC`,
      [teamMemberIds]
    );

    res.json({
      success: true,
      data: leaves,
      count: Array.isArray(leaves) ? leaves.length : 0
    });
  } catch (err) {
    console.error('Error fetching updated leaves:', err);
    res.status(500).json({ message: 'Error fetching updated leaves' });
  }
});

// ADMIN final approval endpoint for a leave
app.patch('/api/leaves/:id/admin-approve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  const adminName = req.user.employee_name || req.user.name || null;
  const { approved_days, comments, override_pj_approval } = req.body;

  try {
    // Fetch leave
    const [leaveRows] = await db.query(
      `SELECT l.*, e.employee_name AS emp_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
      [id]
    );

    if (!leaveRows.length) return res.status(404).json({ message: 'Leave not found' });

    const leave = leaveRows[0];

    // If PJ lead approval is required and not present, and override not set, reject
    // Use `pj_lead_status` (consistent with other code) rather than `pj_approval_status`.
    if (!override_pj_approval && (leave.pj_lead_status || '').toLowerCase() === 'pending') {
      return res.status(400).json({ message: 'PJ Lead approval required before admin approval' });
    }

    // Update admin approval fields and final status
    const updateFields = [
      'admin_approval_status = ?',
      'approved_by_admin = ?',
      'admin_approval_date = NOW()',
      'status = ?'
    ];
    const params = ['Approved', adminId, 'Approved'];

    if (approved_days !== undefined) {
      updateFields.push('approved_days = ?');
      params.push(approved_days);
    }
    if (comments !== undefined) {
      updateFields.push('admin_comments = ?');
      params.push(comments);
    }

    params.push(id);

    await db.query(`UPDATE leaves SET ${updateFields.join(', ')} WHERE id = ?`, params);

    // If it's annual leave, deduct remaining AL
    if (leave.leave_type === 'AL') {
      try {
        const startDate = new Date(leave.start_date);
        const endDate = new Date(leave.end_date);
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        const [empCols] = await db.query("SHOW COLUMNS FROM employees LIKE '%annual_leave%'");
        if (empCols.length === 0) {
          await db.query("ALTER TABLE employees ADD COLUMN total_annual_leave INT DEFAULT 6");
          await db.query("ALTER TABLE employees ADD COLUMN remaining_annual_leave INT DEFAULT 6");
        }

        const [employeeData] = await db.query("SELECT remaining_annual_leave FROM employees WHERE id = ?", [leave.employee_id]);
        if (employeeData.length > 0) {
          const currentRemaining = employeeData[0].remaining_annual_leave || 6;
          const newRemaining = Math.max(0, currentRemaining - daysDiff);
          await db.query("UPDATE employees SET remaining_annual_leave = ? WHERE id = ?", [newRemaining, leave.employee_id]);
        }
      } catch (dedErr) {
        console.error('Error deducting AL on admin approval:', dedErr);
      }
    }

    const [updated] = await db.query(
      `SELECT l.*, e.employee_name as employee_name FROM leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?`,
      [id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Error in admin-approve:', err);
    res.status(500).json({ message: 'Error approving leave' });
  }
});

// --- QA CRUD FOR EMPLOYEES (ADMIN) ---

// GET all QA records for a specific employee
console.log('Registering GET /api/qa route');
app.get('/api/qa', async (req, res) => {
  try {
    const [qaRecords] = await db.query(`
      SELECT qa.*, e.employee_name 
      FROM qa_records qa
      JOIN employees e ON qa.employee_id = e.id
      ORDER BY qa.created_at DESC
    `);
    res.json(qaRecords);
  } catch (error) {
    console.error('Error fetching QA records:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/employees/:employeeId/qa', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [qaRecords] = await db.query(
      'SELECT * FROM qa_records WHERE employee_id = ? ORDER BY created_at DESC',
      [employeeId]
    );
    res.json(qaRecords);
  } catch (error) {
    console.error(`Error fetching QA records for employee ${employeeId}:`, error);
    res.status(500).json({ message: 'Server error fetching QA records.' });
  }
});

// POST a new QA record for an employee
app.post('/api/qa', authenticateToken, async (req, res) => {
  const { employee_id, title, description, qa_score } = req.body;
  const created_by_id = req.user.id; // Admin who is creating the record

  if (!employee_id) {
    return res.status(400).json({ message: 'Employee ID is required.' });
  }

  // If the frontend provided a separate title, fold it into the description
  let finalDescription = description || null;
  if (title) {
    const t = String(title).trim();
    if (t) {
      if (finalDescription) finalDescription = `${t}\n\n${finalDescription}`;
      else finalDescription = t;
    }
  }

  try {
    const [result] = await db.query(
      'INSERT INTO qa_records (employee_id, description, qa_score, created_by_id) VALUES (?, ?, ?, ?)',
      [employee_id, finalDescription, qa_score || null, created_by_id]
    );
    const [newRecord] = await db.query('SELECT * FROM qa_records WHERE id = ?', [result.insertId]);
    res.status(201).json(newRecord[0]);
  } catch (error) {
    console.error('Error creating QA record:', error);
    res.status(500).json({ message: 'Server error creating QA record.' });
  }
});

// PUT (update) an existing QA record
app.put('/api/qa/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, description, qa_score } = req.body;

  // Fold optional title into description if provided
  let finalDescription = description || null;
  if (title) {
    const t = String(title).trim();
    if (t) {
      if (finalDescription) finalDescription = `${t}\n\n${finalDescription}`;
      else finalDescription = t;
    }
  }

  if (finalDescription === null && qa_score === undefined) {
    return res.status(400).json({ message: 'Nothing to update. Provide description and/or qa_score.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE qa_records SET description = ?, qa_score = ? WHERE id = ?',
      [finalDescription, qa_score || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'QA record not found.' });
    }

    const [updatedRecord] = await db.query('SELECT * FROM qa_records WHERE id = ?', [id]);
    res.json(updatedRecord[0]);
  } catch (error) {
    console.error(`Error updating QA record ${id}:`, error);
    res.status(500).json({ message: 'Server error updating QA record.' });
  }
});

// DELETE a QA record
app.delete('/api/qa/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM qa_records WHERE id = ?', [id]);
  res.status(200).json({ success: true, message: 'QA record deleted successfully.' });
});

// --- START SERVER ---
app.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://${HOST}:${PORT}`);
  createDefaultAdmin();
  backfillMainProjects();
}
);
