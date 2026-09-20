import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../src/utils/githubUrl.js";
import { shouldIgnorePath, safeRepoPath } from "../src/utils/fileFilter.js";
import { languageForPath, countLanguages } from "../src/utils/language.js";
import { detectFrameworks } from "../src/utils/frameworks.js";
import { detectApiRoutes } from "../src/services/analyzer.js";
import { detectFindings } from "../src/services/risks.js";
import { searchFiles } from "../src/services/search.js";
import { citation } from "../src/types.js";
import { traceEndpoint } from "../src/services/trace_arch.js";
import { loadExampleRepoFiles } from "../src/services/exampleRepo.js";

describe("github url parsing", () => {
  it("parses standard url", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("parses trailing slash and .git", () => {
    expect(parseGitHubUrl("https://github.com/atharvanavgire10/FieldMind-AI.git")).toEqual({
      owner: "atharvanavgire10",
      repo: "FieldMind-AI",
    });
  });
  it("rejects invalid url", () => {
    expect(() => parseGitHubUrl("https://gitlab.com/a/b")).toThrow();
  });
});

describe("file filtering", () => {
  it("ignores node_modules and binaries", () => {
    expect(shouldIgnorePath("node_modules/foo/index.js")).toBe(true);
    expect(shouldIgnorePath("src/logo.png")).toBe(true);
    expect(shouldIgnorePath("src/index.ts")).toBe(false);
  });
  it("rejects traversal", () => {
    expect(safeRepoPath("../secret")).toBe(false);
    expect(safeRepoPath("src/index.ts")).toBe(true);
  });
});

describe("language detection", () => {
  it("maps extensions", () => {
    expect(languageForPath("a/b.ts")).toBe("TypeScript");
    expect(languageForPath("x/main.py")).toBe("Python");
  });
  it("counts languages", () => {
    expect(countLanguages(["a.ts", "b.ts", "c.py"])).toEqual({ TypeScript: 2, Python: 1 });
  });
});

describe("framework detection", () => {
  it("detects react+express", () => {
    const files = [
      {
        path: "package.json",
        language: "JSON",
        size: 100,
        lineCount: 5,
        content: JSON.stringify({ dependencies: { react: "^18", express: "^4" } }),
      },
    ];
    const fw = detectFrameworks(files as never);
    expect(fw.frameworks).toContain("React");
    expect(fw.frameworks).toContain("Express");
  });
});

describe("api detection", () => {
  it("detects express routes", () => {
    const files = [
      { path: "backend/server.js", language: "JavaScript", size: 200, lineCount: 5, content: "app.get('/api/tasks', handler)\nrouter.post(\"/api/tasks\", create)" },
    ];
    const routes = detectApiRoutes(files as never);
    expect(routes.length).toBe(2);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/api/tasks" });
  });
});

describe("risk detection", () => {
  it("flags eval and http", () => {
    const files = [
      { path: "a.js", language: "JavaScript", size: 50, lineCount: 2, content: "eval(userInput)\nfetch('http://example.com/x')" },
    ];
    const findings = detectFindings(files as never, []);
    expect(findings.some((f) => f.title.includes("eval"))).toBe(true);
  });
});

describe("code search", () => {
  it("finds matches with line numbers", () => {
    const files = [{ path: "s.ts", language: "TypeScript", size: 50, lineCount: 3, content: "line one\nGEMINI here\nline three" }];
    const hits = searchFiles(files as never, "gemini");
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ file: "s.ts", line: 2 });
  });
});

describe("citations", () => {
  it("formats ranges", () => {
    expect(citation("a.ts", 3)).toBe("a.ts:3");
    expect(citation("a.ts", 3, 9)).toBe("a.ts:3-9");
  });
});

describe("example repo", () => {
  it("loads fixture and traces /api/tasks", () => {
    const files = loadExampleRepoFiles();
    expect(files.length).toBeGreaterThan(4);
    const routes = detectApiRoutes(files);
    expect(routes.some((r) => r.path === "/api/tasks")).toBe(true);
    const { steps, matchedRoute } = traceEndpoint(files, routes, "GET /api/tasks");
    expect(matchedRoute?.path).toBe("/api/tasks");
    expect(steps.length).toBeGreaterThan(0);
  });
});
