# MCP ToDo Demo

A minimal real-time To-Do service demonstrating:
- REST CRUD for tasks.
- Redis pub/sub for backend events.
- An MCP-like JSON-RPC WebSocket server that pushes real-time notifications to connected clients.
- A demo `callTool` method that acts like a model-integrated tool (suggest assignee).
- Example client that subscribes and receives notifications.

This repo is intentionally small so you can run and explore: add a UI, RAG, or real agents later.

---

## Architecture (short)
- **Express REST**: `POST /tasks`, `PUT /tasks/:id`, `GET /tasks`
- **Redis Pub/Sub**: backend publishes `tasks` events (created/updated)
- **WebSocket JSON-RPC**: clients connect to `ws://<host>/mcp/ws` and use JSON-RPC `subscribe`/`unsubscribe` and `callTool`.
- **Client-demo**: connects, subscribes to `tasks`, calls `suggestAssignee`, and triggers a REST POST to show notifications.

---

## Files
- `src/server.ts` — main server: REST + MCP WebSocket + Redis integration
- `src/client-demo.ts` — demo client which subscribes and triggers events
- `src/types.ts` — TypeScript types
- `package.json`, `tsconfig.json`

---

## Quickstart (local)
Requirements: Node 18+, Redis, optionally `vercel` CLI and `gh` (GitHub CLI).

1. Install Redis
   - macOS: `brew install redis` then `brew services start redis`
   - Docker: `docker run -p 6379:6379 redis`
2. Install deps:
```bash
npm install
# mcp-todo-demo
