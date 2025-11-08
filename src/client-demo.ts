// src/client-demo.ts
import WebSocket from "ws";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

const SERVER = process.env.SERVER || "http://localhost:3000";
const WS = SERVER.replace(/^http/, "ws") + "/mcp/ws";

async function getToken() {
  try {
    const res = await fetch(${SERVER}/token);
    const j = await res.json();
    return j.token;
  } catch (e) {
    return jwt.sign({ sub: "demo-user", scopes: ["basic"] }, "dev-secret", { expiresIn: "1h" });
  }
}

(async () => {
  const token = await getToken();
  const ws = new WebSocket(${WS}?token=);

  ws.on("open", () => {
    console.log("ws open");
    const sub = { jsonrpc: "2.0", id: 1, method: "subscribe", params: { channel: "tasks" } };
    ws.send(JSON.stringify(sub));

    const call = {
      jsonrpc: "2.0",
      id: 2,
      method: "callTool",
      params: { tool: "suggestAssignee", args: { title: "Fix login bug" } }
    };
    ws.send(JSON.stringify(call));

    setTimeout(async () => {
      const resp = await fetch(${SERVER}/tasks, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fix login bug" })
      });
      const created = await resp.json();
      console.log("Created task via REST:", created);
    }, 500);
  });

  ws.on("message", (data) => {
    const obj = JSON.parse(data.toString());
    console.log("RECV>", JSON.stringify(obj, null, 2));
  });

  ws.on("close", () => console.log("ws closed"));
})();
