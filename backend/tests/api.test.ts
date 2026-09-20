import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("api hardening", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
  it("rejects invalid github urls with 400", async () => {
    const res = await request(app).post("/api/repositories/analyze").send({ url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/github/i);
  });
  it("rejects missing analyze body with 400", async () => {
    const res = await request(app).post("/api/repositories/analyze").send({});
    expect(res.status).toBe(400);
  });
  it("returns 404 for unknown analysis ids", async () => {
    for (const p of ["/api/repositories/nope", "/api/repositories/nope/files", "/api/repositories/nope/findings", "/api/repositories/nope/architecture"]) {
      const res = await request(app).get(p);
      expect(res.status).toBe(404);
    }
  });
  it("validates ask/trace payloads", async () => {
    const ex = await request(app).post("/api/repositories/analyze").send({ example: true });
    expect(ex.status).toBe(200);
    const id = ex.body.id as string;
    expect(await request(app).post(`/api/repositories/${id}/ask`).send({})).toMatchObject({ status: 400 });
    expect(await request(app).post(`/api/repositories/${id}/trace`).send({})).toMatchObject({ status: 400 });
    expect(await request(app).get(`/api/repositories/${id}/search`)).toMatchObject({ status: 400 });
  });
  it("serves the full example workflow end to end", async () => {
    const ex = await request(app).post("/api/repositories/analyze").send({ example: true });
    const id = ex.body.id as string;
    const files = await request(app).get(`/api/repositories/${id}/files`);
    expect(files.status).toBe(200);
    expect(files.body.files.length).toBeGreaterThan(4);
    const search = await request(app).get(`/api/repositories/${id}/search`).query({ q: "/api/tasks" });
    expect(search.status).toBe(200);
    expect(search.body.results.length).toBeGreaterThan(0);
    const ask = await request(app).post(`/api/repositories/${id}/ask`).send({ question: "How does authentication work?" });
    expect(ask.status).toBe(200);
    expect(ask.body.citations.length).toBeGreaterThan(0);
    const trace = await request(app).post(`/api/repositories/${id}/trace`).send({ target: "GET /api/tasks" });
    expect(trace.status).toBe(200);
    expect(trace.body.steps.length).toBeGreaterThan(0);
    const arch = await request(app).get(`/api/repositories/${id}/architecture`);
    expect(arch.status).toBe(200);
    expect(arch.body.nodes.length).toBeGreaterThan(0);
    const findings = await request(app).get(`/api/repositories/${id}/findings`);
    expect(findings.status).toBe(200);
    expect(findings.body.findings.length).toBeGreaterThan(0);
    const review = await request(app).post(`/api/repositories/${id}/review`).send({ focus: "What to fix first?" });
    expect(review.status).toBe(200);
    expect(review.body.review.length).toBeGreaterThan(0);
  });
  it("rejects oversized json bodies", async () => {
    const big = "x".repeat(2 * 1024 * 1024);
    const res = await request(app).post("/api/repositories/analyze").send({ url: big });
    expect([400, 413, 500]).toContain(res.status);
  });
});
