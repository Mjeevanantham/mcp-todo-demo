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
- **Redis Pub/Sub**: backend publishes task events (created/updated)
- **WebSocket JSON-RPC**: clients connect to ws://<host>/mcp/ws and use JSON-RPC subscribe/unsubscribe and callTool.
- **Client-demo**: connects, subscribes to task events, calls suggestAssignee, and triggers a REST POST to show notifications.

---

## Files
- src/server.ts — main server: REST + MCP WebSocket + Redis integration
- src/client-demo.ts — demo client which subscribes and triggers events
- src/types.ts — TypeScript types
- package.json, tsconfig.json

---

## Quickstart (local)
Requirements: Node 18+, Redis (local or cloud), optionally the Vercel CLI and GitHub CLI.

1. *(Optional)* Link the project to Vercel and sync environment variables:
   ```bash
   vercel link
   vercel env pull .env.development.local
   ```
2. Copy the environment template (or edit the pulled env file):
   ```bash
   cp .env.example .env
   ```
   Update `REDIS_URL`, `PORT`, and `JWT_SECRET` as required. The template points at the provided Redis Cloud instance.
3. Ensure Redis is running/accessible. For local development you can use Docker:
   ```bash
   docker run -p 6379:6379 redis
   ```
4. Install dependencies and start the server:
   ```bash
   npm install
   npm run dev
   ```
5. In a second terminal, run the demo client to observe WebSocket events:
   ```bash
   npm run client
   ```

---

## Deployments
### Vercel (REST + event publisher)
- Deploy the REST API (`/tasks`, `/token`, etc.) to Vercel.
- Configure environment variables in Vercel (`REDIS_URL`, `JWT_SECRET`, `ALLOWED_ORIGIN`, etc.).
- Use `vercel env add` or the dashboard; avoid committing secrets.

### Render (persistent WebSocket server)
1. Add the provided `render.yaml` to the repo root and replace the `repo` placeholder with your GitHub `org/repo`.
2. Commit and push to GitHub:
   ```bash
   git add render.yaml
   git commit -m "chore: add render.yaml for ws service"
   git push origin main
   ```
3. In Render:
   - Create a new Web Service using the repo + `main` branch. Render will auto-detect `render.yaml`.
   - Set environment variables in the Render dashboard (leave blanks in the file):
     - `REDIS_URL` — Upstash URL (e.g. `rediss://...`).
     - `JWT_SECRET` — must match the value used by Vercel so issued tokens validate.
   - Leave the build command (`npm ci && npm run build`) and start command (`npm run start`).
   - Deploy the service; Render will expose a URL like `https://mcp-todo-ws.onrender.com` with WebSocket endpoint `wss://<service>.onrender.com/mcp/ws`.
4. Keep `REDIS_URL` and `JWT_SECRET` rotated if you shared them; never commit secret values to the repo.

---

## Endpoints & tooling
- GET /health, GET /tasks, POST /tasks, PUT /tasks/:id, GET /token
- WebSocket endpoint: ws(s)://<host>/mcp/ws
- JSON-RPC methods: callTool, subscribe, unsubscribe
- Use `curl`, `wscat`, or `npm run client` to exercise the API.

---

## Testing the Render WebSocket
1. Fetch a JWT from the Vercel REST deployment:
   ```bash
   curl https://<vercel-app>.vercel.app/token
   ```
2. Connect a client (e.g. `wscat`) to Render:
   ```bash
   wscat -c "wss://<render-service>.onrender.com/mcp/ws?token=<jwt>"
   ```
3. Subscribe to the task channel:
   ```json
   {"jsonrpc":"2.0","id":1,"method":"subscribe","params":{"channel":"tasks"}}
   ```
4. Create a task through the Vercel REST endpoint to trigger a notification:
   ```bash
   curl -s -X POST https://<vercel-app>.vercel.app/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"Cross-host test from Vercel->Upstash->Render"}'
   ```
5. You should receive a JSON-RPC `notification` in the WebSocket client with the task payload. If not, inspect Render logs and verify the shared secrets/Redis URL.
