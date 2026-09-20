import type { AnalyzedFile, SearchHit } from "../types.js";

export function searchFiles(files: AnalyzedFile[], query: string, limit = 40): SearchHit[] {
  const q = (query || "").trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const hits: SearchHit[] = [];
  const occurrences = new Map<string, number>();
  for (const f of files) {
    if (f.size > 300_000) continue;
    const lines = f.content.split("\n");
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(lower)) continue;
      count++;
      hits.push({
        file: f.path,
        line: i + 1,
        matched: lines[i].trim().slice(0, 300),
        contextBefore: lines.slice(Math.max(0, i - 2), i).map((l) => l.slice(0, 300)),
        contextAfter: lines.slice(i + 1, i + 3).map((l) => l.slice(0, 300)),
      });
      if (hits.length >= limit * 3) break;
    }
    if (count > 0) occurrences.set(f.path, count);
    // Filename-only match: surface the file even with no content hit.
    if (count === 0 && f.path.toLowerCase().includes(lower)) {
      hits.push({
        file: f.path,
        line: 1,
        matched: (lines[0] || "").trim().slice(0, 300),
        contextBefore: [],
        contextAfter: lines.slice(1, 3).map((l) => l.slice(0, 300)),
        filenameMatch: true,
      });
    }
    if (hits.length >= limit * 3) break;
  }
  return rankHits(hits, q, occurrences).slice(0, limit);
}

function rankHits(hits: SearchHit[], q: string, occurrences: Map<string, number>): SearchHit[] {
  const lower = q.toLowerCase();
  const wordRe = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return hits.sort((a, b) => {
    if (!!a.filenameMatch !== !!b.filenameMatch) return a.filenameMatch ? -1 : 1;
    const aWord = wordRe.test(a.matched.toLowerCase()) ? 0 : 1;
    const bWord = wordRe.test(b.matched.toLowerCase()) ? 0 : 1;
    if (aWord !== bWord) return aWord - bWord;
    const ac = occurrences.get(a.file) || 0;
    const bc = occurrences.get(b.file) || 0;
    if (ac !== bc) return bc - ac;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });
}

export interface RetrievedChunk {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

export function retrieveRelevantChunks(files: AnalyzedFile[], question: string, maxChunks = 8): RetrievedChunk[] {
  const raw = (question.toLowerCase().match(/[a-z0-9_./-]+/g) || []).filter((t) => t.length > 2);
  // Add shortened stems so "authentication" also matches "auth", "payments" matches "payment", etc.
  const tokens = Array.from(
    new Set(raw.flatMap((t) => (t.length >= 6 ? [t, t.slice(0, 5), t.slice(0, 4)] : [t])))
  );
  if (!tokens.length) return [];
  const scored: RetrievedChunk[] = [];
  for (const f of files) {
    if (f.size > 250_000) continue;
    const lines = f.content.split("\n");
    // score whole file
    const lowerContent = f.content.toLowerCase();
    let fileScore = 0;
    for (const t of tokens) {
      if (lowerContent.includes(t)) fileScore += t.length > 5 ? 3 : 1;
      if (f.path.toLowerCase().includes(t.replace(/['"`]/g, ""))) fileScore += 4;
    }
    if (fileScore === 0) continue;
    // find best window
    let bestStart = 0;
    let bestScore = 0;
    const window = 60;
    for (let s = 0; s < lines.length; s += 20) {
      const chunk = lines.slice(s, s + window).join("\n").toLowerCase();
      let sc = 0;
      for (const t of tokens) if (chunk.includes(t)) sc += 1;
      if (sc > bestScore) {
        bestScore = sc;
        bestStart = s;
      }
    }
    if (bestScore === 0) continue;
    const end = Math.min(lines.length, bestStart + window);
    scored.push({
      file: f.path,
      startLine: bestStart + 1,
      endLine: end,
      text: lines.slice(bestStart, end).join("\n").slice(0, 6000),
      score: fileScore * 2 + bestScore,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, maxChunks);
}
