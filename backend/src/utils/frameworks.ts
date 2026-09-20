import type { AnalyzedFile } from "../types.js";

export interface FrameworkSignals {
  frameworks: string[];
  packageManagers: string[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function detectFrameworks(files: AnalyzedFile[]): FrameworkSignals {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  let dependencies: Record<string, string> = {};
  let scripts: Record<string, string> = {};

  const byPath = new Map(files.map((f) => [f.path, f]));

  const pkgFiles = files.filter((f) => /(^|\/)package\.json$/.test(f.path));
  for (const pf of pkgFiles) {
    const data = parseJsonSafe(pf.content) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") continue;
    const deps = {
      ...((data.dependencies as Record<string, string>) || {}),
      ...((data.devDependencies as Record<string, string>) || {}),
    };
    if (Object.keys(dependencies).length === 0) {
      dependencies = { ...((data.dependencies as Record<string, string>) || {}) };
      scripts = { ...((data.scripts as Record<string, string>) || {}) };
    } else {
      dependencies = { ...dependencies, ...((data.dependencies as Record<string, string>) || {}) };
    }
    const has = (name: string) => name in deps;
    if (has("react")) frameworks.add("React");
    if (has("next")) frameworks.add("Next.js");
    if (has("vue")) frameworks.add("Vue");
    if (has("nuxt")) frameworks.add("Nuxt");
    if (has("svelte") || has("@sveltejs/kit")) frameworks.add("Svelte");
    if (has("angular") || has("@angular/core")) frameworks.add("Angular");
    if (has("express")) frameworks.add("Express");
    if (has("fastify")) frameworks.add("Fastify");
    if (has("koa")) frameworks.add("Koa");
    if (has("hono")) frameworks.add("Hono");
    if (has("nest") || has("@nestjs/core")) frameworks.add("NestJS");
    if (has("tailwindcss")) frameworks.add("Tailwind CSS");
    if (has("vite")) frameworks.add("Vite");
    if (has("prisma") || has("@prisma/client")) frameworks.add("Prisma");
    if (has("mongoose")) frameworks.add("Mongoose");
    if (has("typeorm")) frameworks.add("TypeORM");
    if (has("drizzle-orm")) frameworks.add("Drizzle");
    if (has("sequelize")) frameworks.add("Sequelize");
    if (has("passport")) frameworks.add("Passport");
    if (has("next-auth")) frameworks.add("NextAuth");
    if (has("@clerk/nextjs") || has("@clerk/clerk-sdk-node")) frameworks.add("Clerk");
    if (has("stripe")) frameworks.add("Stripe");
    if (has("openai")) frameworks.add("OpenAI");
    if (has("@google/generative-ai") || has("@google/genai")) frameworks.add("Gemini");
  }

  // package managers
  const names = files.map((f) => f.path);
  if (names.some((p) => p.endsWith("package-lock.json"))) packageManagers.add("npm");
  if (names.some((p) => p.endsWith("yarn.lock"))) packageManagers.add("yarn");
  if (names.some((p) => p.endsWith("pnpm-lock.yaml"))) packageManagers.add("pnpm");
  if (names.some((p) => p.endsWith("bun.lockb"))) packageManagers.add("bun");
  if (names.some((p) => /(^|\/)requirements\.txt$/.test(p))) {
    frameworks.add("Python");
    packageManagers.add("pip");
  }
  if (names.some((p) => /(^|\/)pyproject\.toml$/.test(p))) {
    frameworks.add("Python");
    packageManagers.add("pip/poetry");
  }
  if (names.some((p) => /(^|\/)go\.mod$/.test(p))) {
    frameworks.add("Go");
    packageManagers.add("go modules");
  }
  if (names.some((p) => /(^|\/)Cargo\.toml$/.test(p))) {
    frameworks.add("Rust");
    packageManagers.add("cargo");
  }
  if (names.some((p) => /(^|\/)Gemfile$/.test(p))) frameworks.add("Ruby on Rails/Bundler");
  if (names.some((p) => /(^|\/)composer\.json$/.test(p))) frameworks.add("PHP/Composer");

  // Heuristic file-based detection when no manifest analyzed
  const allText = files
    .filter((f) => f.size < 200_000)
    .slice(0, 60)
    .map((f) => f.content)
    .join("\n");
  if (/from\s+flask\s+import|from\s+fastapi\s+import/i.test(allText)) frameworks.add("Python (Flask/FastAPI)");
  if (/package\s+main[\s\S]{0,200}net\/http/i.test(allText)) frameworks.add("Go net/http");

  void byPath;
  return {
    frameworks: [...frameworks].sort(),
    packageManagers: [...new Set(packageManagers)],
    dependencies,
    scripts,
  };
}
