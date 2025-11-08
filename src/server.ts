// src/server.ts
import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { createServer as createHttpServer } from "http";
import type { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import type { WebSocket, RawData } from "ws";
import { createClient, type RedisClientType } from "redis";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import type { JsonRpcRequest, JsonRpcResponse, ClientSession } from "./types";

const PORT = Number(process.env.PORT || 3000);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const app = express();

const allowedOrigins = [
  "https://mcp-todo-ui.vercel.app",
  "http://localhost:3000"
];

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(bodyParser.json());

const server = createHttpServer(app);
const wss = new WebSocketServer({ server, path: "/mcp/ws" });

const redisPub: RedisClientType = createClient({ url: REDIS_URL });
const redisSub: RedisClientType = createClient({ url: REDIS_URL });
redisPub.on("error", (err) => console.error("redis publish error", err));
redisSub.on("error", (err) => console.error("redis subscribe error", err));

let redisEnabled = true;
const redisReady = (async () => {
  try {
    await Promise.all([redisPub.connect(), redisSub.connect()]);
    console.log("Connected to Redis");
  } catch (err) {
    redisEnabled = false;
    console.error("Failed to connect to Redis:", err);
  }
})();

const channelHandlers = new Map<string, (message: string) => void>();
const channelCounts = new Map<string, number>();

type Task = { id: string; title: string; done: boolean; assignee?: string; updatedAt: string };

const tasks = new Map<string, Task>();
const sessions = new Map<string, ClientSession>();

function dispatchNotification(channel: string, message: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    payload = message;
  }
  const notification = { jsonrpc: "2.0", method: "notification", params: { channel, payload } };
  for (const s of sessions.values()) {
    if (s.subscriptions.has(channel)) {
      try {
        s.ws.send(JSON.stringify(notification));
      } catch {
        /* ignore */
      }
    }
  }
}

async function ensureChannelSubscription(channel: string) {
  if (!redisEnabled) return;
  await redisReady;
  if (!redisEnabled) return;
  if (!channelHandlers.has(channel)) {
    const handler = (message: string) => dispatchNotification(channel, message);
    channelHandlers.set(channel, handler);
    channelCounts.set(channel, 0);
    try {
      await redisSub.subscribe(channel, handler);
    } catch (err) {
      channelHandlers.delete(channel);
      channelCounts.delete(channel);
      throw err;
    }
  }
  channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
}

async function releaseChannelSubscription(channel: string) {
  if (!redisEnabled) return;
  await redisReady;
  if (!redisEnabled) return;
  const current = channelCounts.get(channel);
  if (!current) return;
  if (current <= 1) {
    await redisSub.unsubscribe(channel);
    channelHandlers.delete(channel);
    channelCounts.delete(channel);
  } else {
    channelCounts.set(channel, current - 1);
  }
}

async function publishEvent(channel: string, data: unknown) {
  const message = JSON.stringify(data);
  if (!redisEnabled) {
    dispatchNotification(channel, message);
    return;
  }
  await redisReady;
  if (!redisEnabled) {
    dispatchNotification(channel, message);
    return;
  }
  try {
    await redisPub.publish(channel, message);
  } catch (err) {
    console.error("redis publish error", err);
    dispatchNotification(channel, message);
  }
}

type JwtIdentity = (jwt.JwtPayload & { sub?: string; scopes?: string[] }) | string;

function signDemoToken(sub = "demo-user") {
  return jwt.sign({ sub, scopes: ["basic"] }, JWT_SECRET, { expiresIn: "1h" });
}

function verifyToken(token?: string): JwtIdentity | null {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

type TaskPayload = {
  title?: string;
  done?: boolean;
  assignee?: string;
};

app.post("/tasks", (req: Request<unknown, unknown, TaskPayload>, res: Response) => {
  const { title, assignee } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });

  const id = uuidv4();
  const task: Task = { id, title, done: false, assignee, updatedAt: new Date().toISOString() };
  tasks.set(id, task);
  void publishEvent("tasks", { type: "created", task });
  res.status(201).json(task);
});

