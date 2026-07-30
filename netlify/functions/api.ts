/**
 * Netlify Function — IP Admission Workspace API
 *
 * Wraps the Express app (artifacts/api-server/src/app.ts) with
 * serverless-http so it can be served as a Netlify Function.
 *
 * Netlify routes /api/* → this function via netlify.toml redirects.
 * The Express app is already mounted at "/api", so paths like
 * /api/healthz are handled correctly.
 */
import serverless from "serverless-http";
import app from "../../artifacts/api-server/src/app.js";

export const handler = serverless(app);
