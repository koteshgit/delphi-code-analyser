import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  status: text("status").notNull().default("pending"),
  totalFiles: integer("total_files").default(0),
  parsedFiles: integer("parsed_files").default(0),
  tripleCount: integer("triple_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analysisJobs = pgTable("analysis_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  status: text("status").notNull().default("pending"),
  currentStep: text("current_step"),
  progress: integer("progress").default(0),
  logs: text("logs").default(""),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const parsedFiles = pgTable("parsed_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  filePath: text("file_path").notNull(),
  unitName: text("unit_name"),
  unitType: text("unit_type"),
  lineCount: integer("line_count").default(0),
  parsedAst: jsonb("parsed_ast"),
  metadata: jsonb("metadata"),
});

export const rdfTriples = pgTable("rdf_triples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  subject: text("subject").notNull(),
  predicate: text("predicate").notNull(),
  object: text("object").notNull(),
  context: text("context"),
});

export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  resultType: text("result_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  metadata: jsonb("metadata"),
});

export const agentLogs = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => analysisJobs.id),
  agentName: text("agent_name").notNull(),
  message: text("message").notNull(),
  level: text("level").notNull().default("info"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const llmSettings = pgTable("llm_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull().unique(),
  apiKey: text("api_key").notNull().default(""),
  model: text("model").notNull().default(""),
  temperature: integer("temperature").notNull().default(70),
  topP: integer("top_p").notNull().default(90),
  topK: integer("top_k").notNull().default(40),
  maxTokens: integer("max_tokens").notNull().default(4096),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertAnalysisJobSchema = createInsertSchema(analysisJobs).omit({ id: true, startedAt: true });
export const insertParsedFileSchema = createInsertSchema(parsedFiles).omit({ id: true });
export const insertRdfTripleSchema = createInsertSchema(rdfTriples).omit({ id: true });
export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({ id: true });
export const insertAgentLogSchema = createInsertSchema(agentLogs).omit({ id: true, createdAt: true });
export const pipelineEvents = pgTable("pipeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => analysisJobs.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  eventType: text("event_type").notNull(),
  state: text("state").notNull(),
  subState: text("sub_state"),
  previousState: text("previous_state"),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLlmSettingSchema = createInsertSchema(llmSettings).omit({ id: true, updatedAt: true });
export const insertPipelineEventSchema = createInsertSchema(pipelineEvents).omit({ id: true, createdAt: true });

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type InsertAnalysisJob = z.infer<typeof insertAnalysisJobSchema>;
export type ParsedFile = typeof parsedFiles.$inferSelect;
export type InsertParsedFile = z.infer<typeof insertParsedFileSchema>;
export type RdfTriple = typeof rdfTriples.$inferSelect;
export type InsertRdfTriple = z.infer<typeof insertRdfTripleSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AgentLog = typeof agentLogs.$inferSelect;
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type LlmSetting = typeof llmSettings.$inferSelect;
export type InsertLlmSetting = z.infer<typeof insertLlmSettingSchema>;
export type PipelineEventRecord = typeof pipelineEvents.$inferSelect;
export type InsertPipelineEvent = z.infer<typeof insertPipelineEventSchema>;
