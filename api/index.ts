import app from "../backend/src/app.js";

/**
 * Vercel serverless entrypoint. Reuses the same Express app as local
 * development (backend/src/app.ts) — no duplicated API logic.
 * All /api/* routes are rewritten here via vercel.json.
 */
export default app;
