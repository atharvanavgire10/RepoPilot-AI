import { Router, type Request, type Response } from "express";
import { parseGitHubUrl, isFriendlyError } from "../utils/githubUrl.js";
import { fetchRepoMeta, fetchRepoTree, fetchAnalyzedFiles } from "../services/github.js";
import { analyzeSignals } from "../services/analyzer.js";
import { detectFrameworks } from "../utils/frameworks.js";
import { countLanguages } from "../utils/language.js";
import { detectFindings } from "../services/risks.js";
import { searchFiles, retrieveRelevantChunks } from "../services/search.js";
import { traceEndpoint, buildArchitecture } from "../services/trace_arch.js";
import { buildGroundedPrompt, askGemini, extractiveAnswer } from "../services/gemini.js";
import { saveAnalysis, getAnalysis, makeId } from "../services/store.js";
import { loadExampleRepoFiles } from "../services/exampleRepo.js";
import { citation, type FullAnalysis } from "../types.js";

const router = Router();

function toSummary(a: FullAnalysis) {
  const { files, ...rest } = a;
  void files;
  return rest;
}

function buildAnalysis(args: {
  id: string;
  owner: string;
  repo: string;
  url: string;
  description: string;
  defaultBranch: string;
  source: "github" | "example";
  files: ReturnType<typeof loadExampleRepoFiles>;
}): FullAnalysis {
  const { id, owner, repo, url, description, defaultBranch, source, files } = args;
  const signals = analyzeSignals(files);
  const fw = detectFrameworks(files);
  const languages = countLanguages(files.map((f) => f.path));
  const dirs = new Set(files.map((f) => f.path.split("/").slice(0, -1).join("/")).filter(Boolean));
  const totalLines = files.reduce((n, f) => n + f.lineCount, 0);
  const findings = detectFindings(files, signals.apiRoutes);
  return {
    id,
    owner,
    repo,
    url,
    description,
    defaultBranch,
    fetchedAt: new Date().toISOString(),
    source,
    fileCount: files.length,
    dirCount: dirs.size,
    totalLines,
    languages,
    frameworks: fw.frameworks,
    packageManagers: fw.packageManagers,
    dependencies: fw.dependencies,
    scripts: fw.scripts,
    apiRoutes: signals.apiRoutes,
    frontendComponents: signals.frontendComponents,
    backendServices: signals.backendServices,
    databaseRefs: signals.databaseRefs,
    authRefs: signals.authRefs,
    externalApis: signals.externalApis,
    testFiles: signals.testFiles,
    envVars: signals.envVars,
    hasEnvExample: signals.hasEnvExample,
    deployment: signals.deployment,
    entryPoints: signals.entryPoints,
    files,
    findings,
  };
}

// POST /api/repositories/analyze
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { url, example } = req.body || {};
    if (example === true) {
      const files = loadExampleRepoFiles();
      const id = makeId("example", "taskpilot");
      const analysis = buildAnalysis({
        id,
        owner: "example",
        repo: "taskpilot",
        url: "example://taskpilot",
        description: "Built-in TaskPilot example fixture (Express + React + Postgres).",
        defaultBranch: "main",
        source: "example",
        files,
      });
      saveAnalysis(analysis);
      return res.json(toSummary(analysis));
    }
    const parsed = parseGitHubUrl(String(url || ""));
    const meta = await fetchRepoMeta(parsed.owner, parsed.repo);
    const tree = await fetchRepoTree(meta.owner, meta.name, meta.defaultBranch);
    const files = await fetchAnalyzedFiles(meta.owner, meta.name, meta.defaultBranch, tree);
    if (files.length === 0) return res.status(422).json({ error: "No analyzable source files were found in this repository." });
    const id = makeId(meta.owner, meta.name);
    const analysis = buildAnalysis({
      id,
      owner: meta.owner,
      repo: meta.name,
      url: `https://github.com/${meta.owner}/${meta.name}`,
      description: meta.description,
      defaultBranch: meta.defaultBranch,
      source: "github",
      files,
    });
    saveAnalysis(analysis);
    return res.json(toSummary(analysis));
  } catch (e) {
    const msg = (e as Error).message || "Analysis failed.";
    if (isFriendlyError(e)) return res.status(400).json({ error: msg });
    if (/rate limit/i.test(msg)) return res.status(429).json({ error: msg });
    if (/private/i.test(msg)) return res.status(403).json({ error: msg });
    if (/could not be accessed|not found/i.test(msg)) return res.status(404).json({ error: msg });
    if (/too large|empty/i.test(msg)) return res.status(422).json({ error: msg });
    console.error("analyze failed:", e);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

// GET /api/repositories/:id
router.get("/:id", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found. Re-run Analyze Repository." });
  return res.json(toSummary(a));
});

