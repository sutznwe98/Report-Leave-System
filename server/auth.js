const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error(
    "FATAL ERROR: JWT_SECRET is not defined in auth middleware. Please check your .env file."
  );
  process.exit(1);
}

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

module.exports = { authenticateToken, authorizeRole };