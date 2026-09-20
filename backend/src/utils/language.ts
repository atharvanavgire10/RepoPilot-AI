const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".sql": "SQL",
  ".sh": "Shell",
  ".dockerfile": "Docker",
  ".tf": "Terraform",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".prisma": "Prisma",
};

export function languageForPath(path: string): string {
  const base = path.split("/").pop() || "";
  const lower = base.toLowerCase();
  if (lower === "dockerfile") return "Docker";
  if (lower === "makefile") return "Makefile";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "Other";
  const ext = base.slice(dot).toLowerCase();
  return EXT_TO_LANG[ext] || "Other";
}

export function isSourceFile(path: string): boolean {
  const lang = languageForPath(path);
  return !["Other", "Markdown", "JSON", "YAML", "TOML"].includes(lang) || /\.(json|ya?ml|toml)$/.test(path);
}

export function countLanguages(paths: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of paths) {
    const lang = languageForPath(p);
    if (lang === "Other" || lang === "Markdown") continue;
    counts[lang] = (counts[lang] || 0) + 1;
  }
  return counts;
}
