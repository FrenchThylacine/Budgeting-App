import { app } from "../server/src/app";

// Vercel invokes this Express application for every /api/* request. The local
// Node server continues to use server/src/index.ts so development behavior is
// unchanged.
export default app;
