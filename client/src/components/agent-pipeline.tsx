import { useQuery } from "@tanstack/react-query";
import type { AnalysisJob, AgentLog } from "@shared/schema";
import { CheckCircle2, Loader2, Circle, AlertCircle, ChevronDown, ChevronRight, Terminal, Zap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

const STEPS = [
  {
    key: "initializing",
    label: "Step 0: Orchestrator",
    description: "Pipeline Initialization & Agent Coordination",
    agents: ["orchestrator"],
    stateKey: "INITIALIZING",
  },
  {
    key: "parsing",
    label: "Step 1: Parsing",
    description: "Lexical Analysis & Syntax Tree Generation",
    agents: ["parsing_agent"],
    stateKey: "PARSING",
  },
  {
    key: "semantic_graph",
    label: "Step 2-3: Semantic & Graph",
    description: "Symbol Table, Type Resolution, Graph Construction",
    agents: ["semantic_agent"],
    stateKey: "SEMANTIC_GRAPH",
  },
  {
    key: "reasoning",
    label: "Step 4: Reasoning",
    description: "Control Flow, Data Flow, Dependency, Patterns",
    agents: ["reasoning_agent"],
    stateKey: "REASONING",
  },
  {
    key: "exporting",
    label: "Step 5: Export",
    description: "JSON, GraphML, DOT, RDF/Turtle, BPMN",
    agents: ["exporter_agent"],
    stateKey: "EXPORTING",
  },
  {
    key: "done",
    label: "Complete",
    description: "All steps finished",
    agents: [],
    stateKey: "COMPLETED",
  },
];

interface PipelineSnapshot {
  jobId: string;
  projectId: string;
  state: string;
  subState: string | null;
  completedSubStates: string[];
  progress: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  metrics?: Record<string, any>;
  subStateLabels?: Record<string, string>;
}

interface Props {
  projectId: string;
  job: AnalysisJob;
}

export function AgentPipeline({ projectId, job }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const { data: logs } = useQuery<AgentLog[]>({
    queryKey: ["/api/projects", projectId, "logs"],
    refetchInterval: 2000,
  });

  const { data: pipelineState } = useQuery<PipelineSnapshot>({
    queryKey: ["/api/pipeline", job.id, "state"],
    refetchInterval: job.status === "running" ? 1500 : false,
    enabled: !!job.id,
    retry: false,
  });

  let currentStepIndex = STEPS.findIndex(s => s.key === job.currentStep);

  if (currentStepIndex < 0 && job.status === "running") {
    currentStepIndex = 0;
  }

  const failedStepIndex = (() => {
    if (job.status !== "failed") return -1;
    if (currentStepIndex >= 0) return currentStepIndex;
    if (!logs || logs.length === 0) return 0;
    const lastAgent = logs[0]?.agentName;
    const idx = STEPS.findIndex(s => s.agents.includes(lastAgent));
    return idx >= 0 ? idx : 0;
  })();

  if (job.status === "failed" && currentStepIndex < 0) {
    currentStepIndex = failedStepIndex;
  }

  const getLogsForStep = (stepKey: string): AgentLog[] => {
    if (!logs) return [];
    const step = STEPS.find(s => s.key === stepKey);
    if (!step) return [];
    return logs.filter(l => step.agents.includes(l.agentName));
  };

  const getSubStatesForStep = (stateKey: string): { completed: string[]; active: string | null; labels: Record<string, string> } => {
    if (!pipelineState) return { completed: [], active: null, labels: {} };

    const stateSubStates = STEP_SUB_STATE_MAP[stateKey] || [];
    const completed = (pipelineState.completedSubStates || []).filter(s => stateSubStates.includes(s));
    const active = pipelineState.state === stateKey ? pipelineState.subState : null;
    const labels = pipelineState.subStateLabels || {};

    return { completed, active, labels };
  };

  const toggleStep = (stepKey: string) => {
    setExpandedStep(prev => prev === stepKey ? null : stepKey);
  };

  const displayProgress = pipelineState?.progress ?? Math.max(0, job.progress || 0);

  return (
    <div className="space-y-3" data-testid="agent-pipeline">
      <div className="flex items-center gap-2">
        {job.status === "failed" ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : job.status === "completed" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        )}
        <span className="text-sm font-medium" data-testid="text-pipeline-status">
          {job.status === "completed" ? "Pipeline Complete" : job.status === "failed" ? "Pipeline Failed" : "Analysis Pipeline Running"}
        </span>
        {job.status !== "failed" && (
          <span className="text-xs text-muted-foreground ml-auto" data-testid="text-pipeline-progress">{displayProgress}%</span>
        )}
      </div>

      {pipelineState?.subState && job.status === "running" && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/5 border border-primary/10">
          <Zap className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium" data-testid="text-current-substate">
            {pipelineState.subStateLabels?.[pipelineState.subState] || pipelineState.subState}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {STEPS.slice(0, -1).map((step, i) => {
          const isActive = step.key === job.currentStep || (job.status === "failed" && i === failedStepIndex);
          const isDone = i < currentStepIndex || job.status === "completed";
          const isFailed = job.status === "failed" && i === failedStepIndex;
          const isExpanded = expandedStep === step.key;
          const stepLogs = getLogsForStep(step.key);
          const hasLogs = stepLogs.length > 0;
          const subStateInfo = getSubStatesForStep(step.stateKey);
          const hasSubStates = subStateInfo.completed.length > 0 || subStateInfo.active !== null;
          const canExpand = (hasLogs || hasSubStates) && (isDone || isActive || isFailed);

          const totalSubStates = (STEP_SUB_STATE_MAP[step.stateKey] || []).length;
          const completedSubStates = subStateInfo.completed.length;

          return (
            <div key={step.key} data-testid={`pipeline-step-${step.key}`}>
              <button
                type="button"
                onClick={() => canExpand && toggleStep(step.key)}
                disabled={!canExpand}
                aria-expanded={canExpand ? isExpanded : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-all text-left ${
                  canExpand ? "cursor-pointer hover:brightness-95" : "cursor-default"
                } ${
                  isFailed ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" :
                  isActive ? "bg-primary/10 text-primary border border-primary/20" :
                  isDone ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" :
                  "bg-muted/50 text-muted-foreground border border-transparent"
                }`}
                data-testid={`button-step-toggle-${step.key}`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : isActive ? (
                  isFailed ? <AlertCircle className="w-4 h-4 shrink-0" /> :
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{step.label}</p>
                  <p className="text-[10px] opacity-70">{step.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {totalSubStates > 0 && (isActive || isDone) && (
                    <span className="text-[10px] opacity-50 tabular-nums" data-testid={`text-substates-${step.key}`}>
                      {completedSubStates}/{totalSubStates}
                    </span>
                  )}
                  {hasLogs && (
                    <span className="text-[10px] opacity-50 tabular-nums">{stepLogs.length} logs</span>
                  )}
                  {canExpand && (
                    isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    )
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="ml-4 mt-1 mb-1 space-y-1">
                  {hasSubStates && (
                    <div className="rounded-md border border-border bg-muted/20 p-2">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Sub-state Progress</p>
                      <div className="space-y-0.5">
                        {(STEP_SUB_STATE_MAP[step.stateKey] || []).map((ss) => {
                          const isCompleted = subStateInfo.completed.includes(ss);
                          const isActiveSub = subStateInfo.active === ss;
                          const label = subStateInfo.labels[ss] || ss.replace(/_/g, " ");
                          return (
                            <div key={ss} className="flex items-center gap-1.5 text-[11px]" data-testid={`substate-${ss}`}>
                              {isCompleted ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              ) : isActiveSub ? (
                                <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                              ) : (
                                <Circle className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                              )}
                              <span className={
                                isCompleted ? "text-emerald-600 dark:text-emerald-400" :
                                isActiveSub ? "text-primary font-medium" :
                                "text-muted-foreground/50"
                              }>
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {hasLogs && (
                    <ScrollArea className="max-h-36 rounded-md border border-border bg-muted/30 p-2.5">
                      <div className="space-y-0.5 font-mono text-[11px]">
                        {stepLogs.map((log, j) => (
                          <div key={j} className={`${
                            log.level === "error" ? "text-red-500" :
                            log.level === "warn" ? "text-amber-500" :
                            "text-muted-foreground"
                          }`}>
                            <span className="text-muted-foreground/40">[{log.agentName}]</span>{" "}
                            {log.message}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}

              {i < STEPS.length - 2 && (
                <div className="flex justify-center py-0.5">
                  <div className={`w-px h-2 ${isDone ? "bg-emerald-500/40" : "bg-border"}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {logs && logs.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAllLogs(prev => !prev)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors text-xs text-muted-foreground cursor-pointer"
            data-testid="button-toggle-all-logs"
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Agent Activity Log</span>
            <span className="text-[10px] opacity-50 tabular-nums">{logs.length} entries</span>
            <div className="ml-auto">
              {showAllLogs ? (
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </div>
          </button>

          {showAllLogs && (
            <div className="mt-1.5">
              <ScrollArea className="h-36 rounded-md border border-border bg-muted/30 p-3">
                <div className="space-y-0.5 font-mono text-[11px]">
                  {logs.slice(0, 100).map((log, i) => (
                    <div key={i} className={`${
                      log.level === "error" ? "text-red-500" :
                      log.level === "warn" ? "text-amber-500" :
                      "text-muted-foreground"
                    }`} data-testid={`log-entry-${i}`}>
                      <span className="text-muted-foreground/40">[{log.agentName}]</span>{" "}
                      {log.message}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STEP_SUB_STATE_MAP: Record<string, string[]> = {
  INITIALIZING: [],
  PARSING: [
    "scanning_files",
    "invoking_delphiast",
    "invoking_python_parser",
    "building_ast",
    "storing_parsed_metadata",
    "parsing_complete",
  ],
  SEMANTIC_GRAPH: [
    "building_symbol_table",
    "resolving_types",
    "linking_references",
    "analyzing_scopes",
    "constructing_graph_nodes",
    "constructing_graph_edges",
    "attaching_metadata",
    "storing_triples",
    "semantic_graph_complete",
  ],
  REASONING: [
    "indexing_triples",
    "analyzing_control_flow",
    "analyzing_data_flow",
    "analyzing_dependencies",
    "detecting_patterns",
    "analyzing_architecture",
    "analyzing_class_hierarchy",
    "computing_complexity",
    "scanning_api_contracts",
    "generating_sequence_diagrams",
    "generating_mvc_diagrams",
    "generating_class_interaction_diagrams",
    "generating_class_object_diagrams",
    "reasoning_complete",
  ],
  EXPORTING: [
    "exporting_json",
    "exporting_graphml",
    "exporting_dot",
    "exporting_rdf_turtle",
    "generating_bpmn",
    "generating_entity_flow",
    "compiling_summary",
    "storing_exports",
    "exporting_complete",
  ],
};
