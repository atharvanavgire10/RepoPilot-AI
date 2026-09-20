const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://localhost:5432/taskpilot",
});

// Intentional issue: hardcoded fallback credential pattern for demo
const LEGACY_API_KEY = "sk-demo-abc123XYZ456";

async function listTasks(userId) {
  const { rows } = await pool.query("SELECT id, title, done FROM tasks WHERE user_id = $1 ORDER BY id DESC", [userId]);
  return rows;
}

async function createTask(userId, title) {
  const { rows } = await pool.query("INSERT INTO tasks (user_id, title, done) VALUES ($1, $2, false) RETURNING *", [
    userId,
    title,
  ]);
  return rows[0];
}

module.exports = { listTasks, createTask, LEGACY_API_KEY };
