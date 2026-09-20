import app from "./app.js";

const PORT = Number(process.env.PORT || 3001);

if (process.env.VITEST !== "true") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RepoPilot AI Backend listening on port ${PORT}`);
  });
}

export default app;
