export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

const GITHUB_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

export function parseGitHubUrl(input: string): ParsedRepoUrl {
  const trimmed = (input || "").trim();
  if (!trimmed) throw friendlyError("Please paste a GitHub repository URL.");
  const m = trimmed.match(GITHUB_RE);
  if (!m) {
    throw friendlyError(
      "That does not look like a GitHub repository URL. Expected format: https://github.com/owner/repo"
    );
  }
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  if (!owner || !repo) throw friendlyError("Could not extract owner and repository from the URL.");
  return { owner, repo };
}

export function friendlyError(message: string): Error & { friendly?: boolean } {
  const e = new Error(message) as Error & { friendly?: boolean };
  e.friendly = true;
  return e;
}

export function isFriendlyError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { friendly?: boolean }).friendly === true;
}
