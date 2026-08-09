import { closeDatabase, initializeDatabase } from "./db/index";
import { app } from "./app";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, async () => {
  console.log(`Budget API server running on http://${HOST}:${PORT}`);
  try {
    await initializeDatabase();
    console.log("Neon database initialized successfully");
  } catch (error) {
    console.error("Neon database initialization failed on startup:", error);
  }
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  closeDatabase();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
export { server };
