/**
 * Netlify Function — IP Admission Workspace API
 *
 * Creates a minimal Express app WITHOUT pino-http (worker threads) because
 * Netlify's esbuild bundler does not use esbuild-plugin-pino, so pino's
 * worker-thread paths are not emitted and the function crashes on cold start.
 *
 * The regular api-server build uses esbuild-plugin-pino; here we skip pino
 * entirely and use a plain console logger so the bundle is portable.
 *
 * Netlify routes /api/* → this function via netlify.toml redirects.
 * Express is mounted at "/api", so /api/healthz etc. resolve correctly.
 */
import serverless from "serverless-http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "../../artifacts/api-server/src/routes/index.js";

const app: Express = express();

// Minimal request logger — no worker threads, safe in serverless
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[API] ${req.method} ${req.url?.split("?")[0]}`);
  next();
});

app.use(cors());
// Increase JSON limit for cloud backup payloads (can be several hundred KB)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export const handler = serverless(app);
