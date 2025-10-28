const mysql = require('mysql2/promise'); // Use the promise-based API for async/await


// ✅ Create a connection pool for better performance and management
const pool = mysql.createPool({
host: process.env.DB_HOST || 'localhost',
user: process.env.DB_USER || 'root',
password: process.env.DB_PASSWORD || 'root@localhost', // It's better to keep this in .env
database: process.env.DB_NAME || 'employee_management',
waitForConnections: true,
connectionLimit: 10,
queueLimit: 0,
});


// ✅ Test the connection to confirm it's working
(async () => {
try {
const connection = await pool.getConnection();
console.log('✅ MySQL connected successfully!');
connection.release(); // Always release back to the pool
} catch (err) {
console.error('❌ MySQL connection error:', err.message);
}
})();


module.exports = pool;