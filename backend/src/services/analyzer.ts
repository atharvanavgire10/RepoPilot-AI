import type { AnalyzedFile, ApiRoute, CodeRef } from "../types.js";

export interface AnalysisSignals {
  apiRoutes: ApiRoute[];
  frontendComponents: CodeRef[];
  backendServices: CodeRef[];
  databaseRefs: CodeRef[];
  authRefs: CodeRef[];
  externalApis: CodeRef[];
  testFiles: string[];
  envVars: string[];
  hasEnvExample: boolean;
  deployment: string[];
  entryPoints: string[];
}

function linesOf(content: string): string[] {
  return content.split("\n");
}

function ref(file: string, line: number, snippet: string, endLine?: number): CodeRef {
  return { file, line, snippet: snippet.trim().slice(0, 220), endLine };
}

const ROUTE_PATTERNS: { method: string; re: RegExp }[] = [
  { method: "GET", re: /\.(get|route)\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { method: "*", re: /\.(post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/g },
];

export function detectApiRoutes(files: AnalyzedFile[]): ApiRoute[] {
  const routes: ApiRoute[] = [];
  for (const f of files) {
    if (f.size > 200_000) continue;
    const lines = linesOf(f.content);
    // Next.js / file-based routes
    const appApi = f.path.match(/app\/api\/(.+?)\/route\.(ts|js)$/);
    if (appApi) {
      const methods = [...f.content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(
        (m) => m[1]
      );
      const routePath = "/api/" + appApi[1];
      if (methods.length === 0) {
        routes.push({
          method: "GET",
          path: routePath,
          file: f.path,
          line: 1,
          evidence: `Next.js App Router route file ${f.path}`,
        });
      } else {
        for (const m of new Set(methods)) {
          const idx = lines.findIndex((l) => new RegExp(`function\\s+${m}\\b`).test(l));
          routes.push({
            method: m,
            path: routePath,
            file: f.path,
            line: idx >= 0 ? idx + 1 : 1,
            evidence: (lines[idx >= 0 ? idx : 0] || "").trim().slice(0, 200),
          });
        }
      }
      continue;
    }
    const pagesApi = f.path.match(/pages\/api\/(.+?)\.(ts|js)$/);
    if (pagesApi) {
      routes.push({
        method: "GET",
        path: "/api/" + pagesApi[1],
        file: f.path,
        line: 1,
        evidence: `Next.js Pages API route ${f.path}`,
      });
      continue;
    }
    // Express-style: app.get('/path', ...) router.post("...")
    const combined =
      /(app|router|server|api)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*([^)]{0,120})?/g;
    for (const m of f.content.matchAll(combined)) {
      const method = m[2].toUpperCase();
      const routePath = m[3];
      if (!routePath.startsWith("/") && !routePath.startsWith(":")) continue;
      const lineIdx = lineIndexOf(f.content, m.index ?? 0);
      routes.push({
        method,
        path: routePath,
        file: f.path,
        line: lineIdx,
        handler: (m[4] || "").trim().slice(0, 80) || undefined,
        evidence: (lines[lineIdx - 1] || "").trim().slice(0, 220),
      });
    }
    // Python Flask/FastAPI
    const pyRoute = /@(?:app|router|api|bp|blueprint)\s*\.\s*(route|get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    for (const m of f.content.matchAll(pyRoute)) {
      const kind = m[1].toLowerCase();
      const method = kind === "route" ? "GET" : kind.toUpperCase();
      const lineIdx = lineIndexOf(f.content, m.index ?? 0);
      routes.push({
        method,
        path: m[2],
        file: f.path,
        line: lineIdx,
        evidence: (lines[lineIdx - 1] || "").trim().slice(0, 220),
      });
    }
    void ROUTE_PATTERNS;
  }
  // de-dupe
  const seen = new Set<string>();
  return routes.filter((r) => {
    const k = `${r.method} ${r.path} ${r.file}:${r.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 300);
}

function lineIndexOf(content: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

function scan(
  files: AnalyzedFile[],
  predicate: (path: string, content: string) => boolean,
  snippetRe: RegExp,
  cap = 120
): CodeRef[] {
  const out: CodeRef[] = [];
  for (const f of files) {
    if (f.size > 220_000) continue;
    if (!predicate(f.path, f.content)) continue;
    const lines = linesOf(f.content);
    let added = 0;
    for (let i = 0; i < lines.length && out.length < cap; i++) {
      snippetRe.lastIndex = 0;
      if (snippetRe.test(lines[i])) {
        out.push(ref(f.path, i + 1, lines[i]));
        added++;
        if (added > 6) break;
      }
    }
    if (added === 0) out.push(ref(f.path, 1, lines[0] || f.path));
  }
  return out.slice(0, cap);
}

export function analyzeSignals(files: AnalyzedFile[]): AnalysisSignals {
  const apiRoutes = detectApiRoutes(files);

  const frontendComponents = scan(
    files,
    (p) => /\.(tsx|jsx|vue|svelte)$/.test(p),
    /function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=\s*\(|export\s+default\s+function|<\w+/
  );

  const backendServices = scan(
    files,
    (p, c) => /(service|controller|handler|repository|usecase)/i.test(p) || /class\s+\w*(Service|Controller|Handler)\b/.test(c),
    /class\s+\w+|function\s+\w+|const\s+\w+\s*=\s*(async\s*)?\(/
  );

  const databaseRefs = scan(
    files,
    (_p, c) => /mongoose|prisma|typeorm|drizzle|sequelize|mysql|mongodb|supabase|firebase|sqlite|require\(["']pg["']\)|from\s+["']pg["']|pool\.query|SELECT\s+.*FROM/i.test(c),
    /mongoose|prisma|createConnection|createPool|MongoClient|supabase|getFirestore|sqlite|pool\.query|SELECT\s+.*FROM|require\(["']pg["']\)/i
  );

  const authRefs = scan(
    files,
    (p, c) => /auth/i.test(p) || /passport|next-auth|clerk|jsonwebtoken|jwt|oauth|bcrypt| Lucia|session/i.test(c),
    /passport|jwt|verify|signIn|signOut|getSession|withAuth|authorize|bcrypt|OAuth/i
  );

  const externalApis = scan(
    files,
    (_p, c) => /fetch\s*\(|axios\.(get|post)|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(c),
    /fetch\s*\(|axios\.|https?:\/\/[^\s"'`]+|generativelanguage|api\.openai|api\.stripe/i
  );

  const testFiles = files
    .map((f) => f.path)
    .filter((p) => /(\.test\.|\.spec\.|__tests__|\/tests?\/|test_.*\.py$|_test\.go$)/.test(p));

  const envVars = Array.from(
    new Set(
      files.flatMap((f) =>
        [...f.content.matchAll(/process\.env\.([A-Z0-9_]+)|os\.getenv\(\s*['"`]([^'"`]+)['"`]/g)].map(
          (m) => m[1] || m[2]
        )
      ).filter(Boolean)
    )
  ).slice(0, 60);

  const hasEnvExample = files.some((f) => /(^|\/)\.env\.example$/.test(f.path));

  const deployment = files
    .map((f) => f.path)
    .filter((p) =>
      /(^|\/)(Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml|render\.yaml|fly\.toml|\.github\/workflows\/.*\.ya?ml|Procfile|app\.yaml)$/.test(p)
    );

  const entryPoints = files
    .map((f) => f.path)
    .filter((p) =>
      /(^|\/)(server\.(ts|js)|app\.(ts|js|py)|main\.(ts|js|py|go)|index\.(ts|js)|src\/main\.|src\/index\.|manage\.py|wsgi\.py)$/.test(p)
    )
    .slice(0, 12);

  return {
    apiRoutes,
    frontendComponents,
    backendServices,
    databaseRefs,
    authRefs,
    externalApis,
    testFiles,
    envVars,
    hasEnvExample,
    deployment,
    entryPoints,
  };
}
