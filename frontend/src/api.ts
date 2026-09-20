export interface RepoSummary {
  id: string;
  owner: string;
  repo: string;
  url: string;
  description: string;
  defaultBranch: string;
  source: string;
  fileCount: number;
  dirCount: number;
  totalLines: number;
  languages: Record<string, number>;
  frameworks: string[];
  packageManagers: string[];
  dependencies: Record<string, string>;
  apiRoutes: { method: string; path: string; file: string; line: number; handler?: string; evidence: string }[];
  testFiles: string[];
  envVars: string[];
  hasEnvExample: boolean;
  deployment: string[];
  entryPoints: string[];
}

export interface SearchHit {
  file: string;
  line: number;
  matched: string;
  contextBefore: string[];
  contextAfter: string[];
  filenameMatch?: boolean;
}

export interface Finding {
  id: string;
  severity: string;
  title: string;
  file: string;
  line: number;
  evidence: string;
  explanation: string;
  remediation: string;
}

export interface TraceStep {
  kind: string;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  endLine?: number;
  evidence?: string;
  verified: boolean;
  inferred?: boolean;
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  analyze: (url: string) =>
    fetch("/api/repositories/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).then(handle),
  analyzeExample: () =>
    fetch("/api/repositories/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ example: true }),
    }).then(handle),
  get: (id: string) => fetch(`/api/repositories/${id}`).then(handle),
  files: (id: string) => fetch(`/api/repositories/${id}/files`).then(handle),
  file: (id: string, path: string) => fetch(`/api/repositories/${id}/files?path=${encodeURIComponent(path)}`).then(handle),
  search: (id: string, q: string) => fetch(`/api/repositories/${id}/search?q=${encodeURIComponent(q)}`).then(handle),
  ask: (id: string, question: string) =>
    fetch(`/api/repositories/${id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }).then(handle),
  trace: (id: string, target: string) =>
    fetch(`/api/repositories/${id}/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }).then(handle),
  architecture: (id: string) => fetch(`/api/repositories/${id}/architecture`).then(handle),
  findings: (id: string) => fetch(`/api/repositories/${id}/findings`).then(handle),
  review: (id: string, focus: string) =>
    fetch(`/api/repositories/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focus }),
    }).then(handle),
};
