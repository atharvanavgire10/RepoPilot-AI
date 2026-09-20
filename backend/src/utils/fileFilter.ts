const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".mp3", ".mp4", ".wav", ".mov", ".avi",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
  ".sqlite", ".db",
]);

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_FILES_TO_FETCH = 140;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export function shouldIgnorePath(path: string): boolean {
  const parts = path.split("/");
  for (const p of parts) {
    if (IGNORED_DIRS.has(p)) return true;
  }
  const base = parts[parts.length - 1];
  if (IGNORED_FILES.has(base)) return true;
  if (base.endsWith(".map")) return true;
  if (base.endsWith(".min.js")) return true;
  const dot = base.lastIndexOf(".");
  if (dot >= 0) {
    const ext = base.slice(dot).toLowerCase();
    if (BINARY_EXTS.has(ext)) return true;
  }
  return false;
}

export function isProbablyTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return true;
  const ext = path.slice(dot).toLowerCase();
  return !BINARY_EXTS.has(ext);
}

export function safeRepoPath(path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  if (path.length > 512) return false;
  return true;
}
