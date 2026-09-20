import { describe, it, expect } from "vitest";
import { saveAnalysis, getAnalysis, makeId } from "../src/services/store.js";
import type { FullAnalysis } from "../src/types.js";

function minimalAnalysis(id: string, owner = "o", repo = "r"): FullAnalysis {
  return {
    id,
    owner,
    repo,
    url: "https://github.com/o/r",
    description: "",
    defaultBranch: "main",
    fetchedAt: new Date().toISOString(),
    source: "github",
    fileCount: 0,
    dirCount: 0,
    totalLines: 0,
    languages: {},
    frameworks: [],
    packageManagers: [],
    dependencies: {},
    scripts: {},
    apiRoutes: [],
    frontendComponents: [],
    backendServices: [],
    databaseRefs: [],
    authRefs: [],
    externalApis: [],
    testFiles: [],
    envVars: [],
    hasEnvExample: false,
    deployment: [],
    entryPoints: [],
    files: [],
    findings: [],
  };
}

describe("analysis store", () => {
  it("saves and retrieves by id", () => {
    const a = minimalAnalysis(makeId("acme", "demo"), "acme", "demo");
    saveAnalysis(a);
    expect(getAnalysis(a.id)?.repo).toBe("demo");
  });
  it("returns undefined for unknown ids", () => {
    expect(getAnalysis("no-such-id-xyz")).toBeUndefined();
  });
  it("generates url-safe ids", () => {
    const id = makeId("Acme Org", "My.Repo!");
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
