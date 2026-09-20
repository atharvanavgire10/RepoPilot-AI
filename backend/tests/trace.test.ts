import { describe, it, expect } from "vitest";
import { traceEndpoint } from "../src/services/trace_arch.js";
import { detectApiRoutes } from "../src/services/analyzer.js";

function file(path: string, content: string) {
  return { path, language: "Other", size: content.length, lineCount: content.split("\n").length, content } as never;
}

const SERVER = `const express = require("express");
const { listTasks } = require("./taskService");
const app = express();
app.get("/api/tasks", async (req, res) => {
  const tasks = await listTasks();
  res.json({ tasks });
});
app.post("/api/tasks", async (req, res) => {
  res.json({ ok: true });
});
`;

const SERVICE = `async function listTasks() {
  const { rows } = await pool.query("SELECT * FROM tasks");
  return rows;
}
module.exports = { listTasks };
`;

const FRONTEND = `export async function fetchTasks() {
  const res = await fetch("/api/tasks");
  return res.json();
}
`;

describe("traceEndpoint", () => {
  it("traces route to service call to frontend with verified flags", () => {
    const files = [file("server.js", SERVER), file("taskService.js", SERVICE), file("api.ts", FRONTEND)];
    const routes = detectApiRoutes(files);
    const { steps, matchedRoute } = traceEndpoint(files, routes, "GET /api/tasks");
    expect(matchedRoute?.path).toBe("/api/tasks");
    const kinds = steps.map((s) => s.kind);
    expect(kinds).toContain("route");
    expect(kinds).toContain("frontend");
    const route = steps.find((s) => s.kind === "route")!;
    expect(route.verified).toBe(true);
    expect(route.file).toBe("server.js");
    const fe = steps.find((s) => s.kind === "frontend")!;
    expect(fe.verified).toBe(true);
    const svcCall = steps.find((s) => s.kind === "service-call")!;
    expect(svcCall.verified).toBe(false);
    expect(svcCall.inferred).toBe(true);
  });
  it("does not bleed POST handler calls into a GET trace", () => {
    const files = [file("server.js", SERVER)];
    const routes = detectApiRoutes(files);
    const { steps } = traceEndpoint(files, routes, "GET /api/tasks");
    const serviceCalls = steps.filter((s) => s.kind === "service-call");
    expect(serviceCalls.map((s) => s.title)).not.toContain("Call createTask(");
  });
  it("resolves a handler defined in another file as verified service", () => {
    const files = [
      file("routes.js", 'const { createOrder } = require("./orders");\nrouter.post("/api/orders", createOrder);\n'),
      file("orders.js", 'async function createOrder(req, res) {\n  await pool.query("INSERT INTO orders DEFAULT VALUES");\n  res.json({});\n}\n'),
    ];
    const routes = detectApiRoutes(files);
    const { steps } = traceEndpoint(files, routes, "POST /api/orders");
    const svc = steps.find((s) => s.kind === "service")!;
    expect(svc.file).toBe("orders.js");
    expect(svc.verified).toBe(true);
    const db = steps.find((s) => s.kind === "database")!;
    expect(db.verified).toBe(false);
    expect(db.inferred).toBe(true);
  });
  it("returns inferred-only fallback when no route matches", () => {
    const files = [file("a.ts", 'fetch("/api/missing-thing")\n')];
    const { steps, matchedRoute } = traceEndpoint(files, [], "/api/missing-thing");
    expect(matchedRoute).toBeUndefined();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.verified === false)).toBe(true);
  });
  it("returns empty steps for blank input", () => {
    expect(traceEndpoint([], [], "  ").steps).toEqual([]);
  });
});
