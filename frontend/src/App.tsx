import { useEffect, useState } from "react";
import { api, type RepoSummary, type SearchHit, type Finding, type TraceStep } from "./api";

type Tab = "overview" | "files" | "search" | "ask" | "trace" | "arch" | "risks";

const STEPS = [
  "Fetching repository",
  "Analyzing project structure",
  "Detecting technologies",
  "Indexing source files",
  "Mapping APIs",
  "Building dependency relationships",
  "Preparing RepoPilot",
];

function useProgress(active: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) {
      setI(0);
      return;
    }
    const t = setInterval(() => setI((v) => Math.min(v + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [active]);
  return STEPS[i];
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{children}</span>;
}

function Code({ text, highlight }: { text: string; highlight?: number }) {
  const lines = text.split("\n");
  return (
    <pre className="overflow-auto rounded border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {lines.map((l, i) => (
        <div key={i} className={highlight === i + 1 ? "bg-yellow-900/60" : undefined}>
          <span className="mr-3 inline-block w-8 select-none text-right text-slate-500">{i + 1}</span>
          {l}
        </div>
      ))}
    </pre>
  );
}

export default function App() {
  const [url, setUrl] = useState("https://github.com/atharvanavgire10/FieldMind-AI");
  const [repo, setRepo] = useState<RepoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const step = useProgress(loading);

  // files
  const [fileList, setFileList] = useState<{ path: string; language: string; lineCount: number }[]>([]);
  const [openFile, setOpenFile] = useState<{ path: string; content: string; lineCount: number } | null>(null);
  const [openLine, setOpenLine] = useState<number | undefined>(undefined);

  // search
  const [q, setQ] = useState("POST /api");
  const [hits, setHits] = useState<SearchHit[]>([]);

  // ask
  const [question, setQuestion] = useState("What does this project do?");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<{ file: string; line: number; endLine?: number; ref: string }[]>([]);
  const [aiOn, setAiOn] = useState<boolean | null>(null);

  // trace
  const [target, setTarget] = useState("GET /api/tasks");
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [matched, setMatched] = useState<{ method: string; path: string; file: string; line: number } | null>(null);

  // arch
  const [arch, setArch] = useState<{ nodes: { id: string; label: string; kind: string; files: { file: string; line: number }[]; description: string }[]; edges: { from: string; to: string; label: string }[] } | null>(null);

  // risks
  const [findings, setFindings] = useState<Finding[]>([]);
  const [review, setReview] = useState("");

  async function analyze(example: boolean) {
    setLoading(true);
    setError("");
    setRepo(null);
    try {
      const data = example ? await api.analyzeExample() : await api.analyze(url);
      setRepo(data);
      setTab("overview");
      const fl = await api.files(data.id);
      setFileList(fl.files || []);
      const fd = await api.findings(data.id);
      setFindings(fd.findings || []);
      const ar = await api.architecture(data.id);
      setArch(ar);
      if (data.apiRoutes?.[0]) setTarget(`${data.apiRoutes[0].method} ${data.apiRoutes[0].path}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openPath(path: string, line?: number) {
    if (!repo) return;
    try {
      const f = await api.file(repo.id, path);
      setOpenFile(f);
      setOpenLine(line);
      setTab("files");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runSearch() {
    if (!repo || !q.trim()) return;
    try {
      const r = await api.search(repo.id, q);
      setHits(r.results || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runAsk() {
    if (!repo || !question.trim()) return;
    setAnswer("Thinking…");
    try {
      const r = await api.ask(repo.id, question);
      setAnswer(r.answer);
      setCitations(r.citations || []);
      setAiOn(!!r.aiEnabled);
    } catch (e) {
      setAnswer("");
      setError((e as Error).message);
    }
  }

  async function runTrace() {
    if (!repo || !target.trim()) return;
    try {
      const r = await api.trace(repo.id, target);
      setTraceSteps(r.steps || []);
      setMatched(r.matchedRoute || null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runReview() {
    if (!repo) return;
    try {
      const r = await api.review(repo.id, "Prioritize the most important technical risks and what to fix first.");
      setReview(r.review);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!repo) {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-sm font-medium text-slate-500">RepoPilot AI</p>
          <h1 className="mt-2 text-4xl font-bold">Understand any codebase faster.</h1>
          <p className="mt-3 text-slate-600">
            RepoPilot AI analyzes your repository and helps you understand architecture, APIs, dependencies, risks, and code flow.
          </p>
          <div className="mt-8 rounded-lg border border-slate-200 p-4">
            <label className="text-sm font-medium">Paste a public GitHub repository URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-2">
              <button onClick={() => analyze(false)} disabled={loading} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {loading ? "Analyzing…" : "Analyze Repository"}
              </button>
              <button onClick={() => analyze(true)} disabled={loading} className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
                Try Example Repository
              </button>
            </div>
            {loading && (
              <div className="mt-4 text-sm text-slate-600">
                <p className="font-medium">{step}…</p>
                <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-2 animate-pulse bg-slate-700" style={{ width: "60%" }} />
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            {["Explain Project", "Trace API", "Find Risks", "Search Code", "Ask RepoPilot", "Architecture"].map((x) => (
              <div key={x} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">{x}</div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-500">No login required for public repositories. Set GEMINI_API_KEY on the backend for AI-grounded answers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <strong>RepoPilot AI</strong>
          <span className="text-sm text-slate-500">{repo.owner}/{repo.repo}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setRepo(null)} className="rounded border border-slate-300 px-3 py-1 text-sm">New analysis</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6 pb-3">
          {(["overview", "files", "search", "ask", "trace", "arch", "risks"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-sm ${tab === t ? "bg-slate-900 text-white" : "border border-slate-200"}`}
            >
              {t === "overview" ? "Overview" : t === "files" ? "Files" : t === "search" ? "Search" : t === "ask" ? "Ask RepoPilot" : t === "trace" ? "API Trace" : t === "arch" ? "Architecture" : "Risk Review"}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {tab === "overview" && (
          <div>
            <h2 className="text-2xl font-bold">{repo.owner}/{repo.repo}</h2>
            <p className="mt-1 text-slate-600">{repo.description || "No description."}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded border p-3"><p className="text-xs text-slate-500">Files analyzed</p><p className="text-xl font-bold">{repo.fileCount}</p></div>
              <div className="rounded border p-3"><p className="text-xs text-slate-500">Directories</p><p className="text-xl font-bold">{repo.dirCount}</p></div>
              <div className="rounded border p-3"><p className="text-xs text-slate-500">Lines</p><p className="text-xl font-bold">{repo.totalLines}</p></div>
              <div className="rounded border p-3"><p className="text-xs text-slate-500">API routes</p><p className="text-xl font-bold">{repo.apiRoutes.length}</p></div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded border p-3">
                <h3 className="font-semibold">Languages</h3>
                <div className="mt-2 flex flex-wrap gap-1">{Object.entries(repo.languages).map(([k, v]) => <Badge key={k}>{k} · {v}</Badge>)}</div>
                <h3 className="mt-4 font-semibold">Frameworks</h3>
                <div className="mt-2 flex flex-wrap gap-1">{repo.frameworks.length ? repo.frameworks.map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-sm text-slate-500">None detected</span>}</div>
                <h3 className="mt-4 font-semibold">Package managers</h3>
                <div className="mt-2 flex flex-wrap gap-1">{repo.packageManagers.length ? repo.packageManagers.map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-sm text-slate-500">None detected</span>}</div>
              </div>
              <div className="rounded border p-3">
                <h3 className="font-semibold">API routes</h3>
                <ul className="mt-2 max-h-56 overflow-auto text-sm">
                  {repo.apiRoutes.slice(0, 30).map((r, i) => (
                    <li key={i} className="border-b border-slate-100 py-1">
                      <button className="text-left text-blue-700 hover:underline" onClick={() => openPath(r.file, r.line)}>
                        {r.method} {r.path}
                      </button>
                      <span className="ml-2 text-xs text-slate-500">{r.file}:{r.line}</span>
                    </li>
                  ))}
                  {!repo.apiRoutes.length && <li className="text-slate-500">No routes detected.</li>}
                </ul>
              </div>
            </div>
            <div className="mt-4 rounded border p-3">
              <h3 className="font-semibold">Actions</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <button className="rounded border px-3 py-1" onClick={() => { setQuestion("What does this project do? Explain the architecture."); setTab("ask"); }}>Explain Project</button>
                <button className="rounded border px-3 py-1" onClick={() => setTab("arch")}>Explain Architecture</button>
                <button className="rounded border px-3 py-1" onClick={() => setTab("trace")}>Trace API</button>
                <button className="rounded border px-3 py-1" onClick={() => setTab("risks")}>Find Risks</button>
                <button className="rounded border px-3 py-1" onClick={() => setTab("search")}>Search Code</button>
                <button className="rounded border px-3 py-1" onClick={() => setTab("ask")}>Ask RepoPilot</button>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                <p>Tests detected: {repo.testFiles.length} · Env vars: {repo.envVars.length} · .env.example: {repo.hasEnvExample ? "yes" : "no"}</p>
                <p>Entry points: {repo.entryPoints.join(", ") || "—"} · Deploy configs: {repo.deployment.join(", ") || "—"}</p>
              </div>
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <div className="rounded border p-2">
              <h3 className="px-2 py-1 font-semibold">Files ({fileList.length})</h3>
              <ul className="max-h-[600px] overflow-auto text-xs">
                {fileList.map((f) => (
                  <li key={f.path}>
                    <button onClick={() => openPath(f.path)} className={`block w-full truncate px-2 py-1 text-left hover:bg-slate-100 ${openFile?.path === f.path ? "bg-slate-100 font-medium" : ""}`}>
                      {f.path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {openFile ? (
                <div>
                  <h3 className="font-mono text-sm font-semibold">{openFile.path}{openLine ? ` :${openLine}` : ""}</h3>
                  <div className="mt-2"><Code text={openFile.content} highlight={openLine} /></div>
                </div>
              ) : (
                <p className="rounded border p-4 text-sm text-slate-500">Select a file to inspect evidence. Results across the app link here.</p>
              )}
            </div>
          </div>
        )}

        {tab === "search" && (
          <div>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="Search code, e.g. Gemini, /api/tasks, jwt" />
              <button onClick={runSearch} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Search</button>
            </div>
            <ul className="mt-4 space-y-2">
              {hits.map((h, i) => (
                <li key={i} className="rounded border p-3 text-sm">
                  <button className="font-mono text-blue-700 hover:underline" onClick={() => openPath(h.file, h.line)}>{h.file}:{h.line}</button>
                  <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{h.matched}</pre>
                </li>
              ))}
              {!hits.length && <li className="text-sm text-slate-500">No results yet. Run a search.</li>}
            </ul>
          </div>
        )}

        {tab === "ask" && (
          <div>
            <div className="flex gap-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="Where is Gemini used? How does auth work?" />
              <button onClick={runAsk} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Ask</button>
            </div>
            {aiOn !== null && <p className="mt-2 text-xs text-slate-500">{aiOn ? "Grounded Gemini answer with citations." : "Deterministic retrieval summary (set GEMINI_API_KEY for AI synthesis)."}</p>}
            {answer && <pre className="mt-3 whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm">{answer}</pre>}
            {!!citations.length && (
              <ul className="mt-3 space-y-1 text-sm">
                {citations.map((c, i) => (
                  <li key={i}><button className="font-mono text-blue-700 hover:underline" onClick={() => openPath(c.file, c.line)}>{c.ref}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "trace" && (
          <div>
            <div className="flex gap-2">
              <input value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="GET /api/tasks" />
              <button onClick={runTrace} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Trace</button>
            </div>
            {matched && <p className="mt-2 text-sm">Matched route: <span className="font-mono">{matched.method} {matched.path}</span> <span className="text-slate-500">{matched.file}:{matched.line}</span></p>}
            <ol className="mt-4 space-y-2">
              {traceSteps.map((s, i) => (
                <li key={i} className="rounded border p-3 text-sm">
                  <p className="font-semibold">{i + 1}. {s.title} {s.inferred && <span className="ml-1 rounded bg-amber-100 px-1 text-xs">inferred</span>}</p>
                  <p className="text-slate-600">{s.detail}</p>
                  {s.file && <button className="mt-1 font-mono text-blue-700 hover:underline" onClick={() => openPath(s.file!, s.line)}>{s.file}{s.line ? `:${s.line}` : ""}</button>}
                  {s.evidence && <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{s.evidence}</pre>}
                </li>
              ))}
              {!traceSteps.length && <li className="text-sm text-slate-500">Enter an endpoint and run Trace. Missing links are labeled inferred, never fabricated.</li>}
            </ol>
          </div>
        )}

        {tab === "arch" && (
          <div>
            {!arch ? <p className="text-sm text-slate-500">No architecture yet.</p> : (
              <div>
                <div className="flex flex-wrap gap-2">
                  {arch.nodes.map((n) => (
                    <div key={n.id} className="min-w-[200px] flex-1 rounded border p-3">
                      <p className="font-semibold">{n.label}</p>
                      <p className="text-xs text-slate-500">{n.description}</p>
                      <ul className="mt-2 space-y-1 text-xs">
                        {n.files.slice(0, 4).map((f, i) => (
                          <li key={i}><button className="font-mono text-blue-700 hover:underline" onClick={() => openPath(f.file, f.line)}>{f.file}:{f.line}</button></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <h3 className="mt-4 font-semibold">Relationships</h3>
                <ul className="mt-2 text-sm">
                  {arch.edges.map((e, i) => <li key={i} className="border-b py-1">{e.from} → {e.to} <span className="text-slate-500">({e.label})</span></li>)}
                  {!arch.edges.length && <li className="text-slate-500">Only nodes with direct evidence are shown.</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "risks" && (
          <div>
            <div className="flex gap-2">
              <button onClick={runReview} className="rounded border px-3 py-1 text-sm">Generate AI Review</button>
            </div>
            {review && <pre className="mt-3 whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm">{review}</pre>}
            <ul className="mt-4 space-y-2">
              {findings.map((f) => (
                <li key={f.id} className="rounded border p-3 text-sm">
                  <p><span className={`rounded px-1 text-xs ${f.severity === "HIGH" ? "bg-red-100" : f.severity === "MEDIUM" ? "bg-amber-100" : "bg-slate-100"}`}>{f.severity}</span> <strong className="ml-1">{f.title}</strong></p>
                  <button className="font-mono text-blue-700 hover:underline" onClick={() => openPath(f.file, f.line)}>{f.file}:{f.line}</button>
                  <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{f.evidence}</pre>
                  <p className="mt-1 text-slate-600">{f.explanation}</p>
                  <p className="mt-1"><strong>Fix:</strong> {f.remediation}</p>
                </li>
              ))}
              {!findings.length && <li className="text-sm text-slate-500">No findings from deterministic checks.</li>}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
