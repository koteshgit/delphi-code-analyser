import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import { generateDocxReport, generatePdfReport } from "./report-generator";
import { pipelineEventBus } from "./pipeline-events";
import { PipelineState, EventType, SUB_STATE_LABELS } from "./state-machine";
import type { PipelineEvent } from "./state-machine";
import { getRedisSnapshot, getHistory, getActivePipelines } from "./queue";

const upload = multer({ dest: "/tmp/uploads/" });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  try {
    await pipelineEventBus.initialize();
    console.log("[Routes] Pipeline event bus initialized");
  } catch (err: any) {
    console.error("[Routes] Failed to initialize pipeline event bus:", err.message);
  }

  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { name, sourceType, sourceUrl } = req.body;
      if (!name || !sourceType) {
        return res.status(400).json({ message: "Name and sourceType are required" });
      }
      const project = await storage.createProject({
        name,
        sourceType,
        sourceUrl: sourceUrl || null,
        status: "pending",
        totalFiles: 0,
        parsedFiles: 0,
        tripleCount: 0,
      });
      res.json(project);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await storage.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/projects/:id/upload", upload.single("file"), async (req, res) => {
    try {
      const projectId = req.params.id as string;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const extractDir = path.join("/tmp/repos", projectId);
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(extractDir, true);

      fs.unlinkSync(req.file.path);

      await storage.updateProject(projectId, { status: "uploaded" });
      res.json({ success: true, path: extractDir });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/projects/:id/clone", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const sourceUrl = project.sourceUrl || req.body.sourceUrl;
      if (!sourceUrl) return res.status(400).json({ message: "No source URL" });

      const repoDir = path.join("/tmp/repos", req.params.id);
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true });
      }
      fs.mkdirSync(repoDir, { recursive: true });

      await storage.updateProject(req.params.id, { status: "cloning" });

      const gitClone = spawn("git", ["clone", "--depth", "1", sourceUrl, repoDir]);

      let stderr = "";
      gitClone.stderr.on("data", (data) => { stderr += data.toString(); });

      gitClone.on("close", async (code) => {
        if (code === 0) {
          await storage.updateProject(req.params.id, { status: "cloned" });
          res.json({ success: true, path: repoDir });
        } else {
          await storage.updateProject(req.params.id, { status: "failed" });
          res.status(500).json({ message: `Clone failed: ${stderr}` });
        }
      });

      gitClone.on("error", async (err) => {
        await storage.updateProject(req.params.id, { status: "failed" });
        res.status(500).json({ message: err.message });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/projects/:id/analyze", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const repoDir = path.join("/tmp/repos", req.params.id);
      if (!fs.existsSync(repoDir)) {
        if (project.sourceType === "github" && project.sourceUrl) {
          fs.mkdirSync(repoDir, { recursive: true });
          try {
            await new Promise<void>((resolve, reject) => {
              const gitClone = spawn("git", ["clone", "--depth", "1", project.sourceUrl!, repoDir]);
              let stderr = "";
              gitClone.stderr.on("data", (data) => { stderr += data.toString(); });
              gitClone.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Clone failed: ${stderr}`));
              });
              gitClone.on("error", reject);
            });
          } catch (cloneErr: any) {
            if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true });
            return res.status(500).json({ message: cloneErr.message });
          }
        } else {
          return res.status(400).json({ message: "Repository not found. Clone or upload first." });
        }
      }

      const job = await storage.createAnalysisJob({
        projectId: req.params.id,
        status: "pending",
        currentStep: "initializing",
        progress: 0,
        logs: "",
      });

      await storage.updateProject(req.params.id, { status: "analyzing" });

      await pipelineEventBus.startPipeline(job.id, req.params.id);

      const pythonScript = path.join(process.cwd(), "python", "agents", "orchestrator.py");
      const pythonProcess = spawn("python3", [pythonScript, req.params.id, repoDir], {
        env: { ...process.env, PYTHONPATH: path.join(process.cwd(), "python") },
        cwd: path.join(process.cwd(), "python"),
      });

      let lineBuffer = "";
      let eventQueue: Promise<void> = Promise.resolve();

      pythonProcess.stdout.on("data", (data) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "STATE_EVENT") {
              eventQueue = eventQueue.then(() =>
                processStateEvent(parsed, job.id, req.params.id)
              ).catch(err => console.error(`[EventQueue] Error:`, err.message));
            }
          } catch {
          }
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        console.error(`[Python] ${data.toString()}`);
      });

      pythonProcess.on("close", async (code) => {
        if (lineBuffer.trim()) {
          try {
            const parsed = JSON.parse(lineBuffer);
            if (parsed.type === "STATE_EVENT") {
              eventQueue = eventQueue.then(() =>
                processStateEvent(parsed, job.id, req.params.id)
              ).catch(err => console.error(`[EventQueue] Error:`, err.message));
            }
          } catch {
          }
        }

        await eventQueue;

        if (code !== 0) {
          console.error(`Analysis process exited with code ${code}`);
          try {
            await pipelineEventBus.failPipeline(job.id, req.params.id, `Process exited with code ${code}`);
          } catch {
          }
        }
      });

      res.json({ success: true, jobId: job.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/status", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const job = await storage.getLatestJob(req.params.id);

      let pipelineState = null;
      if (job) {
        pipelineState = await getRedisSnapshot(job.id);
      }

      res.json({
        project,
        job: job || null,
        pipelineState: pipelineState || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/files", async (req, res) => {
    try {
      const files = await storage.getParsedFiles(req.params.id);
      res.json(files.map(f => ({
        ...f,
        parsedAst: undefined,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/files/:fileId", async (req, res) => {
    try {
      const file = await storage.getParsedFile(req.params.fileId);
      if (!file) return res.status(404).json({ message: "File not found" });
      res.json(file);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/files/:fileId/source", async (req, res) => {
    try {
      const file = await storage.getParsedFile(req.params.fileId);
      if (!file) return res.status(404).json({ message: "File not found" });

      if (file.projectId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const repoDir = path.join("/tmp/repos", req.params.id as string);
      if (!fs.existsSync(repoDir)) {
        return res.json({ source: null, filePath: file.filePath });
      }
      const repoRoot = fs.realpathSync(repoDir);
      const filePath = path.join(repoDir, file.filePath);
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return res.json({ source: null, filePath: file.filePath });
      }
      const realTarget = fs.realpathSync(resolved);
      if (realTarget !== repoRoot && !realTarget.startsWith(repoRoot + path.sep)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const content = fs.readFileSync(realTarget, { encoding: "utf-8" });
      res.json({ source: content, filePath: file.filePath });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/triples", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const triples = await storage.getRdfTriples(req.params.id, limit, offset);
      const count = await storage.getRdfTripleCount(req.params.id);
      res.json({ triples, total: count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/projects/:id/sparql", async (req, res) => {
    try {
      const { subject, predicate, object: obj } = req.body;
      const triples = await storage.queryTriples(req.params.id, subject, predicate, obj);
      res.json({ triples, count: triples.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/results", async (req, res) => {
    try {
      const results = await storage.getAnalysisResults(req.params.id);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/graph", async (req, res) => {
    try {
      const triples = await storage.getRdfTriples(req.params.id, 2000, 0);

      const nodes = new Map<string, { id: string; label: string; type: string }>();
      const edges: { source: string; target: string; label: string }[] = [];

      for (const t of triples) {
        if (t.predicate === "rdf:type") {
          nodes.set(t.subject, {
            id: t.subject,
            label: t.subject.split(".").pop() || t.subject,
            type: t.object.replace("code:", ""),
          });
        }
      }

      const relationships = ["dep:uses", "code:extends", "code:implements", "code:declares", "code:hasMethod", "code:hasField", "code:hasProperty"];
      for (const t of triples) {
        if (relationships.includes(t.predicate) && nodes.has(t.subject)) {
          if (!nodes.has(t.object)) {
            nodes.set(t.object, {
              id: t.object,
              label: t.object.split(".").pop() || t.object,
              type: "unknown",
            });
          }
          edges.push({
            source: t.subject,
            target: t.object,
            label: t.predicate.split(":")[1] || t.predicate,
          });
        }
      }

      res.json({
        nodes: Array.from(nodes.values()),
        edges,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/export/:format", async (req, res) => {
    try {
      const format = req.params.format;
      const validFormats = ["json", "graphml", "dot", "turtle"];
      if (!validFormats.includes(format)) {
        return res.status(400).json({ message: `Invalid format. Supported: ${validFormats.join(", ")}` });
      }

      const results = await storage.getAnalysisResults(req.params.id);
      const exportResult = results.find(r => r.resultType === `export_${format}`);

      if (!exportResult || !exportResult.content) {
        return res.status(404).json({ message: `Export not found. Run analysis first.` });
      }

      const contentTypes: Record<string, string> = {
        json: "application/json",
        graphml: "application/xml",
        dot: "text/vnd.graphviz",
        turtle: "text/turtle",
      };

      const extensions: Record<string, string> = {
        json: "json",
        graphml: "graphml",
        dot: "dot",
        turtle: "ttl",
      };

      res.setHeader("Content-Type", contentTypes[format]);
      res.setHeader("Content-Disposition", `attachment; filename="export.${extensions[format]}"`);
      res.send(exportResult.content);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/report/:format", async (req, res) => {
    try {
      const format = req.params.format;
      if (!["pdf", "docx"].includes(format)) {
        return res.status(400).json({ message: "Supported formats: pdf, docx" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const results = await storage.getAnalysisResults(req.params.id);
      if (!results.length) {
        return res.status(404).json({ message: "No analysis results. Run analysis first." });
      }

      const projectInfo = {
        name: project.name,
        sourceType: project.sourceType,
        sourceUrl: project.sourceUrl,
        totalFiles: project.totalFiles,
        tripleCount: project.tripleCount,
        createdAt: project.createdAt,
      };

      const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");

      if (format === "docx") {
        const buffer = await generateDocxReport(projectInfo, results);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}_report.docx"`);
        res.send(buffer);
      } else {
        const buffer = await generatePdfReport(projectInfo, results);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}_report.pdf"`);
        res.send(buffer);
      }
    } catch (error: any) {
      console.error("Report generation error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projects/:id/logs", async (req, res) => {
    try {
      const job = await storage.getLatestJob(req.params.id);
      if (!job) return res.json([]);
      const logs = await storage.getAgentLogs(job.id);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pipeline/:jobId/state", async (req, res) => {
    try {
      const snapshot = await getRedisSnapshot(req.params.jobId);
      if (!snapshot) {
        return res.status(404).json({ message: "Pipeline state not found" });
      }

      const subStateLabels: Record<string, string> = {};
      if (snapshot.completedSubStates) {
        for (const ss of snapshot.completedSubStates) {
          subStateLabels[ss] = (SUB_STATE_LABELS as any)[ss] || ss;
        }
      }
      if (snapshot.subState) {
        subStateLabels[snapshot.subState] = (SUB_STATE_LABELS as any)[snapshot.subState] || snapshot.subState;
      }

      res.json({
        ...snapshot,
        subStateLabels,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pipeline/:jobId/history", async (req, res) => {
    try {
      const history = await getHistory(req.params.jobId);

      if (!history.length) {
        const dbEvents = await storage.getPipelineEvents(req.params.jobId);
        return res.json(dbEvents.map(e => ({
          eventType: e.eventType,
          jobId: e.jobId,
          projectId: e.projectId,
          state: e.state,
          subState: e.subState,
          previousState: e.previousState,
          message: e.message,
          metadata: e.metadata,
          timestamp: e.createdAt ? new Date(e.createdAt).getTime() : 0,
        })));
      }

      res.json(history);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pipeline/monitor", async (_req, res) => {
    try {
      const active = await getActivePipelines();
      res.json({
        activePipelines: active,
        count: active.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings/llm", async (_req, res) => {
    try {
      const settings = await storage.getLlmSettings();
      const masked = settings.map((s) => ({
        ...s,
        apiKey: s.apiKey ? "•".repeat(Math.min(s.apiKey.length, 20)) + s.apiKey.slice(-4) : "",
      }));
      res.json(masked);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/settings/llm", async (req, res) => {
    try {
      const { provider, apiKey, model, temperature, topP, topK, maxTokens, enabled } = req.body;
      if (!provider) return res.status(400).json({ message: "Provider is required" });
      const existing = await storage.getLlmSetting(provider);
      const finalApiKey = apiKey && !apiKey.startsWith("•") ? apiKey : existing?.apiKey || "";
      const setting = await storage.upsertLlmSetting({
        provider,
        apiKey: finalApiKey,
        model: model || "",
        temperature: temperature ?? 70,
        topP: topP ?? 90,
        topK: topK ?? 40,
        maxTokens: maxTokens ?? 4096,
        enabled: enabled ?? false,
      });
      res.json({
        ...setting,
        apiKey: setting.apiKey ? "•".repeat(Math.min(setting.apiKey.length, 20)) + setting.apiKey.slice(-4) : "",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/settings/llm/:id", async (req, res) => {
    try {
      await storage.deleteLlmSetting(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/settings/llm/test", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      if (!provider || !apiKey) return res.status(400).json({ message: "Provider and API key required" });
      const realKey = apiKey.startsWith("•")
        ? (await storage.getLlmSetting(provider))?.apiKey || ""
        : apiKey;
      if (!realKey) return res.status(400).json({ message: "No valid API key" });
      let testUrl = "";
      let headers: Record<string, string> = {};
      let body: string = "";
      if (provider === "anthropic") {
        testUrl = "https://api.anthropic.com/v1/messages";
        headers = { "x-api-key": realKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
        body = JSON.stringify({ model: model || "claude-3-haiku-20240307", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] });
      } else if (provider === "openai") {
        testUrl = "https://api.openai.com/v1/chat/completions";
        headers = { Authorization: `Bearer ${realKey}`, "content-type": "application/json" };
        body = JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] });
      } else if (provider === "google") {
        testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-pro"}:generateContent?key=${realKey}`;
        headers = { "content-type": "application/json" };
        body = JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] });
      } else {
        return res.json({ success: true, message: "Provider not testable, key saved" });
      }
      const response = await fetch(testUrl, { method: "POST", headers, body });
      if (response.ok) {
        res.json({ success: true, message: "Connection successful" });
      } else {
        const err = await response.text();
        res.json({ success: false, message: `API returned ${response.status}: ${err.substring(0, 200)}` });
      }
    } catch (error: any) {
      res.json({ success: false, message: error.message });
    }
  });

  return httpServer;
}

async function processStateEvent(
  parsed: any,
  jobId: string,
  projectId: string
): Promise<void> {
  try {
    const eventType = parsed.eventType as string;
    const state = parsed.state as PipelineState;
    const subState = parsed.subState;
    const previousState = parsed.previousState;
    const message = parsed.message;
    const metadata = parsed.metadata;

    switch (eventType) {
      case "STATE_TRANSITION":
        await pipelineEventBus.transitionState(jobId, projectId, state, message);
        break;

      case "SUB_STATE_ENTERED":
        await pipelineEventBus.enterSubState(jobId, projectId, state, subState, message);
        break;

      case "SUB_STATE_COMPLETED":
        await pipelineEventBus.completeSubState(jobId, projectId, state, subState, metadata);
        break;

      case "STEP_COMPLETED":
        break;

      case "PIPELINE_COMPLETED":
        await pipelineEventBus.completePipeline(jobId, projectId, metadata);
        break;

      case "PIPELINE_FAILED":
        await pipelineEventBus.failPipeline(jobId, projectId, message || "Unknown error");
        break;
    }
  } catch (err: any) {
    console.error(`[ProcessStateEvent] Error:`, err.message);
  }
}
