import type { IncomingMessage } from "node:http";
import { getBodyLimitConfig, parseJsonLimit } from "../routes/api-v1.js";

function getMaxBodySize(): number {
  return parseJsonLimit(getBodyLimitConfig().jsonLimit);
}

export class InvalidJsonError extends Error {
  constructor(message: string = "Invalid JSON body") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

export class BodyTooLargeError extends Error {
  constructor(message: string = "Body too large") {
    super(message);
    this.name = "BodyTooLargeError";
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;

      if (totalBytes > getMaxBodySize()) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new InvalidJsonError());
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}
