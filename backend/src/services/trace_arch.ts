import type { AnalyzedFile, ApiRoute, ArchitectureEdge, ArchitectureNode, CodeRef, TraceStep } from "../types.js";

function snippetAt(file: AnalyzedFile, line: number): string {
  const lines = file.content.split("\n");
  return (lines[line - 1] || "").trim().slice(0, 220);
}

export function traceEndpoint(
  files: AnalyzedFile[],
  apiRoutes: ApiRoute[],
  input: string
): { steps: TraceStep[]; matchedRoute?: ApiRoute } {
  const q = (input || "").trim();
  if (!q) return { steps: [] };
  const byPath = new Map(files.map((f) => [f.path, f]));
  const steps: TraceStep[] = [];

  // 1. find matching route definitions (by path fragment or method+path)
  const qLower = q.toLowerCase();
  const qPath = qLower.split(/\s+/).pop() || qLower;
  const matched = apiRoutes.filter(
    (r) => r.path.toLowerCase().includes(qPath.replace(/['"`]/g, "")) || qLower.includes(r.path.toLowerCase())
  );
  const primary = matched[0];

  if (!primary) {
    // fallback: search for literal path in code
    const hits: TraceStep[] = [];
    for (const f of files) {
      if (f.size > 250_000) continue;
      const lines = f.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(qPath.replace(/['"`]/g, "")) && /fetch|axios|get|post|route|path|url/i.test(lines[i])) {
          hits.push({
            kind: "code",
            title: `Reference to "${q}"`,
            detail: `Literal reference found; no route definition confirmed.`,
            file: f.path,
            line: i + 1,
            evidence: lines[i].trim().slice(0, 240),
            verified: false,
            inferred: true,
          });
          if (hits.length >= 8) break;
        }
      }
      if (hits.length >= 8) break;
    }
    return { steps: hits };
  }

  const routeFile = byPath.get(primary.file);
  steps.push({
    kind: "route",
    title: `${primary.method} ${primary.path}`,
    detail: `Route defined in ${primary.file}:${primary.line}${primary.handler ? ` handler ${primary.handler}` : ""}`,
    file: primary.file,
    line: primary.line,
    evidence: primary.evidence,
    verified: true,
  });

  if (routeFile) {
    const lines = routeFile.content.split("\n");
    // Cap the handler window at the next route definition so adjacent
    // handlers (e.g. GET then POST on the same path) do not bleed together.
    const ROUTE_LINE_RE = /(app|router|server|api)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]/;
    let windowEnd = primary.line + 40;
    for (let i = primary.line; i < Math.min(lines.length, primary.line + 40); i++) {
      if (ROUTE_LINE_RE.test(lines[i])) {
        windowEnd = i;
        break;
      }
    }
    // handler function: look for function name near route line
    const windowLines = lines.slice(Math.max(0, primary.line - 1), primary.line + 25).join("\n");
    const handlerMatch =
      windowLines.match(/(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async\s*\(|function\s+(\w+)\s*\()/) ||
      primary.handler?.match(/(\w+)/);
    const handlerName = handlerMatch ? handlerMatch[1] || handlerMatch[2] || handlerMatch[3] || handlerMatch[0] : undefined;

    // service/controller calls inside route file (skip the route definition line itself)
    const callRe = /(\w+Service|\w+Controller|\w+Handler)?\.?(\w+)\s*\(/g;
    const STOP = new Set([
      "get", "post", "put", "patch", "delete", "options", "head", "all", "use", "listen",
      "json", "send", "status", "set", "end", "require", "import", "export", "return",
      "if", "for", "while", "switch", "catch", "console", "log", "async",
    ]);
    const svcHits: { name: string; line: number }[] = [];
    lines.forEach((ln, idx) => {
      if (idx + 1 <= primary.line) return;
      if (idx + 1 > windowEnd) return;
      for (const m of ln.matchAll(callRe)) {
        const callee = m[2];
        if (STOP.has(callee)) continue;
        if (callee.length < 3) continue;
        svcHits.push({ name: m[0].trim(), line: idx + 1 });
        if (svcHits.length >= 4) break;
      }
    });

    // find service file defining handler or called function
    if (handlerName && handlerName.length > 2) {
      for (const f of files) {
        if (f.path === primary.file) continue;
        if (f.size > 250_000) continue;
        const flines = f.content.split("\n");
        for (let i = 0; i < flines.length; i++) {
          if (
            new RegExp(`function\\s+${escapeReg(handlerName)}\\b|const\\s+${escapeReg(handlerName)}\\s*=`).test(flines[i])
          ) {
            steps.push({
              kind: "service",
              title: `${handlerName}()`,
              detail: `Handler/service function defined in ${f.path}:${i + 1}.`,
              file: f.path,
              line: i + 1,
              endLine: Math.min(flines.length, i + 30),
              evidence: flines[i].trim().slice(0, 240),
              verified: true,
            });
            // db/external inside service file
            const svcWindow = flines.slice(i, i + 40).join("\n");
            if (/prisma|mongoose|SELECT|INSERT|UPDATE|MongoClient|supabase|firestore/i.test(svcWindow)) {
              steps.push({
                kind: "database",
                title: "Database/storage access",
                detail: `Database call inside ${f.path} near ${handlerName}().`,
                file: f.path,
                line: i + 1,
                evidence: (svcWindow.match(/.*(prisma|mongoose|SELECT|supabase|firestore).*/i) || [""])[0].trim().slice(0, 240),
                verified: false,
                inferred: true,
              });
            }
            const extM = svcWindow.match(/.*(fetch\s*\(|axios\.|https?:\/\/[^\s"'`]+|generativelanguage|openai|stripe).*/i);
            if (extM) {
              steps.push({
                kind: "external",
                title: "External API call",
                detail: `External call inside ${f.path} near ${handlerName}().`,
                file: f.path,
                line: i + 1,
                evidence: extM[0].trim().slice(0, 240),
                verified: false,
                inferred: true,
              });
            }
            break;
          }
        }
        if (steps.some((s) => s.kind === "service")) break;
      }
    }

    for (const h of svcHits.slice(0, 2)) {
      if (steps.some((s) => s.kind === "service")) break;
      steps.push({
        kind: "service-call",
        title: `Call ${h.name}`,
        detail: `Function call on line ${primary.file}:${h.line}, target not resolved to a definition.`,
        file: primary.file,
        line: h.line,
        evidence: snippetAt(routeFile, h.line),
        verified: false,
        inferred: true,
      });
    }
  }

  // frontend callers: files referencing the route path
  const routePathLower = primary.path.toLowerCase();
  for (const f of files) {
    if (f.path === primary.file) continue;
    if (!/\.(tsx|jsx|ts|js|vue|svelte)$/.test(f.path)) continue;
    if (f.size > 250_000) continue;
    const flines = f.content.split("\n");
    for (let i = 0; i < flines.length; i++) {
      if (flines[i].toLowerCase().includes(routePathLower) && /fetch|axios|useQuery|useMutation|http/i.test(flines[i])) {
        steps.push({
          kind: "frontend",
          title: "Frontend consumer",
          detail: `Frontend references ${primary.path} in ${f.path}:${i + 1}.`,
          file: f.path,
          line: i + 1,
          evidence: flines[i].trim().slice(0, 240),
          verified: true,
        });
        break;
      }
    }
    if (steps.filter((s) => s.kind === "frontend").length >= 3) break;
  }

  return { steps, matchedRoute: primary };
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildArchitecture(
  files: AnalyzedFile[],
  signals: {
    apiRoutes: ApiRoute[];
    frontendComponents: CodeRef[];
    backendServices: CodeRef[];
    databaseRefs: CodeRef[];
    authRefs: CodeRef[];
    externalApis: CodeRef[];
    entryPoints: string[];
  }
): { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] } {
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];
  const has = (arr: unknown[]) => arr.length > 0;

  if (has(signals.frontendComponents) || files.some((f) => /\.(tsx|jsx|vue|svelte)$/.test(f.path))) {
    nodes.push({
      id: "frontend",
      label: "Frontend",
      kind: "frontend",
      files: signals.frontendComponents.slice(0, 6),
      description: `${signals.frontendComponents.length} component references detected.`,
    });
  }
  if (has(signals.apiRoutes)) {
    nodes.push({
      id: "routes",
      label: `API Routes (${signals.apiRoutes.length})`,
      kind: "routes",
      files: signals.apiRoutes.slice(0, 8).map((r) => ({ file: r.file, line: r.line, snippet: `${r.method} ${r.path}` })),
      description: "HTTP routes detected by static scanning.",
    });
  }
  if (has(signals.backendServices)) {
    nodes.push({
      id: "services",
      label: "Services",
      kind: "services",
      files: signals.backendServices.slice(0, 6),
      description: "Service/controller/handler modules.",
    });
  }
  if (has(signals.databaseRefs)) {
    nodes.push({
      id: "database",
      label: "Database",
      kind: "database",
      files: signals.databaseRefs.slice(0, 6),
      description: "Database client/queries referenced in code.",
    });
  }
  if (has(signals.externalApis)) {
    nodes.push({
      id: "external",
      label: "External APIs",
      kind: "external",
      files: signals.externalApis.slice(0, 6),
      description: "Outbound HTTP / third-party API usage.",
    });
  }
  if (has(signals.authRefs)) {
    nodes.push({
      id: "auth",
      label: "Auth",
      kind: "auth",
      files: signals.authRefs.slice(0, 6),
      description: "Authentication/session references.",
    });
  }
  if (nodes.length === 0) {
    nodes.push({
      id: "codebase",
      label: "Codebase",
      kind: "codebase",
      files: files.slice(0, 5).map((f) => ({ file: f.path, line: 1, snippet: f.path })),
      description: "No strong architectural signals; file inventory available.",
    });
    return { nodes, edges };
  }
  const link = (a: string, b: string, label: string) => {
    if (nodes.some((n) => n.id === a) && nodes.some((n) => n.id === b)) edges.push({ from: a, to: b, label });
  };
  link("frontend", "routes", "HTTP calls");
  link("routes", "services", "handled by");
  link("services", "database", "reads/writes");
  link("services", "external", "calls");
  link("routes", "auth", "guarded by");
  link("frontend", "auth", "session");
  return { nodes, edges };
}
