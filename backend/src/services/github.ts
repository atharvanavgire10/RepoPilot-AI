import { MAX_FILES_TO_FETCH, MAX_FILE_BYTES, MAX_TOTAL_BYTES, shouldIgnorePath } from "../utils/fileFilter.js";
import { languageForPath } from "../utils/language.js";
import type { AnalyzedFile } from "../types.js";

export interface GhRepoMeta {
  name: string;
  owner: string;
  description: string;
  defaultBranch: string;
}

interface GhTreeItem {
  path: string;
  type: string;
  size?: number;
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoPilot-AI",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function classifyGitHubError(status: number, owner: string, repo: string): Error {
  if (status === 404) return new Error(`Repository could not be accessed. Make sure ${owner}/${repo} is public and the URL is correct.`);
  if (status === 403) {
    return new Error("GitHub rate limit reached. Add a GITHUB_TOKEN in the backend .env file and retry in a minute.");
  }
  if (status === 451) return new Error("Repository is unavailable (DMCA/blocked).");
  return new Error(`GitHub request failed with status ${status}.`);
}

export async function fetchRepoMeta(owner: string, repo: string): Promise<GhRepoMeta> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders() });
  if (!res.ok) throw classifyGitHubError(res.status, owner, repo);
  const data = (await res.json()) as {
    name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    owner: { login: string };
  };
  if (data.private) throw new Error("This repository appears to be private. RepoPilot only supports public repositories.");
  return {
    name: data.name,
    owner: data.owner.login,
    description: data.description || "",
    defaultBranch: data.default_branch || "main",
  };
}

export async function fetchRepoTree(owner: string, repo: string, branch: string): Promise<GhTreeItem[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw classifyGitHubError(res.status, owner, repo);
  const data = (await res.json()) as { tree?: GhTreeItem[]; truncated?: boolean };
  const tree = (data.tree || []).filter((t) => t.type === "blob");
  if (tree.length === 0) throw new Error("Repository is empty or no files could be listed.");
  if (tree.length > 8000) throw new Error("Repository is too large to analyze (over 8000 files). Try a smaller repository.");
  return tree;
}

function pickFilesToFetch(tree: GhTreeItem[]): GhTreeItem[] {
  const candidates = tree.filter((t) => !shouldIgnorePath(t.path));
  // Always include manifests / configs even if large-ish
  const priority = (p: string): number => {
    if (/(^|\/)package\.json$/.test(p)) return 0;
    if (/(^|\/)requirements\.txt$/.test(p)) return 1;
    if (/(^|\/)pyproject\.toml$/.test(p)) return 1;
    if (/(^|\/)go\.mod$/.test(p)) return 1;
    if (/(^|\/)\.env\.example$/.test(p)) return 1;
    if (/(^|\/)docker-compose\.ya?ml$/.test(p)) return 2;
    if (/(^|\/)Dockerfile$/.test(p)) return 2;
    if (/(^|\/)README\.md$/i.test(p)) return 3;
    if (/\.(ts|tsx|js|jsx|py|go|rs|java|rb|php)$/.test(p)) return 5;
    return 9;
  };
  const sorted = [...candidates].sort((a, b) => priority(a.path) - priority(b.path));
  const picked: GhTreeItem[] = [];
  let total = 0;
  for (const item of sorted) {
    if (picked.length >= MAX_FILES_TO_FETCH) break;
    if ((item.size || 0) > MAX_FILE_BYTES) continue;
    if (total + (item.size || 0) > MAX_TOTAL_BYTES) break;
    picked.push(item);
    total += item.size || 20_000;
  }
  return picked;
}

async function fetchRawFile(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(rawUrl, { headers: { "User-Agent": "RepoPilot-AI" } });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (text.includes("\u0000")) return null;
  return text.slice(0, MAX_FILE_BYTES);
}

export async function fetchAnalyzedFiles(
  owner: string,
  repo: string,
  branch: string,
  tree: GhTreeItem[]
): Promise<AnalyzedFile[]> {
  const picked = pickFilesToFetch(tree);
  const files: AnalyzedFile[] = [];
  // modest concurrency
  const queue = [...picked];
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      try {
        const content = await fetchRawFile(owner, repo, branch, item.path);
        if (content == null) continue;
        const lines = content.split("\n").length;
        files.push({
          path: item.path,
          language: languageForPath(item.path),
          size: Buffer.byteLength(content, "utf8"),
          lineCount: lines,
          content,
        });
      } catch {
        // skip individual failures
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
