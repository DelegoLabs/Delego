
import type { Server, IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { createLogger } from "@delego/utils";

const SERVICE_NAME = "notifications";
const log = createLogger(SERVICE_NAME, process.env.LOG_LEVEL ?? "info");
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const HEARTBEAT_TIMEOUT = 60_000; // 60 seconds

export interface PushConnection {
  connectionId: string;
  userId: string;
  subscribedTopics: string[];
  connectedAt: string;
  lastHeartbeatAt: string;
  ws: WebSocket;
  heartbeatTimeout?: NodeJS.Timeout;
}

export interface PushNotificationEvent {
  topic: string;
  type: string;
  payload: Record<string, unknown>;
  publishedAt: string;
}

const connections = new Map<string, PushConnection>();
const redisSubscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

redisSubscriber.subscribe("notifications:*", (err: Error | null | undefined) => {
  if (err) {
    log.error("Failed to subscribe to Redis channel", { error: err });
  } else {
    log.info("Subscribed to Redis notifications channel");
  }
});

redisSubscriber.on("message", (_channel: string, message: string) => {
  try {
    const event: PushNotificationEvent = JSON.parse(message);
    broadcastToTopic(event.topic, event);
  } catch (err) {
    log.error("Failed to parse Redis message", { error: err });
  }
});

function verifyJwt(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "object" && decoded !== null && "userId" in decoded) {
      return decoded as { userId: string };
    }
    return null;
  } catch {
    return null;
  }
}

function sendMessage(ws: WebSocket, message: unknown) {
  ws.send(JSON.stringify(message));
}

function broadcastToTopic(topic: string, event: PushNotificationEvent) {
  for (const conn of connections.values()) {
    if (conn.subscribedTopics.includes(topic)) {
      sendMessage(conn.ws, event);
    }
  }
}

function handleConnection(ws: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(401, "Missing authentication token");
    return;
  }

  const decoded = verifyJwt(token);
  if (!decoded) {
    ws.close(401, "Invalid authentication token");
    return;
  }

  const connectionId = randomUUID();
  const connectedAt = new Date().toISOString();

  const initialTopics = ["user:" + decoded.userId];
  const connection: PushConnection = {
    connectionId,
    userId: decoded.userId,
    subscribedTopics: initialTopics,
    connectedAt,
    lastHeartbeatAt: connectedAt,
    ws,
  };

  connections.set(connectionId, connection);

  log.info("New WebSocket connection established", {
    connectionId,
    userId: decoded.userId,
  });

  const resetHeartbeat = () => {
    if (connection.heartbeatTimeout) {
      clearTimeout(connection.heartbeatTimeout);
    }

    connection.lastHeartbeatAt = new Date().toISOString();

    connection.heartbeatTimeout = setTimeout(() => {
      log.warn("WebSocket connection timed out, closing", {
        connectionId,
        userId: decoded.userId,
      });
      ws.close(408, "Heartbeat timeout");
      connections.delete(connectionId);
    }, HEARTBEAT_TIMEOUT);
  };

  resetHeartbeat();

  ws.on("message", (data: import("ws").RawData) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "ping") {
        sendMessage(ws, { type: "pong" });
        resetHeartbeat();
      } else if (message.type === "subscribe") {
        const topics = message.topics || [];
        connection.subscribedTopics = [
          ...new Set([...connection.subscribedTopics, ...topics]),
        ];
        sendMessage(ws, {
          type: "subscribed",
          topics: connection.subscribedTopics,
        });
      } else if (message.type === "unsubscribe") {
        const topics = message.topics || [];
        connection.subscribedTopics = connection.subscribedTopics.filter(
          (t) => !topics.includes(t)
        );
        sendMessage(ws, {
          type: "unsubscribed",
          topics: connection.subscribedTopics,
        });
      }
    } catch (err) {
      log.error("Failed to process WebSocket message", {
        error: err,
        connectionId,
      });
    }
  });

  ws.on("close", () => {
    log.info("WebSocket connection closed", {
      connectionId,
      userId: decoded.userId,
    });
    if (connection.heartbeatTimeout) {
      clearTimeout(connection.heartbeatTimeout);
    }
    connections.delete(connectionId);
  });

  ws.on("error", (err: Error) => {
    log.error("WebSocket connection error", {
      error: err,
      connectionId,
      userId: decoded.userId,
    });
  });
}

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", handleConnection);

  log.info("WebSocket server initialized");

  return wss;
}

