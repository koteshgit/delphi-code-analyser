# Delphi Legacy Code Analyser

## Overview
A web application that analyzes Delphi/Object Pascal legacy codebases using a 5-step multi-agent pipeline. It parses Delphi source code, builds semantic knowledge graphs as RDF triples stored in PostgreSQL, and provides interactive visualization, SPARQL querying, and multi-format exports.

## Architecture
- **Frontend**: React + shadcn/ui + Tailwind CSS (Vite dev server)
- **Backend API**: Node.js/Express
- **Analysis Engine**: Python 3.11 (rule-based parser + agents)
- **Database**: PostgreSQL with RDF triple store pattern
- **Package Manager**: npm (Node.js), pip/uv (Python)
- **Font**: Open Sans, primary color: blue (hsl 217 91%)

## 5-Step Analysis Pipeline

### Step 1: Parsing Agent
- **File**: `python/parser/delphi_parser.py`
- Tries DelphiAST (FPC-compiled CLI at `python/parser/delphiast_cli`) first, falls back to built-in Python lexer/parser
- Extracts units, classes, methods, properties, uses clauses, type definitions
- DelphiAST source: `delphiast/` (FPC 3.2.2, compiled with `StrLCopy`/`PtrInt` patches for x86_64)
- Note: Full AST builder segfaults due to FPC compatibility with 184 virtual method overrides; lexer works
- **Parser debug logs**: Written to `logs/parser/parser_{projectId}_{timestamp}.log` — logs every file parsed, which parser handled it, fallback reasons, timing, and a summary at the end

### Step 2-3: Semantic & Graph Constructor Agent
- **File**: `python/agents/semantic_agent.py`
- **Step 2 - Semantic Analysis**: Symbol Table Building, Type Resolution, Reference Linking, Scope Analysis
- **Step 3 - Graph Construction**: Node Creation (classes, methods, fields, etc.), Edge Creation (calls, inheritance, dependencies), Metadata Attachment
- Uses `SemanticAnalyzer` + `GraphConstructor` classes
- Entry point: `run_semantic_analysis(parsed_files, project_id)` returns `{triples, semantic_data, stats}`

### Step 4: Reasoning Agent
- **File**: `python/agents/reasoning_agent.py`
- Control Flow Analysis (event handler chains, form flows, init sequences)
- Data Flow Analysis (entity transformations, parameter passing)
- Dependency Analysis (circular detection, coupling metrics, layering)
- Pattern Detection (Singleton, Factory, Observer, Adapter, Command, Strategy, Visitor, MVC)
- **API / SOA Web Service Contracts**: Detects SOAP (TInvokableClass, THTTPRIO, WSDL, IInvokable), REST (TWebModule, MVCFramework, XData, mORMot), DataSnap (TDSServerModule, ServerMethods), Indy servers (TIdHTTPServer), WebBroker modules; enumerates endpoints, methods, protocols, frameworks, invokable interfaces, and service contract bindings
- Architecture Analysis + Class Hierarchy + Complexity Metrics
- **UML 2.0 Diagrams** (both PlantUML and Mermaid syntax):
  - Sequence Diagrams: form interaction flows, service layer sequences
  - MVC Layer Diagrams: component packages with cross-layer dependencies
  - Class & Object Interaction Diagrams: composition and inheritance graphs
  - Class & Object Diagrams: detailed class structure with fields/methods/properties
- Entry point: `ReasoningAgent(triples, parsed_files, semantic_data).analyze()`

### Step 5: Exporter Agent
- **File**: `python/agents/exporter_agent.py`
- JSON Export (full analysis data)
- GraphML Export (for Gephi/yEd)
- DOT Export (for Graphviz)
- RDF/Turtle Export (standard RDF serialization)
- BPMN Workflow Diagrams
- Business Data Entity Flow Diagrams
- Entry point: `ExporterAgent(triples, parsed_files, results, project_id).export_all()`

