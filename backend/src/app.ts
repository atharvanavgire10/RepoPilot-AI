import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import repositoryRoutes from "./routes/repositories.js";

/**
 * Shared Express application (no listener here).
 * - Local dev / single-service prod: backend/src/index.ts imports this and listens.
 * - Vercel: api/index.ts imports this as a serverless function handler.
 * No API logic is duplicated between entrypoints.
 */
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "RepoPilot AI Backend is running" });
});

app.use("/api/repositories", repositoryRoutes);

// Serve frontend build if present (local single-service prod mode).
// On Vercel this directory is absent, so the JSON 404 below applies to
// unknown /api/* paths while Vercel serves the static frontend itself.
const distCandidates = [
  path.resolve(__dirname, "../../frontend/dist"),
  path.resolve(process.cwd(), "..", "frontend", "dist"),
  path.resolve(process.cwd(), "frontend", "dist"),
];
const frontendDist = distCandidates.find((d) => fs.existsSync(path.join(d, "index.html")));
if (frontendDist) {
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

export default app;
