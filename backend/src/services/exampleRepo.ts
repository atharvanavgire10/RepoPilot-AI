import fs from "node:fs";
import path from "node:path";
import { shouldIgnorePath, MAX_FILE_BYTES } from "../utils/fileFilter.js";
import { languageForPath } from "../utils/language.js";
import type { AnalyzedFile } from "../types.js";

export function loadExampleRepoFiles(): AnalyzedFile[] {
  // cwd-based on purpose: works under tsx (ESM, no __dirname), ts-node,
  // vitest, compiled dist, and Vercel functions (cwd = project root).
  // npm workspace scripts run with cwd=backend/, root scripts with cwd=root/.
  const candidates = [
    path.resolve(process.cwd(), "example-repo"),
    path.resolve(process.cwd(), "..", "example-repo"),
    ...walkUpForExampleRepo(process.cwd()),
  ];
  const root = candidates.find((c) => fs.existsSync(c));
  if (!root) throw new Error("example-repo fixture not found");
  const out: AnalyzedFile[] = [];
  walk(root, root, out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function walkUpForExampleRepo(start: string): string[] {
  // Serverless runtimes may start deeper in the tree; search upward a few levels.
  const out: string[] = [];
  let dir = path.resolve(start);
  for (let i = 0; i < 4; i++) {
    dir = path.dirname(dir);
    out.push(path.join(dir, "example-repo"));
  }
  return out;
}

function walk(root: string, dir: string, out: AnalyzedFile[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    if (shouldIgnorePath(rel)) continue;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(root, full, out);
    } else if (e.isFile()) {
      try {
        const stat = fs.statSync(full);
        if (stat.size > MAX_FILE_BYTES) continue;
        const buf = fs.readFileSync(full);
        if (buf.includes(0)) continue;
        const content = buf.toString("utf8").slice(0, MAX_FILE_BYTES);
        out.push({
          path: rel,
          language: languageForPath(rel),
          size: stat.size,
          lineCount: content.split("\n").length,
          content,
        });
      } catch {
        // skip
      }
      if (out.length >= 140) return;
    }
  }
}
