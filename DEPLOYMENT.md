# Delphi Legacy Code Analyser — Docker Deployment & MCP Server Guide

This guide covers how to deploy the Delphi Legacy Code Analyser in a Docker container and expose it as a Model Context Protocol (MCP) server so that external AI systems (Claude Desktop, Cursor, Windsurf, custom agents) can use all analysis features programmatically without access to the web UI. It also documents the Redis-backed pipeline monitoring system and how external agents or applications can consume real-time pipeline state.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure Overview](#2-project-structure-overview)
3. [Environment Variables](#3-environment-variables)
4. [Step-by-Step Docker Deployment](#4-step-by-step-docker-deployment)
5. [Database Setup](#5-database-setup)
6. [Building and Running the Container](#6-building-and-running-the-container)
7. [Verifying the Deployment](#7-verifying-the-deployment)
8. [Pipeline Monitoring — State Machine Architecture](#8-pipeline-monitoring--state-machine-architecture)
9. [Pipeline Monitoring REST API](#9-pipeline-monitoring-rest-api)
10. [Integrating Pipeline Events with External Systems](#10-integrating-pipeline-events-with-external-systems)
11. [Exposing as an MCP Server](#11-exposing-as-an-mcp-server)
12. [MCP Tool Definitions](#12-mcp-tool-definitions)
13. [MCP Server Implementation](#13-mcp-server-implementation)
14. [Connecting External Systems](#14-connecting-external-systems)
15. [Docker Compose Full Stack](#15-docker-compose-full-stack)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

 - **CLAUDE_API_KEY** (required for the reasoning agent's AI-powered analysis)

---

## 2. Project Structure Overview

```
delphi-legacy-code-analyser/
├── client/                  # React frontend (Vite + Tailwind + shadcn/ui)
│   └── src/components/
│       └── agent-pipeline.tsx  # Real-time pipeline progress UI
├── server/                  # Express.js backend (TypeScript)
│   ├── index.ts             # Server entry point (port 5000, auto-starts Redis)
│   ├── routes.ts            # All REST API endpoints + pipeline monitoring
│   ├── storage.ts           # Database access layer (Drizzle ORM)
│   ├── state-machine.ts     # Pipeline state machine (states, sub-states, transitions)
│   ├── pipeline-events.ts   # Event bus — dual-writes to Redis + PostgreSQL
│   ├── queue.ts             # Redis connection, snapshot CRUD, history management
│   ├── report-generator.ts  # PDF/DOCX report generation
│   └── vite.ts              # Vite dev server integration
├── python/
│   ├── agents/
│   │   ├── orchestrator.py  # 5-step pipeline coordinator (emits STATE_EVENT JSON)
│   │   ├── semantic_agent.py
│   │   ├── reasoning_agent.py
│   │   └── exporter_agent.py
│   └── parser/
│       ├── delphi_parser.py # Delphi source parser
│       └── delphiast_cli    # Compiled Free Pascal parser binary (x86_64 Linux)
├── shared/
│   └── schema.ts            # Database schema (Drizzle ORM) + pipeline_events table
├── delphiast/               # DelphiAST source (Free Pascal)
├── logs/parser/             # Parser debug logs (auto-created)
└── pyproject.toml           # Python dependencies
```

---

## 3. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | Yes | Random string for Express session signing |
| `CLAUDE_API_KEY` | Yes | Claude API key for the reasoning agent |
| `REDIS_URL` | No | Redis connection string (default: `redis://localhost:6379`). Used for pipeline state snapshots |
| `PORT` | No | Server port (default: `5000`) |
| `NODE_ENV` | No | `production` for optimised builds |

---

## 4. Step-by-Step Docker Deployment

### Step 4.1 — Clone the Repository

```bash
git clone <your-repo-url> delphi-analyser
cd delphi-analyser
```

### Step 4.2 — Create the Dockerfile

Create a file named `Dockerfile` in the project root:

```dockerfile
# ============================================================
# Stage 1: Build the Node.js application
# ============================================================
FROM node:20-bookworm AS builder

WORKDIR /app

# Install system deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Production image
# ============================================================
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment and install deps
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml ./
RUN pip install --no-cache-dir psycopg2-binary anthropic

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Python agents and parser
COPY python/ ./python/
COPY shared/ ./shared/

# Copy the compiled DelphiAST binary (x86_64 Linux)
# If targeting ARM64, you will need to recompile — see Troubleshooting
COPY python/parser/delphiast_cli ./python/parser/delphiast_cli
RUN chmod +x ./python/parser/delphiast_cli || true

# Create necessary directories
RUN mkdir -p /tmp/repos /tmp/uploads /app/logs/parser

# Expose the application port
EXPOSE 5000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/projects || exit 1

# Start the application
CMD ["node", "dist/index.cjs"]
```

### Step 4.3 — Create a `.dockerignore` file

```
node_modules
dist
.git
*.log
logs/
.replit
replit.nix
.local/
```

---

## 5. Database Setup

The application requires a PostgreSQL database. You can run one alongside the app using Docker Compose (see Section 12) or use an external database.

### Push the schema to the database

Before starting the app for the first time, you need to create the database tables. Run this from your development machine (with `DATABASE_URL` set):

```bash
npm run db:push
```

Or, from within the running container:

```bash
docker exec -it delphi-analyser npx drizzle-kit push
```

### Database Tables Created

| Table | Purpose |
|---|---|
| `projects` | Project metadata (name, source URL, status) |
| `analysis_jobs` | Pipeline job tracking (step, progress) |
| `parsed_files` | Parsed Delphi file ASTs |
| `rdf_triples` | Knowledge graph RDF triples |
| `analysis_results` | Analysis output (architecture, diagrams, etc.) |
| `agent_logs` | Pipeline agent log entries |
| `pipeline_events` | Granular state machine events (state transitions, sub-state changes) |

---

## 6. Building and Running the Container

### Build the Docker image

```bash
docker build -t delphi-analyser:latest .
```

### Run the container

```bash
docker run -d \
  --name delphi-analyser \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:password@host.docker.internal:5432/delphi" \
  -e SESSION_SECRET="your-random-secret-string" \
  -e CLAUDE_API_KEY="your_key_here" \
  -e NODE_ENV=production \
  delphi-analyser:latest
```

### View logs

```bash
docker logs -f delphi-analyser
```

---

## 7. Verifying the Deployment

### Check the server is running

```bash
curl http://localhost:5000/api/projects
# Expected: [] (empty array if no projects yet)
```

### Create a project and run analysis

```bash
# 1. Create a project
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "my-delphi-project", "sourceType": "github", "sourceUrl": "https://github.com/user/repo"}'

# Response: {"id": "<project-id>", "name": "my-delphi-project", ...}

# 2. Clone the repository
curl -X POST http://localhost:5000/api/projects/<project-id>/clone

# 3. Start analysis
curl -X POST http://localhost:5000/api/projects/<project-id>/analyze

# 4. Check progress
curl http://localhost:5000/api/projects/<project-id>/status
```

---

## 8. Pipeline Monitoring — State Machine Architecture

The analyser includes a Redis-backed state machine that tracks pipeline execution at a granular sub-step level. This is an **additive monitoring layer** — the original PostgreSQL job tracking (`analysis_jobs` table) remains unchanged and is the source of truth for job completion. The state machine provides real-time visibility into what the pipeline is doing *right now*.

### Dual-Write Architecture

```
Python Orchestrator (stdout JSON)
        │
        ▼
Express Route (serialized Promise chain)
        │
        ├──► Redis Snapshot (fast, ephemeral, 24h TTL)
        │      pipeline:{jobId}:state    → PipelineSnapshot
        │      pipeline:{jobId}:history  → PipelineEvent[]
        │
        └──► PostgreSQL pipeline_events table (durable, permanent)
```

The Python orchestrator emits `STATE_EVENT` JSON messages on stdout. The Express server consumes these via a serialized Promise chain (no race conditions) and dual-writes to both Redis (for fast reads by the frontend/APIs) and PostgreSQL (for audit trail).

### State Machine Definition

The pipeline moves through 8 major states in a strict linear order:

```
PENDING → INITIALIZING → PARSING → SEMANTIC_GRAPH → REASONING → EXPORTING → COMPLETED
                                                                              │
                                                             (any state) → FAILED
```

Each processing state contains ordered sub-states that track granular progress:

| State | Sub-States |
|---|---|
| **PARSING** | `scanning_files` → `invoking_delphiast` → `invoking_python_parser` → `building_ast` → `storing_parsed_metadata` → `parsing_complete` |
| **SEMANTIC_GRAPH** | `building_symbol_table` → `resolving_types` → `linking_references` → `analyzing_scopes` → `constructing_graph_nodes` → `constructing_graph_edges` → `attaching_metadata` → `storing_triples` → `semantic_graph_complete` |
| **REASONING** | `indexing_triples` → `analyzing_control_flow` → `analyzing_data_flow` → `analyzing_dependencies` → `detecting_patterns` → `analyzing_architecture` → `analyzing_class_hierarchy` → `computing_complexity` → `scanning_api_contracts` → `generating_sequence_diagrams` → `generating_mvc_diagrams` → `generating_class_interaction_diagrams` → `generating_class_object_diagrams` → `reasoning_complete` |
| **EXPORTING** | `exporting_json` → `exporting_graphml` → `exporting_dot` → `exporting_rdf_turtle` → `generating_bpmn` → `generating_entity_flow` → `compiling_summary` → `storing_exports` → `exporting_complete` |

### Event Types

| Event Type | Emitted When |
|---|---|
| `PIPELINE_STARTED` | Pipeline begins execution |
| `STATE_TRANSITION` | Major state changes (e.g., PARSING → SEMANTIC_GRAPH) |
| `SUB_STATE_ENTERED` | A sub-state begins (e.g., entering `building_ast`) |
| `SUB_STATE_COMPLETED` | A sub-state finishes |
| `STEP_COMPLETED` | A major step finishes (all sub-states done) |
| `PIPELINE_COMPLETED` | Pipeline finishes successfully |
| `PIPELINE_FAILED` | Pipeline fails with an error |
| `METRIC_UPDATE` | Metrics updated (file counts, triple counts, etc.) |

### Key Data Structures

**PipelineSnapshot** (stored in Redis, returned by state API):

```json
{
  "jobId": "73612a5f-22e8-4a5c-aaec-c15486f81f78",
  "projectId": "7faa2a77-bcd1-4652-92a5-7d1c1adc1501",
  "state": "REASONING",
  "subState": "analyzing_dependencies",
  "completedSubStates": ["indexing_triples", "analyzing_control_flow", "analyzing_data_flow"],
  "progress": 52,
  "startedAt": 1741692399000,
  "updatedAt": 1741692400500,
  "metrics": { "tripleCount": 91, "fileCount": 2 }
}
```

**PipelineEvent** (stored in history list and PostgreSQL):

```json
{
  "eventType": "SUB_STATE_ENTERED",
  "jobId": "73612a5f-...",
  "projectId": "7faa2a77-...",
  "timestamp": 1741692400500,
  "state": "REASONING",
  "subState": "analyzing_dependencies",
  "message": "Analyzing unit dependency graph"
}
```

### Redis Keys

| Key Pattern | Type | TTL | Content |
|---|---|---|---|
| `pipeline:{jobId}:state` | String (JSON) | 24h | Current `PipelineSnapshot` |
| `pipeline:{jobId}:history` | List (JSON items) | 24h | Ordered array of `PipelineEvent` objects |

---

## 9. Pipeline Monitoring REST API

Three endpoints expose the pipeline state machine to external consumers:

### `GET /api/pipeline/:jobId/state`

Returns the current pipeline snapshot for a given job.

```bash
curl http://localhost:5000/api/pipeline/<jobId>/state
```

**Response:**

```json
{
  "jobId": "73612a5f-...",
  "projectId": "7faa2a77-...",
  "state": "REASONING",
  "subState": "analyzing_dependencies",
  "completedSubStates": ["indexing_triples", "analyzing_control_flow", "analyzing_data_flow"],
  "progress": 52,
  "startedAt": 1741692399000,
  "updatedAt": 1741692400500,
  "metrics": { "tripleCount": 91 },
  "subStateLabels": {
    "indexing_triples": "Indexing RDF triples",
    "analyzing_control_flow": "Analyzing control flow",
    "analyzing_data_flow": "Analyzing data flow"
  },
  "currentSubStateLabel": "Analyzing dependencies",
  "totalSubStates": 14,
  "completedSubStateCount": 3
}
```

### `GET /api/pipeline/:jobId/history`

Returns the full event timeline for a pipeline run, in chronological order.

```bash
curl http://localhost:5000/api/pipeline/<jobId>/history
```

**Response:** Array of `PipelineEvent` objects (see event structure above). Falls back to PostgreSQL `pipeline_events` table if Redis history has expired.

### `GET /api/pipeline/monitor`

Returns all currently active (non-completed, non-failed) pipelines.

```bash
curl http://localhost:5000/api/pipeline/monitor
```

**Response:**

```json
{
  "activePipelines": [
    {
      "jobId": "73612a5f-...",
      "projectId": "7faa2a77-...",
      "state": "REASONING",
      "subState": "analyzing_dependencies",
      "progress": 52,
      "startedAt": 1741692399000
    }
  ],
  "count": 1
}
```

---

## 10. Integrating Pipeline Events with External Systems

The pipeline monitoring system is designed to be consumed by external agents, CI/CD pipelines, dashboards, or notification systems. Here are several integration patterns:

### Pattern 1: Polling (simplest)

Poll the state endpoint at regular intervals to track progress:

```python
import requests, time

API = "http://localhost:5000"
job_id = "73612a5f-..."

while True:
    resp = requests.get(f"{API}/api/pipeline/{job_id}/state")
    snapshot = resp.json()
    print(f"[{snapshot['state']}] {snapshot.get('subState', 'n/a')} — {snapshot['progress']}%")

    if snapshot["state"] in ("COMPLETED", "FAILED"):
        break

    time.sleep(2)
```

### Pattern 2: Webhook-style (via event history diffing)

Compare event history between polls to detect new events and trigger webhooks:

```javascript
const API = "http://localhost:5000";

let lastSeenCount = 0;

async function checkForNewEvents(jobId) {
  const res = await fetch(`${API}/api/pipeline/${jobId}/history`);
  const history = await res.json();

  const newEvents = history.slice(lastSeenCount);
  lastSeenCount = history.length;

  for (const event of newEvents) {
    await forwardToWebhook(event); // Your webhook handler
  }
}

async function forwardToWebhook(event) {
  await fetch("https://your-system.example.com/webhooks/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

// Poll every 3 seconds
setInterval(() => checkForNewEvents("73612a5f-..."), 3000);
```

### Pattern 3: Direct Redis subscription (lowest latency)

If your external system has Redis access, subscribe directly to the Redis keys for near-instant updates:

```python
import redis, json, time

r = redis.Redis(host="localhost", port=6379)

job_id = "73612a5f-..."
key = f"pipeline:{job_id}:state"

last_sub_state = None
while True:
    raw = r.get(key)
    if raw:
        snapshot = json.loads(raw)
        if snapshot.get("subState") != last_sub_state:
            last_sub_state = snapshot.get("subState")
            print(f"New sub-state: {last_sub_state} ({snapshot['progress']}%)")

        if snapshot["state"] in ("COMPLETED", "FAILED"):
            break

    time.sleep(0.5)
```

### Pattern 4: MCP Tool Integration (AI agents)

AI agents using the MCP protocol (Claude Desktop, Cursor, etc.) can use the built-in pipeline monitoring tools:

```
# In an AI agent conversation:
> "Start analysis on my project and tell me when the parsing step finishes"

1. Call start_analysis(projectId) → returns jobId
2. Poll get_pipeline_state(jobId) until state transitions past PARSING
3. Report results to user
```

See the [MCP Tool Definitions](#12-mcp-tool-definitions) section for the full list of monitoring tools.

### Pattern 5: CI/CD Pipeline Gate

Use pipeline state as a quality gate in CI/CD workflows:

```bash
#!/bin/bash
# wait-for-analysis.sh — blocks until pipeline completes or fails

JOB_ID=$1
API="http://localhost:5000"

while true; do
  STATE=$(curl -s "$API/api/pipeline/$JOB_ID/state" | jq -r '.state')
  PROGRESS=$(curl -s "$API/api/pipeline/$JOB_ID/state" | jq -r '.progress')

  echo "Pipeline: $STATE ($PROGRESS%)"

  if [ "$STATE" = "COMPLETED" ]; then
    echo "Analysis complete"
    exit 0
  elif [ "$STATE" = "FAILED" ]; then
    echo "Analysis failed"
    exit 1
  fi

  sleep 5
done
```

### Pattern 6: PostgreSQL Event Query (post-hoc analysis)

For completed pipelines, query the durable `pipeline_events` table:

```sql
-- Get all events for a specific job
SELECT event_type, state, sub_state, message, created_at
FROM pipeline_events
WHERE job_id = '73612a5f-...'
ORDER BY created_at;

-- Calculate time spent in each major state
SELECT state,
       MIN(created_at) AS started,
       MAX(created_at) AS ended,
       EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)) AS duration_seconds
FROM pipeline_events
WHERE job_id = '73612a5f-...'
GROUP BY state
ORDER BY MIN(created_at);

-- Find all failed pipelines in the last 24 hours
SELECT DISTINCT job_id, project_id, message, created_at
FROM pipeline_events
WHERE event_type = 'PIPELINE_FAILED'
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## 11. Exposing as an MCP Server

The Model Context Protocol (MCP) allows AI assistants (Claude Desktop, Cursor, custom agents) to call tools exposed by your server. This section explains how to wrap the Delphi Analyser's REST API as MCP tools.

### Architecture

```
┌─────────────────────┐      stdio / SSE       ┌──────────────────────────┐
│  AI Client          │◄──────────────────────►│  MCP Server              │
│  (Claude Desktop,   │      MCP Protocol       │  (mcp-server.ts)         │
│   Cursor, etc.)     │                         │                          │
└─────────────────────┘                         │  Calls REST API ─────►   │
                                                │  http://localhost:5000   │
                                                └──────────────────────────┘
                                                              │
                                                              ▼
                                                ┌──────────────────────────┐
                                                │  Delphi Analyser App     │
                                                │  (Docker container)      │
                                                │  Express + Python agents │
                                                │  PostgreSQL              │
                                                └──────────────────────────┘
```

### Two Transport Options

| Transport | Use Case | How It Works |
|---|---|---|
| **stdio** | Local AI clients (Claude Desktop, Cursor) | The MCP server runs as a child process, communicating over stdin/stdout |
| **SSE (Server-Sent Events)** | Remote AI clients, multi-user | The MCP server runs as an HTTP endpoint, clients connect via SSE |

---

## 12. MCP Tool Definitions

The following tools expose every feature of the analyser to external systems:

### Project Management Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `list_projects` | List all analysed projects | None |
| `create_project` | Create a new project | `name`, `sourceType` (github/upload), `sourceUrl?` |
| `delete_project` | Delete a project and all its data | `projectId` |
| `get_project_status` | Get project status and pipeline progress | `projectId` |

### Data Ingestion Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `clone_repository` | Clone a Git repository for analysis | `projectId` |
| `start_analysis` | Start the 5-step analysis pipeline | `projectId` |

### Code Exploration Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `list_parsed_files` | List all parsed source files | `projectId` |
| `get_file_ast` | Get the full AST for a specific file | `projectId`, `fileId` |
| `get_file_source` | Get raw source code of a file | `projectId`, `fileId` |

### Knowledge Graph Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `get_triples` | Get RDF triples (paginated) | `projectId`, `limit?`, `offset?` |
| `query_triples` | Query triples by subject/predicate/object pattern | `projectId`, `subject?`, `predicate?`, `object?` |
| `get_graph` | Get full graph data (nodes + edges) | `projectId` |

### Analysis Results Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `get_analysis_results` | Get all analysis results | `projectId` |
| `get_architecture` | Get architecture analysis specifically | `projectId` |
| `get_complexity_metrics` | Get complexity metrics | `projectId` |
| `get_design_patterns` | Get detected design patterns | `projectId` |
| `get_api_soa_contracts` | Get API/SOA web service contract analysis | `projectId` |
| `get_diagrams` | Get UML diagrams (PlantUML/Mermaid source) | `projectId`, `diagramType?` |

### Export Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `export_data` | Export analysis in a format | `projectId`, `format` (json/graphml/dot/turtle) |
| `download_report` | Generate a full analysis report | `projectId`, `format` (pdf/docx) |

### Pipeline Monitoring Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `get_agent_logs` | Get pipeline agent log entries | `projectId` |
| `get_pipeline_state` | Get real-time pipeline state snapshot (current state, sub-state, progress, metrics) | `jobId` |
| `get_pipeline_history` | Get full event timeline for a pipeline run | `jobId` |
| `get_active_pipelines` | List all currently active pipelines with their states | None |

---

## 13. MCP Server Implementation

### Step 13.1 — Install MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### Step 13.2 — Create the MCP Server

Create a file named `mcp-server.ts` in the project root:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.DELPHI_API_URL || "http://localhost:5000";

async function apiCall(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return { data: await res.text(), contentType };
}

const server = new McpServer({
  name: "delphi-legacy-code-analyser",
  version: "1.0.0",
});

// ── Project Management ──────────────────────────────────────

server.tool("list_projects", "List all analysed Delphi projects", {}, async () => {
  const projects = await apiCall("GET", "/api/projects");
  return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
});

server.tool(
  "create_project",
  "Create a new Delphi project for analysis",
  {
    name: z.string().describe("Project name"),
    sourceType: z.enum(["github", "upload"]).describe("Source type"),
    sourceUrl: z.string().optional().describe("Git repository URL (required for github type)"),
  },
  async ({ name, sourceType, sourceUrl }) => {
    const project = await apiCall("POST", "/api/projects", { name, sourceType, sourceUrl });
    return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
  }
);

server.tool(
  "delete_project",
  "Delete a project and all associated data",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    await apiCall("DELETE", `/api/projects/${projectId}`);
    return { content: [{ type: "text", text: `Project ${projectId} deleted successfully.` }] };
  }
);

server.tool(
  "get_project_status",
  "Get project status and analysis pipeline progress",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const status = await apiCall("GET", `/api/projects/${projectId}/status`);
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  }
);

// ── Data Ingestion ──────────────────────────────────────────

server.tool(
  "clone_repository",
  "Clone a Git repository into the project workspace",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const result = await apiCall("POST", `/api/projects/${projectId}/clone`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "start_analysis",
  "Start the 5-step analysis pipeline (Parsing → Semantic → Reasoning → Export)",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const result = await apiCall("POST", `/api/projects/${projectId}/analyze`);
    return { content: [{ type: "text", text: `Analysis started. Job ID: ${result.jobId}. Use get_project_status to monitor progress.` }] };
  }
);

// ── Code Exploration ────────────────────────────────────────

server.tool(
  "list_parsed_files",
  "List all parsed Delphi source files in a project",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const files = await apiCall("GET", `/api/projects/${projectId}/files`);
    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  }
);

server.tool(
  "get_file_ast",
  "Get the parsed AST (Abstract Syntax Tree) of a specific Delphi file",
  {
    projectId: z.string().describe("Project UUID"),
    fileId: z.string().describe("Parsed file UUID"),
  },
  async ({ projectId, fileId }) => {
    const file = await apiCall("GET", `/api/projects/${projectId}/files/${fileId}`);
    return { content: [{ type: "text", text: JSON.stringify(file, null, 2) }] };
  }
);

server.tool(
  "get_file_source",
  "Get the raw source code of a Delphi file",
  {
    projectId: z.string().describe("Project UUID"),
    fileId: z.string().describe("Parsed file UUID"),
  },
  async ({ projectId, fileId }) => {
    const result = await apiCall("GET", `/api/projects/${projectId}/files/${fileId}/source`);
    return { content: [{ type: "text", text: result.source || JSON.stringify(result) }] };
  }
);

// ── Knowledge Graph ─────────────────────────────────────────

server.tool(
  "get_triples",
  "Get RDF triples from the knowledge graph (paginated)",
  {
    projectId: z.string().describe("Project UUID"),
    limit: z.number().optional().default(100).describe("Max triples to return"),
    offset: z.number().optional().default(0).describe("Offset for pagination"),
  },
  async ({ projectId, limit, offset }) => {
    const result = await apiCall("GET", `/api/projects/${projectId}/triples?limit=${limit}&offset=${offset}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "query_triples",
  "Query RDF triples by subject, predicate, and/or object pattern (like SPARQL)",
  {
    projectId: z.string().describe("Project UUID"),
    subject: z.string().optional().describe("Subject filter pattern"),
    predicate: z.string().optional().describe("Predicate filter pattern"),
    object: z.string().optional().describe("Object filter pattern"),
  },
  async ({ projectId, subject, predicate, object }) => {
    const result = await apiCall("POST", `/api/projects/${projectId}/sparql`, { subject, predicate, object });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_graph",
  "Get the full knowledge graph as nodes and edges for visualization",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const graph = await apiCall("GET", `/api/projects/${projectId}/graph`);
    return {
      content: [{
        type: "text",
        text: `Graph with ${graph.nodes?.length || 0} nodes and ${graph.edges?.length || 0} edges.\n\n${JSON.stringify(graph, null, 2)}`,
      }],
    };
  }
);

// ── Analysis Results ────────────────────────────────────────

server.tool(
  "get_analysis_results",
  "Get all analysis results (architecture, patterns, complexity, diagrams, etc.)",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const results = await apiCall("GET", `/api/projects/${projectId}/results`);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "get_analysis_by_type",
  "Get a specific type of analysis result",
  {
    projectId: z.string().describe("Project UUID"),
    resultType: z.enum([
      "architecture", "class_hierarchy", "dependencies", "complexity",
      "patterns", "api_soa_contracts", "control_flow", "data_flow",
      "sequence_diagrams", "mvc_layers", "class_interactions",
      "class_diagrams", "bpmn", "entity_flow",
    ]).describe("Type of analysis result to retrieve"),
  },
  async ({ projectId, resultType }) => {
    const results = await apiCall("GET", `/api/projects/${projectId}/results`);
    const filtered = results.filter((r: any) => r.resultType === resultType);
    if (filtered.length === 0) {
      return { content: [{ type: "text", text: `No results found for type: ${resultType}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
  }
);

// ── Exports ─────────────────────────────────────────────────

server.tool(
  "export_data",
  "Export analysis data in a specified format (JSON, GraphML, DOT, or RDF/Turtle)",
  {
    projectId: z.string().describe("Project UUID"),
    format: z.enum(["json", "graphml", "dot", "turtle"]).describe("Export format"),
  },
  async ({ projectId, format }) => {
    const result = await apiCall("GET", `/api/projects/${projectId}/export/${format}`);
    return { content: [{ type: "text", text: typeof result === "string" ? result : result.data || JSON.stringify(result) }] };
  }
);

server.tool(
  "generate_report",
  "Generate a full analysis report (returns base64-encoded binary)",
  {
    projectId: z.string().describe("Project UUID"),
    format: z.enum(["pdf", "docx"]).describe("Report format"),
  },
  async ({ projectId, format }) => {
    const url = `${API_BASE}/api/projects/${projectId}/report/${format}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Report generation failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      content: [{
        type: "text",
        text: `Report generated successfully (${format.toUpperCase()}, ${buffer.byteLength} bytes). Base64-encoded content follows:\n\n${base64}`,
      }],
    };
  }
);

// ── Pipeline Logs ───────────────────────────────────────────

server.tool(
  "get_agent_logs",
  "Get pipeline agent execution logs for debugging",
  { projectId: z.string().describe("Project UUID") },
  async ({ projectId }) => {
    const logs = await apiCall("GET", `/api/projects/${projectId}/logs`);
    return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
  }
);

// ── Pipeline State Machine Monitoring ───────────────────────

server.tool(
  "get_pipeline_state",
  "Get real-time pipeline state snapshot including current state, sub-state, completed sub-states, progress percentage, and metrics. Use jobId from start_analysis or get_project_status.",
  { jobId: z.string().describe("Analysis job UUID") },
  async ({ jobId }) => {
    const snapshot = await apiCall("GET", `/api/pipeline/${jobId}/state`);
    const lines = [
      `Pipeline State: ${snapshot.state}`,
      `Sub-State: ${snapshot.subState || "none"}`,
      `Progress: ${snapshot.progress}%`,
      `Started: ${new Date(snapshot.startedAt).toISOString()}`,
      `Updated: ${new Date(snapshot.updatedAt).toISOString()}`,
    ];
    if (snapshot.error) lines.push(`Error: ${snapshot.error}`);
    if (snapshot.completedSubStates?.length) {
      lines.push(`\nCompleted Sub-States (${snapshot.completedSubStates.length}):`);
      for (const ss of snapshot.completedSubStates) {
        const label = snapshot.subStateLabels?.[ss] || ss;
        lines.push(`  ✓ ${label}`);
      }
    }
    if (snapshot.currentSubStateLabel) {
      lines.push(`\nActive: ${snapshot.currentSubStateLabel}`);
    }
    if (snapshot.metrics) {
      lines.push(`\nMetrics: ${JSON.stringify(snapshot.metrics, null, 2)}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "get_pipeline_history",
  "Get the full event timeline for a pipeline run — every state transition, sub-state entry/completion, and metric update in chronological order.",
  { jobId: z.string().describe("Analysis job UUID") },
  async ({ jobId }) => {
    const history = await apiCall("GET", `/api/pipeline/${jobId}/history`);
    if (!history.length) {
      return { content: [{ type: "text", text: "No pipeline history found for this job." }] };
    }
    const lines = history.map((e: any) => {
      const ts = new Date(e.timestamp || e.createdAt).toISOString();
      const sub = e.subState ? ` [${e.subState}]` : "";
      return `${ts} ${e.eventType} ${e.state}${sub} — ${e.message || ""}`;
    });
    return { content: [{ type: "text", text: `Pipeline History (${history.length} events):\n\n${lines.join("\n")}` }] };
  }
);

server.tool(
  "get_active_pipelines",
  "List all currently running analysis pipelines with their states, progress, and active sub-states.",
  {},
  async () => {
    const result = await apiCall("GET", "/api/pipeline/monitor");
    if (result.count === 0) {
      return { content: [{ type: "text", text: "No active pipelines." }] };
    }
    const lines = [`${result.count} active pipeline(s):\n`];
    for (const p of result.activePipelines) {
      lines.push(`Job: ${p.jobId}`);
      lines.push(`  State: ${p.state} | Sub-State: ${p.subState || "none"}`);
      lines.push(`  Progress: ${p.progress}%`);
      lines.push(`  Started: ${new Date(p.startedAt).toISOString()}`);
      lines.push("");
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Convenience: Full Workflow ──────────────────────────────

server.tool(
  "analyze_github_repo",
  "One-shot: create project, clone repo, and start analysis for a GitHub URL",
  {
    repoUrl: z.string().describe("GitHub repository URL"),
    projectName: z.string().optional().describe("Project name (defaults to repo name)"),
  },
  async ({ repoUrl, projectName }) => {
    const name = projectName || repoUrl.split("/").pop()?.replace(".git", "") || "untitled";
    const project = await apiCall("POST", "/api/projects", {
      name,
      sourceType: "github",
      sourceUrl: repoUrl,
    });
    await apiCall("POST", `/api/projects/${project.id}/clone`);
    const job = await apiCall("POST", `/api/projects/${project.id}/analyze`);
    return {
      content: [{
        type: "text",
        text: `Project created and analysis started.\n\nProject ID: ${project.id}\nJob ID: ${job.jobId}\n\nUse get_project_status with projectId "${project.id}" to monitor progress.`,
      }],
    };
  }
);

// ── Start the server ────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Delphi Legacy Code Analyser MCP server running on stdio");
}

main().catch(console.error);
```

### Step 13.3 — Build the MCP Server

Add a build script to your `package.json`:

```json
{
  "scripts": {
    "build:mcp": "npx esbuild mcp-server.ts --bundle --platform=node --format=esm --outfile=dist/mcp-server.mjs --external:@modelcontextprotocol/sdk"
  }
}
```

Or compile with `tsx` directly:

```bash
npx tsx mcp-server.ts
```

---

## 14. Connecting External Systems

### Claude Desktop

Add this to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "delphi-analyser": {
      "command": "npx",
      "args": ["tsx", "/path/to/delphi-analyser/mcp-server.ts"],
      "env": {
        "DELPHI_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to your `.cursor/mcp.json` or equivalent:

```json
{
  "mcpServers": {
    "delphi-analyser": {
      "command": "npx",
      "args": ["tsx", "/path/to/delphi-analyser/mcp-server.ts"],
      "env": {
        "DELPHI_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

### Remote / Docker Setup

If the MCP server itself runs inside Docker alongside the analyser:

```dockerfile
# Add to your Dockerfile
RUN npm install @modelcontextprotocol/sdk
COPY mcp-server.ts ./
```

Then configure your AI client to connect to the Docker container:

```json
{
  "mcpServers": {
    "delphi-analyser": {
      "command": "docker",
      "args": ["exec", "-i", "delphi-analyser", "npx", "tsx", "mcp-server.ts"],
      "env": {
        "DELPHI_API_URL": "http://localhost:5000"
      }
    }
  }
}
```

### SSE Transport (for remote multi-user access)

To expose the MCP server over HTTP with SSE transport, replace the `main()` function in `mcp-server.ts`:

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

async function main() {
  const app = express();
  const MCP_PORT = parseInt(process.env.MCP_PORT || "3001");

  let transport: SSEServerTransport;

  app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    await transport.handlePostMessage(req, res);
  });

  app.listen(MCP_PORT, () => {
    console.error(`MCP SSE server listening on port ${MCP_PORT}`);
  });
}
```

---

## 15. Docker Compose Full Stack

Create `docker-compose.yml`:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: delphi
      POSTGRES_PASSWORD: delphi_secret
      POSTGRES_DB: delphi_analyser
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U delphi"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgresql://delphi:delphi_secret@postgres:5432/delphi_analyser
      REDIS_URL: redis://redis:6379
      SESSION_SECRET: change-this-to-a-random-string
      CLAUDE_API_KEY: ${CLAUDE_API_KEY}
      NODE_ENV: production
      PORT: "5000"
    volumes:
      - repos:/tmp/repos
      - uploads:/tmp/uploads
      - logs:/app/logs

volumes:
  pgdata:
  redisdata:
  repos:
  uploads:
  logs:
```

### Running

```bash
# Set your Claude API key
export CLAUDE_API_KEY="your_key_here"

# Start everything
docker compose up -d

# Push the database schema (first time only)
docker compose exec app npx drizzle-kit push

# View logs
docker compose logs -f app

# Access the web UI
open http://localhost:5000

# Stop everything
docker compose down
```

---

## 16. Troubleshooting

### delphiast_cli binary fails to run

The pre-compiled binary is built for x86_64 Linux. If you are running on ARM64 (Apple Silicon / AWS Graviton), the binary will not work. The application automatically falls back to the built-in Python parser, so this is not a hard failure — you just lose the optimised parser path. To recompile for your architecture:

```bash
# Install Free Pascal
apt-get install fp-compiler

# Compile
cd python/parser
fpc -MDelphi \
  -Fi../../delphiast/Source/SimpleParser \
  -Fu../../delphiast/Source \
  -Fu../../delphiast/Source/SimpleParser \
  -Fu../../delphiast/Source/FreePascalSupport \
  -Fu../../delphiast/Source/FreePascalSupport/FPC_StringBuilder \
  -FE. -o./delphiast_cli delphiast_cli.lpr
```

### Database connection refused

Ensure the `DATABASE_URL` is correct and the PostgreSQL container is healthy before the app starts. Docker Compose with `depends_on: condition: service_healthy` handles this automatically.

### Analysis stuck at a step

Check the parser debug logs:

```bash
# Inside the container
cat /app/logs/parser/parser_<project-id>_*.log

# Or from outside
docker compose exec app cat logs/parser/parser_*.log
```

Also check agent logs via the API:

```bash
curl http://localhost:5000/api/projects/<project-id>/logs
```

### Port conflicts

If port 5000 is in use, change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:5000"  # Maps host port 8080 to container port 5000
```

Then update the `DELPHI_API_URL` for the MCP server accordingly.

### Report generation timeout

Large projects with many diagrams may take 30+ seconds to generate reports because each diagram is fetched from external rendering servers (plantuml.com, mermaid.ink). If you experience timeouts, increase your HTTP client timeout or consider running a local PlantUML server:

```yaml
# Add to docker-compose.yml
plantuml:
  image: plantuml/plantuml-server:jetty
  ports:
    - "8080:8080"
```

Then update the PlantUML URL in `server/report-generator.ts` to point to `http://plantuml:8080`.
