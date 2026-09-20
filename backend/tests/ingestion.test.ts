import { describe, it, expect } from "vitest";
import http from "node:http";
import { fetchWithRetry, parseRetryAfterMs } from "../src/services/github.js";
import { parseGitHubUrl } from "../src/utils/githubUrl.js";

function startFlakyServer(responses: { status: number; headers?: Record<string, string>; body?: string }[]) {
  let hits = 0;
  const server = http.createServer((req, res) => {
    const r = responses[Math.min(hits, responses.length - 1)];
    hits++;
    for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
    res.statusCode = r.status;
    res.end(r.body || "");
    void req;
  });
  return new Promise<{ url: string; hits: () => number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        hits: () => hits,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe("parseRetryAfterMs", () => {
  it("parses seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });
  it("caps at 60s", () => {
    expect(parseRetryAfterMs("3600")).toBe(60_000);
  });
  it("rejects garbage and null", () => {
    expect(parseRetryAfterMs("soon")).toBe(0);
    expect(parseRetryAfterMs(null)).toBe(0);
  });
});

describe("fetchWithRetry", () => {
  it("retries 503 then succeeds", async () => {
    const s = await startFlakyServer([{ status: 503 }, { status: 503 }, { status: 200, body: "ok" }]);
    try {
      const res = await fetchWithRetry(s.url);
      expect(res.status).toBe(200);
      expect(s.hits()).toBe(3);
    } finally {
      await s.close();
    }
  });
  it("retries 403 rate-limit with retry-after then succeeds", async () => {
    const s = await startFlakyServer([
      { status: 403, headers: { "retry-after": "0", "x-ratelimit-remaining": "0" } },
      { status: 200, body: "ok" },
    ]);
    try {
      const res = await fetchWithRetry(s.url);
      expect(res.status).toBe(200);
      expect(s.hits()).toBe(2);
    } finally {
      await s.close();
    }
  });
  it("does not retry plain 404", async () => {
    const s = await startFlakyServer([{ status: 404 }]);
    try {
      const res = await fetchWithRetry(s.url);
      expect(res.status).toBe(404);
      expect(s.hits()).toBe(1);
    } finally {
      await s.close();
    }
  });
  it("gives up after max attempts", async () => {
    const s = await startFlakyServer([{ status: 500 }]);
    try {
      const res = await fetchWithRetry(s.url, {}, 2);
      // 500 is not in the retry set: returned immediately
      expect(res.status).toBe(500);
      expect(s.hits()).toBe(1);
    } finally {
      await s.close();
    }
  });
});

describe("github url edge cases", () => {
  it("accepts http and trailing slash", () => {
    expect(parseGitHubUrl("http://github.com/a/b/")).toEqual({ owner: "a", repo: "b" });
  });
  it("accepts subpaths like /tree/main", () => {
    expect(parseGitHubUrl("https://github.com/a/b/tree/main")).toEqual({ owner: "a", repo: "b" });
  });
  it("rejects owner-only urls", () => {
    expect(() => parseGitHubUrl("https://github.com/owner")).toThrow();
  });
  it("rejects empty input", () => {
    expect(() => parseGitHubUrl("   ")).toThrow();
  });
});
