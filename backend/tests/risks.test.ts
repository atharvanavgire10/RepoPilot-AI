import { describe, it, expect } from "vitest";
import { detectFindings } from "../src/services/risks.js";

function file(path: string, content: string) {
  return { path, language: "Other", size: content.length, lineCount: content.split("\n").length, content } as never;
}

describe("risk signals", () => {
  it("flags hardcoded jwt signing secrets", () => {
    const findings = detectFindings(
      [file("auth.js", 'const token = jwt.sign({ sub: user.id }, "hardcoded-secret-12345");\n')],
      []
    );
    const hit = findings.find((f) => f.title.includes("JWT"));
    expect(hit).toMatchObject({ severity: "HIGH", file: "auth.js", line: 1 });
  });
  it("does not flag env-based jwt secrets", () => {
    const findings = detectFindings(
      [file("auth.js", "const token = jwt.sign(payload, process.env.JWT_SECRET);\n")],
      []
    );
    expect(findings.some((f) => f.title.includes("JWT"))).toBe(false);
  });
  it("flags raw html injection sinks", () => {
    const findings = detectFindings(
      [file("View.tsx", "return <div dangerouslySetInnerHTML={{ __html: body }} />;\n")],
      []
    );
    const hit = findings.find((f) => f.title.includes("XSS"));
    expect(hit).toMatchObject({ severity: "MEDIUM", file: "View.tsx", line: 1 });
  });
  it("flags sql string concatenation", () => {
    const findings = detectFindings(
      [file("db.js", 'const q = "SELECT * FROM users WHERE id = " + userId;\n')],
      []
    );
    const hit = findings.find((f) => f.title.includes("SQL"));
    expect(hit).toMatchObject({ severity: "MEDIUM", file: "db.js", line: 1 });
  });
  it("does not flag parameterized queries", () => {
    const findings = detectFindings(
      [file("db.js", 'const q = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);\n')],
      []
    );
    expect(findings.some((f) => f.title.includes("SQL"))).toBe(false);
  });
  it("every finding carries evidence and remediation", () => {
    const findings = detectFindings([file("a.js", "eval(userInput)\n")], []);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.remediation.length).toBeGreaterThan(0);
      expect(f.file).toBe("a.js");
    }
  });
});
