import { describe, it, expect } from "vitest";
import { buildArchitecture } from "../src/services/trace_arch.js";
import { detectApiRoutes, analyzeSignals } from "../src/services/analyzer.js";
import { loadExampleRepoFiles } from "../src/services/exampleRepo.js";

function file(path: string, content: string) {
  return { path, language: "Other", size: content.length, lineCount: content.split("\n").length, content } as never;
}

const EMPTY = {
  apiRoutes: [],
  frontendComponents: [],
  backendServices: [],
  databaseRefs: [],
  authRefs: [],
  externalApis: [],
  entryPoints: [],
};

describe("buildArchitecture", () => {
  it("returns a codebase fallback when no signals exist", () => {
    const { nodes, edges } = buildArchitecture([file("a.txt", "hi")], EMPTY);
    expect(nodes.map((n) => n.id)).toEqual(["codebase"]);
    expect(edges).toEqual([]);
  });
  it("derives nodes only from present evidence", () => {
    const { nodes } = buildArchitecture([file("s.js", "x")], {
      ...EMPTY,
      apiRoutes: [{ method: "GET", path: "/a", file: "s.js", line: 1, evidence: "app.get" }],
    });
    expect(nodes.map((n) => n.id)).toEqual(["routes"]);
    expect(nodes[0].files[0]).toMatchObject({ file: "s.js", line: 1 });
  });
  it("links frontend to routes only when both exist", () => {
    const full = buildArchitecture([file("a.tsx", "<div/>"), file("s.js", "app.get")], {
      ...EMPTY,
      apiRoutes: [{ method: "GET", path: "/a", file: "s.js", line: 1, evidence: "app.get" }],
      frontendComponents: [{ file: "a.tsx", line: 1, snippet: "<div/>" }],
    });
    expect(full.edges).toContainEqual({ from: "frontend", to: "routes", label: "HTTP calls" });
    const routesOnly = buildArchitecture([file("s.js", "x")], {
      ...EMPTY,
      apiRoutes: [{ method: "GET", path: "/a", file: "s.js", line: 1, evidence: "app.get" }],
    });
    expect(routesOnly.edges).toEqual([]);
  });
  it("derives the full example-repo graph from real signals", () => {
    const files = loadExampleRepoFiles();
    const signals = analyzeSignals(files);
    const { nodes, edges } = buildArchitecture(files, {
      apiRoutes: signals.apiRoutes,
      frontendComponents: signals.frontendComponents,
      backendServices: signals.backendServices,
      databaseRefs: signals.databaseRefs,
      authRefs: signals.authRefs,
      externalApis: signals.externalApis,
      entryPoints: signals.entryPoints,
    });
    const ids = nodes.map((n) => n.id);
    for (const expected of ["frontend", "routes", "services", "database", "external", "auth"]) {
      expect(ids).toContain(expected);
    }
    expect(edges.length).toBeGreaterThan(0);
    // every node file ref must point at a real analyzed file
    const paths = new Set(files.map((f) => f.path));
    for (const n of nodes) for (const f of n.files) expect(paths.has(f.file)).toBe(true);
  });
  it("detects the example api routes feeding the graph", () => {
    const routes = detectApiRoutes(loadExampleRepoFiles());
    expect(routes.some((r) => r.method === "GET" && r.path === "/api/tasks")).toBe(true);
  });
});
