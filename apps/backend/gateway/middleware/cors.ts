import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "@delego/utils";
import { getRequestContext } from "./requestId.js";

const log = createLogger("gateway");

export interface CorsRejectionLog {
  requestId: string;
  origin: string;
  path: string;
  rejectedAt: string;
}

/** Apply CORS headers for browser clients; logs origins that are rejected. */
export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const allowed = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3001"];
  const requestOrigin = req.headers.origin ?? "";

  if (allowed.includes(requestOrigin) || allowed.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin || allowed[0]);
  } else if (requestOrigin) {
    logRejectedOrigin(req, requestOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function logRejectedOrigin(req: IncomingMessage, origin: string): void {
  const entry: CorsRejectionLog = {
    requestId: getRequestContext(req)?.requestId ?? "unknown",
    origin,
    path: (req.url ?? "").split("?")[0],
    rejectedAt: new Date().toISOString(),
  };
  log.warn("CORS origin rejected", { ...entry });
}