### Orchestrator
- **File**: `python/agents/orchestrator.py`
- Coordinates all 5 steps with progress tracking (0-20%, 20-50%, 50-70%, 70-95%, 95-100%)
- Persists all data to PostgreSQL (parsed files, triples, analysis results, exports)
- Emits structured state events via stdout JSON for BullMQ consumption (type: "STATE_EVENT")

## Message-Driven State Machine (Redis/BullMQ)
- **Redis**: Auto-started on server boot (port 6379)
- **BullMQ Queues**: `pipeline-events` (all events), `state-transitions` (major state changes)
- **State Machine**: `server/state-machine.ts` — 8 major states (PENDING, INITIALIZING, PARSING, SEMANTIC_GRAPH, REASONING, EXPORTING, COMPLETED, FAILED) with 40+ sub-states
- **Event Bus**: `server/pipeline-events.ts` — PipelineEventBus class with BullMQ workers that process state transitions and persist to both Redis (fast snapshot) and PostgreSQL (durable history)
- **Queue Infrastructure**: `server/queue.ts` — Redis connection management, queue/worker factories, snapshot read/write, history management
- **Database**: `pipeline_events` table stores full event history (eventType, state, subState, previousState, message, metadata)
- **Dual Write**: PostgreSQL original state tracking (`_update_job`, `_update_project`, `_log`) runs unchanged; BullMQ layer sits on top for sub-state monitoring
- **Redis Key Pattern**: `pipeline:{jobId}:state` (current snapshot), `pipeline:{jobId}:history` (event list), TTL 24h
- **Monitoring APIs**:
  - `GET /api/pipeline/:jobId/state` — current state, sub-state, completed sub-states, progress, metrics
  - `GET /api/pipeline/:jobId/history` — full state transition history with timestamps
  - `GET /api/pipeline/monitor` — all active pipelines overview

## Key Files
- `shared/schema.ts` - Database schema (projects, analysis_jobs, parsed_files, rdf_triples, analysis_results, agent_logs)
- `server/routes.ts` - API endpoints for project management, analysis, SPARQL, exports
- `server/storage.ts` - Database storage layer using Drizzle ORM
- `client/src/pages/dashboard.tsx` - Project listing dashboard
- `client/src/pages/project-detail.tsx` - Project analysis view with tabs
- `client/src/components/graph-viewer.tsx` - Canvas-based knowledge graph visualization
- `client/src/components/sparql-query.tsx` - Triple pattern query interface
- `client/src/components/code-browser.tsx` - GitHub-style code viewer with file tree, Delphi syntax highlighting, line numbers, and parsed structure view
- `client/src/components/analysis-results.tsx` - Analysis results viewer with export download buttons
- `client/src/components/diagram-renderer.tsx` - PlantUML (via plantuml.com SVG) + Mermaid (client-side) diagram renderers with source toggle
- `client/src/components/agent-pipeline.tsx` - 5-step pipeline progress tracker

