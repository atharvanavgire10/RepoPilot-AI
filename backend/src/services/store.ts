import type { FullAnalysis } from "../types.js";

const store = new Map<string, FullAnalysis>();

export function saveAnalysis(a: FullAnalysis): void {
  store.set(a.id, a);
  if (store.size > 30) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export function getAnalysis(id: string): FullAnalysis | undefined {
  return store.get(id);
}

export function makeId(owner: string, repo: string): string {
  const base = `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60);
  return `${base}-${Date.now().toString(36)}`;
}
