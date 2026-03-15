import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import { hashAuthToken } from "../config.js";
import type { WorkerConfig } from "./types.js";

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAuthorized(req: http.IncomingMessage, config: WorkerConfig): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return false;
  }

  return constantTimeEquals(hashAuthToken(token), config.authTokenHash);
}
