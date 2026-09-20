import type { AnalyzedFile, ApiRoute, Finding } from "../types.js";

let counter = 0;
function fid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

const SECRET_PATTERNS: { title: string; re: RegExp; severity: Finding["severity"] }[] = [
  { title: "Possible hardcoded secret", re: /(api[_-]?key|apikey)\s*[:=]\s*['"`][A-Za-z0-9_\-]{12,}['"`]/i, severity: "HIGH" },
  { title: "Possible hardcoded password", re: /password\s*[:=]\s*['"`][^'"`]{4,}['"`]/i, severity: "HIGH" },
  { title: "Possible hardcoded token", re: /(secret|token)\s*[:=]\s*['"`][A-Za-z0-9_\-./]{12,}['"`]/i, severity: "HIGH" },
  { title: "AWS key pattern", re: /AKIA[0-9A-Z]{16}/, severity: "HIGH" },
  { title: "Private key material", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, severity: "HIGH" },
  { title: "Google API key pattern", re: /AIza[0-9A-Za-z\-_]{20,}/, severity: "HIGH" },
  { title: "Possible hardcoded JWT secret", re: /(?:jwt|jsonwebtoken)\s*\.\s*sign\s*\([^,]+,\s*['"`][^'"`]+['"`]/i, severity: "HIGH" },
];

export function detectFindings(files: AnalyzedFile[], apiRoutes: ApiRoute[]): Finding[] {
  const findings: Finding[] = [];
  const push = (f: Omit<Finding, "id">) => findings.push({ ...f, id: fid("f") });

  for (const file of files) {
    if (file.size > 250_000) continue;
    // skip vendored example env
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 1200) continue;
      for (const p of SECRET_PATTERNS) {
        p.re.lastIndex = 0;
        if (p.re.test(line)) {
          // reduce false positives: ignore obvious placeholders
          if (/example|placeholder|your[_-]?key|xxx|changeme|test123/i.test(line)) continue;
          push({
            severity: p.severity,
            title: p.title,
            file: file.path,
            line: i + 1,
            evidence: line.trim().slice(0, 240),
            explanation: "A literal credential-like value appears in source. If committed, it can leak in history and builds.",
            remediation: "Move the value to an environment variable, rotate the exposed credential, and ensure .env files are gitignored.",
          });
          break;
        }
      }
      if (/eval\s*\(/.test(line) && !/evaluation/.test(line)) {
        push({
          severity: "HIGH",
          title: "Use of eval()",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "eval() executes strings as code and can enable code injection if input is attacker-controlled.",
          remediation: "Avoid eval; use JSON.parse, Function allow-lists, or a safe expression parser instead.",
        });
      }
      if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(line)) {
        push({
          severity: "MEDIUM",
          title: "Possible XSS sink (raw HTML injection)",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "Injecting raw HTML can enable cross-site scripting if any part of the content is attacker-controlled.",
          remediation: "Avoid raw HTML injection; render text safely or sanitize with a trusted library before injecting.",
        });
      }
      if (/\b(SELECT|INSERT|UPDATE|DELETE)\b[^;]*\+\s*\w+/i.test(line)) {
        push({
          severity: "MEDIUM",
          title: "Possible SQL string concatenation",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "Building SQL with string concatenation risks SQL injection if values come from user input.",
          remediation: "Use parameterized queries or an ORM instead of concatenating values into SQL strings.",
        });
      }
      if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(line)) {
        push({
          severity: "LOW",
          title: "Insecure HTTP URL",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "Plain HTTP can expose data in transit.",
          remediation: "Prefer HTTPS endpoints for external calls.",
        });
      }
      if (/res\.(json|send)\(\s*\{[^}]*err\.(message|stack)/.test(line) || /err\.stack/.test(line) && /res\./.test(line)) {
        push({
          severity: "MEDIUM",
          title: "Possible raw error exposure",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "Returning internal error details to clients can leak paths, SQL, or stack traces.",
          remediation: "Return a generic public message and log the full error server-side.",
        });
      }
      if (/console\.(log|debug|info)\(/.test(line) && !/\.test\.|\.spec\./.test(file.path)) {
        push({
          severity: "INFO",
          title: "Debug logging",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "Console logging may leak data in production and adds noise.",
          remediation: "Use a structured logger with levels and remove verbose logs from hot paths.",
        });
        // only first occurrence per file to avoid noise
        break;
      }
      if (/TODO|FIXME|HACK|XXX/.test(line)) {
        push({
          severity: "INFO",
          title: "Technical debt marker",
          file: file.path,
          line: i + 1,
          evidence: line.trim().slice(0, 240),
          explanation: "TODO/FIXME markers indicate unfinished work worth triaging.",
          remediation: "Convert into tracked issues or resolve before release.",
        });
        break;
      }
    }
    if (/cors\s*\(\s*\{\s*origin\s*:\s*['"`*]/i.test(file.content) || /Access-Control-Allow-Origin['"`\s:]*\*/.test(file.content)) {
      const idx = file.content.search(/cors|Access-Control-Allow-Origin/i);
      const line = file.content.slice(0, idx).split("\n").length;
      push({
        severity: "MEDIUM",
        title: "Permissive CORS configuration",
        file: file.path,
        line,
        evidence: file.content.split("\n")[line - 1]?.trim().slice(0, 240) || "origin: *",
        explanation: "Allowing any origin can expose authenticated endpoints to untrusted sites.",
        remediation: "Restrict CORS origins to known frontends and avoid credentials with wildcard origins.",
      });
    }
  }

  const hasEnvExample = files.some((f) => /(^|\/)\.env\.example$/.test(f.path));
  const usesEnv = files.some((f) => /process\.env|os\.getenv|os\.environ/.test(f.content));
  if (usesEnv && !hasEnvExample) {
    push({
      severity: "LOW",
      title: "Missing .env.example",
      file: ".env.example",
      line: 1,
      evidence: "Environment variables are read but no .env.example was found.",
      explanation: "New contributors cannot tell which variables are required.",
      remediation: "Add a .env.example listing required variables without real values.",
    });
  }

  const testCount = files.filter((f) => /(\.test\.|\.spec\.|__tests__|\/tests?\/)/.test(f.path)).length;
  if (testCount === 0 && files.length > 5) {
    push({
      severity: "LOW",
      title: "No tests detected",
      file: "README",
      line: 1,
      evidence: "No test files matched common test patterns.",
      explanation: "Lack of tests increases regression risk for refactors.",
      remediation: "Add focused unit tests for routes/services and critical logic.",
    });
  }

  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file)).slice(0, 120);
}