## API Endpoints
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/clone` - Clone Git repository
- `POST /api/projects/:id/upload` - Upload zip file
- `POST /api/projects/:id/analyze` - Start analysis pipeline
- `GET /api/projects/:id/status` - Get project + job status
- `GET /api/projects/:id/files` - List parsed files
- `GET /api/projects/:id/files/:fileId` - Get parsed file detail
- `GET /api/projects/:id/files/:fileId/source` - Get raw source code from disk
- `GET /api/projects/:id/triples` - Get RDF triples (paginated)
- `POST /api/projects/:id/sparql` - Query triples by pattern
- `GET /api/projects/:id/results` - Get analysis results
- `GET /api/projects/:id/graph` - Get graph data (nodes + edges)
- `GET /api/projects/:id/export/:format` - Download export (json, graphml, dot, turtle)
- `GET /api/projects/:id/report/:format` - Download full analysis report (pdf, docx)
- `GET /api/projects/:id/logs` - Get agent logs
- `GET /api/pipeline/:jobId/state` - Get pipeline state machine snapshot (Redis-backed)
- `GET /api/pipeline/:jobId/history` - Get state transition history
- `GET /api/pipeline/monitor` - List all active pipelines

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session secret
- Port 5000 (Express + Vite)

---

## Docker & Containerized Deployment

### Quick Start (Docker Compose)

### MCP Server Containerization

The MCP server is now containerized with its own Dockerfile located at `server/Dockerfile`.
The docker-compose.yml is updated to build the MCP server from the `server` directory:

```yaml
  app:
    build:
      context: ./server
      dockerfile: Dockerfile
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
```

#### Steps to Run:
1. **Set your Anthropic API key:**
   Create a `.env` file in your project root:
   ```env
  CLAUDE_API_KEY=your_key_here
   ```
2. **Build and start all containers:**
   ```sh
   docker-compose build
   docker-compose up -d
   ```
3. **Push the database schema (first time only):**
   ```sh
   docker compose exec app npx drizzle-kit push
   ```
4. **View logs:**
   ```sh
   docker compose logs -f app
   ```
5. **Access the web UI:**
   Open http://localhost:5000
6. **Stop everything:**
   ```sh
   docker compose down
   ```

### Manual Docker Build/Run

1. **Build the Docker image:**
  ```sh
  docker build -t delphi-analyser:latest .
  ```
2. **Run the container:**
  ```sh
  docker run -d \
    --name delphi-analyser \
    -p 5000:5000 \
    -e DATABASE_URL="postgresql://user:password@host.docker.internal:5432/delphi" \
    -e SESSION_SECRET="your-random-secret-string" \
    -e CLAUDE_API_KEY="sk-ant-..." \
    -e NODE_ENV=production \
    delphi-analyser:latest
  ```

See `DEPLOYMENT.md` for full details, advanced configuration, and MCP server integration.

---

## Deployment & MCP Server
- **DEPLOYMENT.md** — Full guide for Docker containerization, Docker Compose, Redis setup, MCP server, and pipeline monitoring integration
- MCP server wraps all REST API endpoints as MCP tools for Claude Desktop, Cursor, and other AI clients
- Pipeline monitoring MCP tools: `get_pipeline_state`, `get_pipeline_history`, `get_active_pipelines`
- Supports stdio (local) and SSE (remote) transport modes
- `mcp-server.ts` — MCP server implementation using `@modelcontextprotocol/sdk`
- Integration patterns documented: polling, webhook-style, direct Redis, MCP, CI/CD gate, PostgreSQL SQL queries

## Settings Page
- **Route**: `/settings` — accessible via gear icon in dashboard header
- **Schema**: `llm_settings` table (provider, api_key, model, temperature, top_p, top_k, max_tokens, enabled)
- **API**: GET/PUT `/api/settings/llm`, DELETE `/api/settings/llm/:id`, POST `/api/settings/llm/test`
- **Providers**: Anthropic, OpenAI, Google Gemini, Custom/Local
- API keys are masked (last 4 chars visible) when returned to frontend
- Test Connection endpoint validates keys against provider APIs
- Temperature stored as integer 0-200 (displayed as 0.00-2.00), topP as 0-100 (0.00-1.00)

## Python Dependencies
- psycopg2-binary (PostgreSQL driver)
- anthropic (reasoning agent)

## DelphiAST FPC Compilation
- Binary: `python/parser/delphiast_cli`
- Source: `python/parser/delphiast_cli.lpr`
- Compiler: FPC 3.2.2 at `/nix/store/rn8irkhixy7z0vvs9q3x8vwh5ghcgwqj-fpc-3.2.2/bin/fpc`
- Patches applied to `SimpleParser.Lexer.pas`: `StrPCopy` → `Move` with zeroed buffer, `Integer` → `PtrInt` for buffer offsets
- Compile command: `fpc -MDelphi -Fi../../delphiast/Source/SimpleParser -Fu../../delphiast/Source -Fu../../delphiast/Source/SimpleParser -Fu../../delphiast/Source/FreePascalSupport -Fu../../delphiast/Source/FreePascalSupport/FPC_StringBuilder -FE. -o./delphiast_cli delphiast_cli.lpr`
