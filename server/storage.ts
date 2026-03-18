import {
  type Project, type InsertProject,
  type AnalysisJob, type InsertAnalysisJob,
  type ParsedFile, type InsertParsedFile,
  type RdfTriple, type InsertRdfTriple,
  type AnalysisResult, type InsertAnalysisResult,
  type AgentLog, type InsertAgentLog,
  type LlmSetting, type InsertLlmSetting,
  type PipelineEventRecord,
  projects, analysisJobs, parsedFiles, rdfTriples, analysisResults, agentLogs, llmSettings, pipelineEvents,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc, sql, and, or, ilike } from "drizzle-orm";
import pg from "pg";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  getAnalysisJobs(projectId: string): Promise<AnalysisJob[]>;
  getLatestJob(projectId: string): Promise<AnalysisJob | undefined>;
  createAnalysisJob(job: InsertAnalysisJob): Promise<AnalysisJob>;
  getParsedFiles(projectId: string): Promise<ParsedFile[]>;
  getParsedFile(id: string): Promise<ParsedFile | undefined>;
  getRdfTriples(projectId: string, limit?: number, offset?: number): Promise<RdfTriple[]>;
  getRdfTripleCount(projectId: string): Promise<number>;
  queryTriples(projectId: string, subject?: string, predicate?: string, object?: string): Promise<RdfTriple[]>;
  getAnalysisResults(projectId: string): Promise<AnalysisResult[]>;
  getAnalysisResult(id: string): Promise<AnalysisResult | undefined>;
  getAgentLogs(jobId: string): Promise<AgentLog[]>;
  getLlmSettings(): Promise<LlmSetting[]>;
  getLlmSetting(provider: string): Promise<LlmSetting | undefined>;
  upsertLlmSetting(setting: InsertLlmSetting): Promise<LlmSetting>;
  deleteLlmSetting(id: string): Promise<void>;
  updateJobState(jobId: string, status: string, step: string, progress: number): Promise<void>;
  updateJobProgress(jobId: string, progress: number): Promise<void>;
  addPipelineEvent(jobId: string, projectId: string, event: any): Promise<void>;
  getPipelineEvents(jobId: string): Promise<PipelineEventRecord[]>;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export class DatabaseStorage implements IStorage {
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id));
    return result[0];
  }

  async createProject(project: InsertProject): Promise<Project> {
    const result = await db.insert(projects).values(project).returning();
    return result[0];
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | undefined> {
    const result = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(pipelineEvents).where(eq(pipelineEvents.projectId, id));
    await db.delete(agentLogs).where(
      sql`job_id IN (SELECT id FROM analysis_jobs WHERE project_id = ${id})`
    );
    await db.delete(analysisResults).where(eq(analysisResults.projectId, id));
    await db.delete(rdfTriples).where(eq(rdfTriples.projectId, id));
    await db.delete(parsedFiles).where(eq(parsedFiles.projectId, id));
    await db.delete(analysisJobs).where(eq(analysisJobs.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getAnalysisJobs(projectId: string): Promise<AnalysisJob[]> {
    return db.select().from(analysisJobs)
      .where(eq(analysisJobs.projectId, projectId))
      .orderBy(desc(analysisJobs.startedAt));
  }

  async getLatestJob(projectId: string): Promise<AnalysisJob | undefined> {
    const result = await db.select().from(analysisJobs)
      .where(eq(analysisJobs.projectId, projectId))
      .orderBy(desc(analysisJobs.startedAt))
      .limit(1);
    return result[0];
  }

  async createAnalysisJob(job: InsertAnalysisJob): Promise<AnalysisJob> {
    const result = await db.insert(analysisJobs).values(job).returning();
    return result[0];
  }

  async getParsedFiles(projectId: string): Promise<ParsedFile[]> {
    return db.select().from(parsedFiles)
      .where(eq(parsedFiles.projectId, projectId));
  }

  async getParsedFile(id: string): Promise<ParsedFile | undefined> {
    const result = await db.select().from(parsedFiles).where(eq(parsedFiles.id, id));
    return result[0];
  }

  async getRdfTriples(projectId: string, limit = 100, offset = 0): Promise<RdfTriple[]> {
    return db.select().from(rdfTriples)
      .where(eq(rdfTriples.projectId, projectId))
      .limit(limit)
      .offset(offset);
  }

  async getRdfTripleCount(projectId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(rdfTriples)
      .where(eq(rdfTriples.projectId, projectId));
    return result[0]?.count || 0;
  }

  async queryTriples(projectId: string, subject?: string, predicate?: string, object?: string): Promise<RdfTriple[]> {
    const conditions = [eq(rdfTriples.projectId, projectId)];
    if (subject) conditions.push(ilike(rdfTriples.subject, `%${subject}%`));
    if (predicate) conditions.push(ilike(rdfTriples.predicate, `%${predicate}%`));
    if (object) conditions.push(ilike(rdfTriples.object, `%${object}%`));

    return db.select().from(rdfTriples)
      .where(and(...conditions))
      .limit(500);
  }

  async getAnalysisResults(projectId: string): Promise<AnalysisResult[]> {
    return db.select().from(analysisResults)
      .where(eq(analysisResults.projectId, projectId));
  }

  async getAnalysisResult(id: string): Promise<AnalysisResult | undefined> {
    const result = await db.select().from(analysisResults).where(eq(analysisResults.id, id));
    return result[0];
  }

  async getAgentLogs(jobId: string): Promise<AgentLog[]> {
    return db.select().from(agentLogs)
      .where(eq(agentLogs.jobId, jobId))
      .orderBy(desc(agentLogs.createdAt));
  }

  async getLlmSettings(): Promise<LlmSetting[]> {
    return db.select().from(llmSettings).orderBy(llmSettings.provider);
  }

  async getLlmSetting(provider: string): Promise<LlmSetting | undefined> {
    const result = await db.select().from(llmSettings).where(eq(llmSettings.provider, provider));
    return result[0];
  }

  async upsertLlmSetting(setting: InsertLlmSetting): Promise<LlmSetting> {
    const existing = await this.getLlmSetting(setting.provider);
    if (existing) {
      const result = await db.update(llmSettings)
        .set({ ...setting, updatedAt: new Date() })
        .where(eq(llmSettings.provider, setting.provider))
        .returning();
      return result[0];
    }
    const result = await db.insert(llmSettings).values(setting).returning();
    return result[0];
  }

  async deleteLlmSetting(id: string): Promise<void> {
    await db.delete(llmSettings).where(eq(llmSettings.id, id));
  }

  async updateJobState(jobId: string, status: string, step: string, progress: number): Promise<void> {
    const updateData: any = { status, currentStep: step, progress };
    if (status === "completed" || status === "failed") {
      updateData.completedAt = new Date();
    }
    await db.update(analysisJobs).set(updateData).where(eq(analysisJobs.id, jobId));
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await db.update(analysisJobs).set({ progress }).where(eq(analysisJobs.id, jobId));
  }

  async addPipelineEvent(jobId: string, projectId: string, event: any): Promise<void> {
    try {
      await db.insert(pipelineEvents).values({
        jobId,
        projectId,
        eventType: event.eventType,
        state: event.state,
        subState: event.subState || null,
        previousState: event.previousState || null,
        message: event.message || null,
        metadata: event.metadata || null,
      });
    } catch (err: any) {
      console.error(`[Storage] addPipelineEvent error: ${err.message}`);
    }
  }

  async getPipelineEvents(jobId: string): Promise<PipelineEventRecord[]> {
    return db.select().from(pipelineEvents)
      .where(eq(pipelineEvents.jobId, jobId))
      .orderBy(pipelineEvents.createdAt);
  }
}

export const storage = new DatabaseStorage();