// GET /api/repositories/:id/files?path=
router.get("/:id/files", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const p = String(req.query.path || "");
  if (p) {
    const f = a.files.find((x) => x.path === p);
    if (!f) return res.status(404).json({ error: "File not found in analysis." });
    return res.json(f);
  }
  return res.json({
    files: a.files.map((f) => ({ path: f.path, language: f.language, size: f.size, lineCount: f.lineCount })),
  });
});

// GET /api/repositories/:id/search?q=
router.get("/:id/search", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const q = String(req.query.q || "");
  if (!q.trim()) return res.status(400).json({ error: "Missing search query ?q=" });
  return res.json({ query: q, results: searchFiles(a.files, q, 40) });
});

// POST /api/repositories/:id/ask
router.post("/:id/ask", async (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Missing question." });
  const { prompt, chunks } = buildGroundedPrompt(question, a, 8);
  const { text, aiEnabled } = await askGemini(prompt);
  if (aiEnabled && text) {
    return res.json({
      answer: text,
      aiEnabled: true,
      citations: chunks.map((c) => ({ file: c.file, line: c.startLine, endLine: c.endLine, ref: citation(c.file, c.startLine, c.endLine) })),
    });
  }
  return res.json({
    answer: extractiveAnswer(question, a, chunks),
    aiEnabled: false,
    citations: chunks.map((c) => ({ file: c.file, line: c.startLine, endLine: c.endLine, ref: citation(c.file, c.startLine, c.endLine) })),
    notice: "GEMINI_API_KEY not configured — returned deterministic retrieval summary.",
  });
});

// POST /api/repositories/:id/trace
router.post("/:id/trace", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const target = String(req.body?.target || req.body?.endpoint || "").trim();
  if (!target) return res.status(400).json({ error: "Missing trace target. Provide an endpoint like GET /api/tasks." });
  const { steps, matchedRoute } = traceEndpoint(a.files, a.apiRoutes, target);
  return res.json({ target, matchedRoute: matchedRoute || null, steps });
});

// POST /api/repositories/:id/review
router.post("/:id/review", async (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const focus = String(req.body?.focus || "Summarize the most important technical risks and what to fix first.").slice(0, 500);
  const top = a.findings.slice(0, 12);
  const evidence = top.map((f) => `- [${f.severity}] ${f.title} at ${citation(f.file, f.line)}: ${f.evidence}`).join("\n");
  const prompt = [
    "You are RepoPilot AI. Prioritize deterministic static findings using only the evidence below.",
    "Do not invent files or vulnerabilities. Distinguish verified facts from inference.",
    "If evidence is insufficient, say: Insufficient evidence in the analyzed repository.",
    "",
    `Repository: ${a.owner}/${a.repo}. Frameworks: ${a.frameworks.join(", ") || "unknown"}.`,
    "Findings:",
    evidence || "(no findings)",
    "",
    `Task: ${focus}`,
    "Return: 1) ranked fix order 2) why each matters 3) concrete remediation with file:line refs.",
  ].join("\n");
  const { text, aiEnabled } = await askGemini(prompt);
  if (aiEnabled && text) return res.json({ review: text, aiEnabled: true, findings: top });
  const fallback = [
    `Deterministic review of ${a.owner}/${a.repo} (${top.length} findings shown, Gemini unavailable):`,
    "",
    ...top.map((f, i) => `${i + 1}. [${f.severity}] ${f.title} — ${citation(f.file, f.line)} — ${f.remediation}`),
    "",
    "Set GEMINI_API_KEY for a synthesized prioritized review.",
  ].join("\n");
  return res.json({ review: fallback, aiEnabled: false, findings: top });
});

// GET /api/repositories/:id/architecture
router.get("/:id/architecture", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  const arch = buildArchitecture(a.files, {
    apiRoutes: a.apiRoutes,
    frontendComponents: a.frontendComponents,
    backendServices: a.backendServices,
    databaseRefs: a.databaseRefs,
    authRefs: a.authRefs,
    externalApis: a.externalApis,
    entryPoints: a.entryPoints,
  });
  return res.json(arch);
});

// GET /api/repositories/:id/findings
router.get("/:id/findings", (req: Request, res: Response) => {
  const a = getAnalysis(String(req.params.id));
  if (!a) return res.status(404).json({ error: "Analysis not found." });
  return res.json({ findings: a.findings });
});

// helper for retrieval debug (used by tests indirectly)
void retrieveRelevantChunks;

export default router;
