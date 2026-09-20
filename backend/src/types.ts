export interface AnalyzedFile {
  path: string;
  language: string;
  size: number;
  lineCount: number;
  content: string;
}

export interface ApiRoute {
  method: string;
  path: string;
  file: string;
  line: number;
  handler?: string;
  evidence: string;
}

export interface CodeRef {
  file: string;
  line: number;
  endLine?: number;
  snippet: string;
}

export interface Finding {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
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
  /** True when the step is directly observed in code; false when the link is heuristic. */
  verified: boolean;
  inferred?: boolean;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  kind: string;
  files: CodeRef[];
  description: string;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label: string;
  evidence?: CodeRef[];
}

export interface RepoSummary {
  id: string;
  owner: string;
  repo: string;
  url: string;
  description: string;
  defaultBranch: string;
  fetchedAt: string;
  source: "github" | "example";
  fileCount: number;
  dirCount: number;
  totalLines: number;
  languages: Record<string, number>;
  frameworks: string[];
  packageManagers: string[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
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

export interface FullAnalysis extends RepoSummary {
  files: AnalyzedFile[];
  findings: Finding[];
}

export interface SearchHit {
  file: string;
  line: number;
  matched: string;
  contextBefore: string[];
  contextAfter: string[];
  /** True when only the filename matched (line 1 shown as evidence). */
  filenameMatch?: boolean;
}

export function citation(file: string, line: number, endLine?: number): string {
  return endLine && endLine !== line ? `${file}:${line}-${endLine}` : `${file}:${line}`;
}
