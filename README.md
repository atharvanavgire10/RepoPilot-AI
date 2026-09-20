# RepoPilot AI

**Understand any codebase faster.**

RepoPilot AI is a developer tool that analyzes a public GitHub repository (or a built-in example fixture) and helps you understand its architecture, APIs, dependencies, risks, and code flow — with every claim backed by file and line citations.

## Problem

Joining or reviewing an unfamiliar codebase means hours of clicking through files to answer basic questions: what does this project do, where is the API defined, how does auth work, what is risky?

## Solution

Paste a GitHub URL. RepoPilot fetches the real repository via the GitHub API, builds a searchable index, runs deterministic static analysis, and answers grounded questions:

- "What does this project do?"
- "Where is Gemini called?"
- "Trace POST /api/diagnose"
- "How does authentication work?"
- "Show me the architecture"
- "Find potential security risks"

## How it works

```
GitHub URL → validate → fetch metadata + tree + source files (GitHub REST API)
  → filter (ignore node_modules/dist/build/binaries/huge files)
  → detect languages, frameworks, dependencies, routes, components, services,
           DB/auth/external-API references, tests, deployment configs
  → index source → deterministic findings (risks) → architecture graph
  → retrieval → Gemini (grounded, cited) → UI with file:line evidence
```

Static analysis always runs first. Gemini is used only for synthesis (summaries, Q&A, prioritization, fix suggestions) and every AI answer must cite retrieved repository context. If evidence is insufficient, the API says so explicitly.

## Features

- **Repository analysis** — metadata, languages, frameworks, package managers, dependencies, entry points, deployment configs
- **Code search** — file + line + matched code + context; click to open the file
- **Ask RepoPilot** — retrieval-grounded Q&A with `file:line` citations; extractive fallback when no Gemini key is set
- **API trace** — route definition → handler/service calls → DB/external calls → frontend consumers; unverified links labeled `inferred`, never fabricated
- **Architecture view** — nodes (Frontend, Routes, Services, Database, External APIs, Auth) derived only from detected evidence, each linked to source
- **Risk review** — deterministic checks (hardcoded secrets, raw error exposure, permissive CORS, eval, insecure HTTP, debug logging, missing `.env.example`, missing tests, TODO/FIXME) with severity, evidence, and remediation
- **AI review** — Gemini-prioritized fix order grounded in the deterministic findings
- **Built-in example** — `example-repo/` (Express + React + Postgres fixture with intentional issues) analyzed through the same pipeline via "Try Example Repository"
- **Loading / error / empty states** throughout

## Tech stack

- Frontend: React 18, TypeScript, Vite 5, Tailwind CSS 3
- Backend: Node.js, Express 4, TypeScript
- Analysis: GitHub REST API + regex/AST-light static scanning (no repo code is ever executed)
- AI: official Google GenAI SDK (`@google/genai`), server-side only
- Testing: Vitest (backend)

## Project structure

```
RepoPilot-AI/
  backend/
    src/
      index.ts                 Express app + health + static frontend serving
      types.ts                 shared analysis types + citation helper
      routes/repositories.ts   REST API (analyze/get/files/search/ask/trace/review/architecture/findings)
      services/
        github.ts              GitHub metadata/tree/file fetching with limits
        analyzer.ts            routes, components, services, DB/auth/external/test/env/deploy detection
        search.ts              full-text search + relevance retrieval
        trace_arch.ts          API tracing + architecture graph
        risks.ts               deterministic risk checks
        gemini.ts              grounded prompt builder + Gemini caller + extractive fallback
        store.ts               in-memory analysis cache
        exampleRepo.ts         fixture loader (same pipeline as GitHub)
      utils/                   githubUrl, fileFilter, language, frameworks
    tests/analysis.test.ts     13 tests
  frontend/
    src/                       App.tsx (Landing + 7 analysis tabs), api.ts, main.tsx
  example-repo/                TaskPilot fixture (Express API, React frontend, pg service, intentional issues)
  .env.example
  README.md
```

## Environment variables (backend)

```
PORT=3001
GITHUB_TOKEN=        # optional; raises GitHub rate limits
GEMINI_API_KEY=      # optional; enables AI-grounded answers (otherwise extractive summaries)
GEMINI_MODEL=gemini-2.0-flash
```

Keys stay server-side. Never commit `.env`. See `.env.example`.

## Installation

```bash
npm install
```

## Development

```bash
# backend (http://localhost:3001)
npm run dev:backend
# frontend (http://localhost:5173, proxies /api to backend)
npm run dev:frontend
```

## Testing

```bash
npm test
```

Covers: GitHub URL parsing, file filtering, language detection, framework detection, API route detection, risk detection, code search, citation formatting, and full example-repo analysis + tracing.

## Production build

```bash
npm run build
npm start   # serves backend API + built frontend from one process
```

## Example usage

1. Open the frontend, click **Try Example Repository**.
2. Open **API Trace**, trace `GET /api/tasks` → `backend/server.js:29` → `listTasks()` → `frontend/src/api.ts:2`.
3. Open **Risk Review** — HIGH hardcoded secret in `backend/taskService.js:8`, raw error exposure in `backend/server.js:35`, permissive CORS.
4. Ask "How does authentication work?" — citations to `backend/server.js` JWT verification.

Or paste `https://github.com/atharvanavgire10/FieldMind-AI` and click **Analyze Repository**.

## API documentation

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | health check |
| POST | `/api/repositories/analyze` | `{url}` or `{example:true}` → analysis summary |
| GET | `/api/repositories/:id` | analysis summary |
| GET | `/api/repositories/:id/files[?path=]` | file list or single file with content |
| GET | `/api/repositories/:id/search?q=` | code search hits |
| POST | `/api/repositories/:id/ask` | `{question}` → grounded answer + citations |
| POST | `/api/repositories/:id/trace` | `{target}` → trace steps |
| POST | `/api/repositories/:id/review` | `{focus}` → prioritized review |
| GET | `/api/repositories/:id/architecture` | nodes + edges derived from evidence |
| GET | `/api/repositories/:id/findings` | deterministic findings |

## Security considerations

- Gemini/GITHUB tokens live only in backend env; never sent to the browser.
- GitHub URLs strictly validated; `..`, absolute, and overlong paths rejected.
- Repos capped (8000 tree entries, 140 files, 256 KB/file, 4 MB total); binaries skipped.
- Repository content treated as untrusted data: quoted as evidence, never executed, never followed as instructions; prompts instruct the model to ignore in-repo instructions.
- No `push --force` workflows; no secrets committed (`.env`, `node_modules`, `dist` gitignored).

## Limitations

- Static analysis only — dynamic call graphs, generated code, and heavily metaprogrammed routing may be missed; such links are labeled `inferred` or omitted.
- Large monorepos are sampled within fetch caps; results note file counts.
- Findings are heuristic signals, not confirmed vulnerabilities — each includes evidence so you can judge.
- In-memory analysis cache (holds ~30 analyses; restart clears it).
- AI quality depends on `GEMINI_API_KEY` being set; without it you get deterministic retrieval summaries.

## Roadmap

- Tree-sitter/TypeScript-AST precise call graphs
- Persistent analysis cache (SQLite)
- Diff-aware re-analysis and PR review mode
- More ecosystems (Rust, Java, PHP framework route extractors)
- Exportable architecture diagrams and SARIF findings
