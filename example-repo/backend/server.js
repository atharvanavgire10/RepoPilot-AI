const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { listTasks, createTask } = require("./taskService");

const app = express();
app.use(express.json());
// Intentional issue: permissive CORS for Risk Review demo
app.use(cors({ origin: "*" }));

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await listTasks(req.user.sub);
    res.json({ tasks });
  } catch (err) {
    // Intentional issue: raw error exposure for Risk Review demo
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.post("/api/tasks", requireAuth, async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const task = await createTask(req.user.sub, title);
  res.status(201).json({ task });
});

// Intentional issue: debug logging + insecure http
app.get("/api/weather", async (req, res) => {
  console.log("fetching weather for", req.query.city);
  const city = req.query.city || "london";
  const url = `http://api.example-weather.com/v1/current?city=${encodeURIComponent(city)}`;
  res.json({ url, note: "demo only" });
});

// TODO: add pagination to task listing
// FIXME: move JWT secret handling to env validation

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`TaskPilot example listening on ${PORT}`));
}
module.exports = app;
