# MCP ToDo Demo

A minimal real-time To-Do service demonstrating:
- REST CRUD for tasks.
- Redis pub/sub for backend events.
- An MCP-like JSON-RPC WebSocket server that pushes real-time notifications to connected clients.
- A demo callTool method that acts like a model-integrated tool (suggest assignee).
- Example client that subscribes and receives notifications.

This repo is intentionally small so you can run and explore: add a UI, RAG, or real agents later.

---

## Architecture (short)
- **Express REST**: POST /tasks, PUT /tasks/:id, GET /tasks
- **Redis Pub/Sub**: backend publishes 	asks events (created/updated)
- **WebSocket JSON-RPC**: clients connect to ws://<host>/mcp/ws and use JSON-RPC subscribe/unsubscribe and callTool.
- **Client-demo**: connects, subscribes to 	asks, calls suggestAssignee, and triggers a REST POST to show notifications.

---

## Files
- src/server.ts — main server: REST + MCP WebSocket + Redis integration
- src/client-demo.ts — demo client which subscribes and triggers events
- src/types.ts — TypeScript types
- package.json, 	sconfig.json

---

## Quickstart (local)
Requirements: Node 18+, Redis (local or cloud), optionally the ercel CLI and gh (GitHub CLI).

1. *(Optional)* Link the project to Vercel and sync environment variables:
   `ash
   vercel link
   vercel env pull .env.development.local
   `
2. Copy the environment template (or edit the pulled env file):
   `ash
   cp .env.example .env
   `
   Update REDIS_URL, PORT, and JWT_SECRET as required. The template points at the provided Redis Cloud instance.
3. Ensure Redis is running/accessible. For local development you can use Docker:
   `ash
   docker run -p 6379:6379 redis
   `
4. Install dependencies and start the server:
   `ash
   npm install
   npm run dev
   `
5. In a second terminal, run the demo client to observe WebSocket events:
   `ash
   npm run client
   `

---

## Endpoints & tooling
- GET /health, GET /tasks, POST /tasks, PUT /tasks/:id, GET /token
- WebSocket endpoint: ws(s)://<host>/mcp/ws
- JSON-RPC methods: callTool, subscribe, unsubscribe

Use curl or 
pm run client to exercise the API. When deployed on Vercel, set REDIS_URL, PORT, and JWT_SECRET via ercel env add and redeploy with ercel --prod --yes.
