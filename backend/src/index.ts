import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import repositoryRoutes from "./routes/repositories.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "RepoPilot AI Backend is running" });
});

app.use("/api/repositories", repositoryRoutes);

// Serve frontend build if present (production single-service deploy)
const frontendDist = path.resolve(process.cwd(), "..", "frontend", "dist");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });
}

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: Request, res: Response) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.VITEST !== "true") {
  app.listen(PORT, () => {
    console.log(`RepoPilot AI Backend listening on port ${PORT}`);
  });
}

export default app;