app.put("/tasks/:id", (req: Request<{ id: string }, unknown, TaskPayload>, res: Response) => {
  const id = req.params.id;
  const current = tasks.get(id);
  if (!current) return res.status(404).json({ error: "not found" });

  const { title, done, assignee } = req.body;
  if (title !== undefined) current.title = title;
  if (done !== undefined) current.done = !!done;
  if (assignee !== undefined) current.assignee = assignee;
  current.updatedAt = new Date().toISOString();

  tasks.set(id, current);
  void publishEvent("tasks", { type: "updated", task: current });
  res.json(current);
});

app.get("/", (_: Request, res: Response) =>
  res.send(
    [
      "mcp-todo-demo server is running.",
      "REST endpoints: POST /tasks, PUT /tasks/:id, GET /tasks, GET /health, GET /token.",
      "WebSocket endpoint: ws(s)://<host>/mcp/ws."
    ].join("\n")
  )
);
app.get("/tasks", (_: Request, res: Response) => res.json(Array.from(tasks.values())));
app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));
app.get("/token", (_: Request, res: Response) => res.json({ token: signDemoToken() }));

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token") ?? undefined;
  const identity = verifyToken(token);

  if (!identity) {
    const err: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: 401, message: "unauthorized" }
    };
    ws.send(JSON.stringify(err));
    ws.close();
    return;
  }

  const sessionId = uuidv4();
  const session: ClientSession = { id: sessionId, ws, subscriptions: new Set(), identity };
  sessions.set(sessionId, session);

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      result: { hello: "mcp-todo-demo", sessionId, capabilities: ["callTool", "subscribe", "unsubscribe"] }
    })
  );

  ws.on("message", (raw: RawData) => {
    let reqObj: JsonRpcRequest;
    try {
      reqObj = JSON.parse(raw.toString());
    } catch {
      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
      );
      return;
    }

    handleRpc(session, reqObj).catch((err) => {
      console.error("rpc error", err);
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: reqObj.id,
          error: { code: -32000, message: "Server error" }
        })
      );
    });
  });

  ws.on("close", () => {
    sessions.delete(sessionId);
    for (const channel of session.subscriptions) {
      void releaseChannelSubscription(channel).catch((err) => console.error("redis unsubscribe error", err));
    }
  });
});

async function handleRpc(session: ClientSession, req: JsonRpcRequest) {
  const ws = session.ws;
  switch (req.method) {
    case "callTool": {
      const { tool, args } = req.params ?? {};
      if (tool === "suggestAssignee") {
        const title: string = args?.title ?? "";
        const lowered = title.toLowerCase();
        let assignee = "unassigned";
        if (lowered.includes("fix") || lowered.includes("bug")) assignee = "alice";
        else if (lowered.includes("design") || lowered.includes("ux")) assignee = "bob";
        else if (lowered.includes("deploy") || lowered.includes("ci")) assignee = "ci-bot";
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { suggested: assignee } }));
        return;
      }
      if (tool === "listTasks") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tasks: Array.from(tasks.values()) } }));
        return;
      }
      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: 404, message: "tool not found" } })
      );
      return;
    }
    case "subscribe": {
      const { channel } = req.params ?? {};
      if (!channel) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: 400, message: "channel required" } }));
        return;
      }
      if (session.subscriptions.has(channel)) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { subscribed: channel } }));
        return;
      }
      session.subscriptions.add(channel);
      try {
        await ensureChannelSubscription(channel);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { subscribed: channel } }));
      } catch (err) {
        session.subscriptions.delete(channel);
        console.error("subscribe error", err);
        ws.send(
          JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: 500, message: "failed to subscribe to channel" } })
        );
      }
      return;
    }
    case "unsubscribe": {
      const { channel } = req.params ?? {};
      if (channel && session.subscriptions.delete(channel)) {
        void releaseChannelSubscription(channel).catch((err) => console.error("unsubscribe error", err));
      }
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { unsubscribed: channel } }));
      return;
    }
    default:
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }));
  }
}

server.listen(PORT, () => {
  console.log(`Server listening http://localhost:${PORT}`);
  console.log(`WebSocket MCP endpoint ws://localhost:${PORT}/mcp/ws`);
  console.log(`GET /token to fetch a demo JWT`);
});
