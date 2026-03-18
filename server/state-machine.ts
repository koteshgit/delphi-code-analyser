export enum PipelineState {
  PENDING = "PENDING",
  INITIALIZING = "INITIALIZING",
  PARSING = "PARSING",
  SEMANTIC_GRAPH = "SEMANTIC_GRAPH",
  REASONING = "REASONING",
  EXPORTING = "EXPORTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum SubState {
  SCANNING_FILES = "scanning_files",
  INVOKING_DELPHIAST = "invoking_delphiast",
  INVOKING_PYTHON_PARSER = "invoking_python_parser",
  BUILDING_AST = "building_ast",
  STORING_PARSED_METADATA = "storing_parsed_metadata",
  PARSING_COMPLETE = "parsing_complete",

  BUILDING_SYMBOL_TABLE = "building_symbol_table",
  RESOLVING_TYPES = "resolving_types",
  LINKING_REFERENCES = "linking_references",
  ANALYZING_SCOPES = "analyzing_scopes",
  CONSTRUCTING_GRAPH_NODES = "constructing_graph_nodes",
  CONSTRUCTING_GRAPH_EDGES = "constructing_graph_edges",
  ATTACHING_METADATA = "attaching_metadata",
  STORING_TRIPLES = "storing_triples",
  SEMANTIC_GRAPH_COMPLETE = "semantic_graph_complete",

  INDEXING_TRIPLES = "indexing_triples",
  ANALYZING_CONTROL_FLOW = "analyzing_control_flow",
  ANALYZING_DATA_FLOW = "analyzing_data_flow",
  ANALYZING_DEPENDENCIES = "analyzing_dependencies",
  DETECTING_PATTERNS = "detecting_patterns",
  ANALYZING_ARCHITECTURE = "analyzing_architecture",
  ANALYZING_CLASS_HIERARCHY = "analyzing_class_hierarchy",
  COMPUTING_COMPLEXITY = "computing_complexity",
  SCANNING_API_CONTRACTS = "scanning_api_contracts",
  GENERATING_SEQUENCE_DIAGRAMS = "generating_sequence_diagrams",
  GENERATING_MVC_DIAGRAMS = "generating_mvc_diagrams",
  GENERATING_CLASS_INTERACTION_DIAGRAMS = "generating_class_interaction_diagrams",
  DETECTING_DEAD_CODE = "detecting_dead_code",
  GENERATING_CALL_GRAPH = "generating_call_graph",
  CALCULATING_METRICS = "calculating_metrics",
  GENERATING_CLASS_OBJECT_DIAGRAMS = "generating_class_object_diagrams",
  REASONING_COMPLETE = "reasoning_complete",

  EXPORTING_JSON = "exporting_json",
  EXPORTING_GRAPHML = "exporting_graphml",
  EXPORTING_DOT = "exporting_dot",
  EXPORTING_RDF_TURTLE = "exporting_rdf_turtle",
  GENERATING_BPMN = "generating_bpmn",
  GENERATING_ENTITY_FLOW = "generating_entity_flow",
  COMPILING_SUMMARY = "compiling_summary",
  STORING_EXPORTS = "storing_exports",
  EXPORTING_COMPLETE = "exporting_complete",
}

export const STEP_SUB_STATES: Record<PipelineState, SubState[]> = {
  [PipelineState.PENDING]: [],
  [PipelineState.INITIALIZING]: [],
  [PipelineState.PARSING]: [
    SubState.SCANNING_FILES,
    SubState.INVOKING_DELPHIAST,
    SubState.INVOKING_PYTHON_PARSER,
    SubState.BUILDING_AST,
    SubState.STORING_PARSED_METADATA,
    SubState.PARSING_COMPLETE,
  ],
  [PipelineState.SEMANTIC_GRAPH]: [
    SubState.BUILDING_SYMBOL_TABLE,
    SubState.RESOLVING_TYPES,
    SubState.LINKING_REFERENCES,
    SubState.ANALYZING_SCOPES,
    SubState.CONSTRUCTING_GRAPH_NODES,
    SubState.CONSTRUCTING_GRAPH_EDGES,
    SubState.ATTACHING_METADATA,
    SubState.STORING_TRIPLES,
    SubState.SEMANTIC_GRAPH_COMPLETE,
  ],
  [PipelineState.REASONING]: [
    SubState.INDEXING_TRIPLES,
    SubState.ANALYZING_CONTROL_FLOW,
    SubState.ANALYZING_DATA_FLOW,
    SubState.ANALYZING_DEPENDENCIES,
    SubState.DETECTING_DEAD_CODE,
    SubState.GENERATING_CALL_GRAPH,
    SubState.CALCULATING_METRICS,
    SubState.DETECTING_PATTERNS,
    SubState.ANALYZING_ARCHITECTURE,
    SubState.ANALYZING_CLASS_HIERARCHY,
    SubState.COMPUTING_COMPLEXITY,
    SubState.SCANNING_API_CONTRACTS,
    SubState.GENERATING_SEQUENCE_DIAGRAMS,
    SubState.GENERATING_MVC_DIAGRAMS,
    SubState.GENERATING_CLASS_INTERACTION_DIAGRAMS,
    SubState.GENERATING_CLASS_OBJECT_DIAGRAMS,
    SubState.REASONING_COMPLETE,
  ],
  [PipelineState.EXPORTING]: [
    SubState.EXPORTING_JSON,
    SubState.EXPORTING_GRAPHML,
    SubState.EXPORTING_DOT,
    SubState.EXPORTING_RDF_TURTLE,
    SubState.GENERATING_BPMN,
    SubState.GENERATING_ENTITY_FLOW,
    SubState.COMPILING_SUMMARY,
    SubState.STORING_EXPORTS,
    SubState.EXPORTING_COMPLETE,
  ],
  [PipelineState.COMPLETED]: [],
  [PipelineState.FAILED]: [],
};

export const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  [PipelineState.PENDING]: [PipelineState.INITIALIZING, PipelineState.FAILED],
  [PipelineState.INITIALIZING]: [PipelineState.PARSING, PipelineState.FAILED],
  [PipelineState.PARSING]: [PipelineState.SEMANTIC_GRAPH, PipelineState.FAILED],
  [PipelineState.SEMANTIC_GRAPH]: [PipelineState.REASONING, PipelineState.FAILED],
  [PipelineState.REASONING]: [PipelineState.EXPORTING, PipelineState.FAILED],
  [PipelineState.EXPORTING]: [PipelineState.COMPLETED, PipelineState.FAILED],
  [PipelineState.COMPLETED]: [],
  [PipelineState.FAILED]: [],
};

export enum EventType {
  PIPELINE_STARTED = "PIPELINE_STARTED",
  STATE_TRANSITION = "STATE_TRANSITION",
  SUB_STATE_ENTERED = "SUB_STATE_ENTERED",
  SUB_STATE_COMPLETED = "SUB_STATE_COMPLETED",
  STEP_COMPLETED = "STEP_COMPLETED",
  STEP_FAILED = "STEP_FAILED",
  PIPELINE_COMPLETED = "PIPELINE_COMPLETED",
  PIPELINE_FAILED = "PIPELINE_FAILED",
  LOG_MESSAGE = "LOG_MESSAGE",
  METRIC_UPDATE = "METRIC_UPDATE",
}

export interface PipelineEvent {
  eventType: EventType;
  jobId: string;
  projectId: string;
  timestamp: number;
  state: PipelineState;
  subState?: SubState;
  previousState?: PipelineState;
  message?: string;
  metadata?: Record<string, any>;
}

export interface PipelineSnapshot {
  jobId: string;
  projectId: string;
  state: PipelineState;
  subState: SubState | null;
  completedSubStates: SubState[];
  progress: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  metrics?: Record<string, any>;
}

export const SUB_STATE_LABELS: Record<SubState, string> = {
  [SubState.SCANNING_FILES]: "Scanning source files",
  [SubState.INVOKING_DELPHIAST]: "Invoking DelphiAST parser (FPC)",
  [SubState.INVOKING_PYTHON_PARSER]: "Invoking Python built-in parser",
  [SubState.BUILDING_AST]: "Building abstract syntax trees",
  [SubState.STORING_PARSED_METADATA]: "Storing parsed metadata to database",
  [SubState.PARSING_COMPLETE]: "Parsing complete",

  [SubState.BUILDING_SYMBOL_TABLE]: "Building symbol table",
  [SubState.RESOLVING_TYPES]: "Resolving type references",
  [SubState.LINKING_REFERENCES]: "Linking cross-references",
  [SubState.ANALYZING_SCOPES]: "Analyzing scopes",
  [SubState.CONSTRUCTING_GRAPH_NODES]: "Constructing knowledge graph nodes",
  [SubState.CONSTRUCTING_GRAPH_EDGES]: "Constructing knowledge graph edges",
  [SubState.ATTACHING_METADATA]: "Attaching metadata to graph",
  [SubState.STORING_TRIPLES]: "Storing RDF triples to database",
  [SubState.SEMANTIC_GRAPH_COMPLETE]: "Semantic & graph construction complete",

  [SubState.INDEXING_TRIPLES]: "Indexing RDF triples",
  [SubState.ANALYZING_CONTROL_FLOW]: "Analyzing control flow",
  [SubState.ANALYZING_DATA_FLOW]: "Analyzing data flow",
  [SubState.ANALYZING_DEPENDENCIES]: "Analyzing dependencies",
  [SubState.DETECTING_DEAD_CODE]: "Detecting dead code",
  [SubState.GENERATING_CALL_GRAPH]: "Generating call graph",
  [SubState.CALCULATING_METRICS]: "Calculating codebase metrics",
  [SubState.DETECTING_PATTERNS]: "Detecting design patterns",
  [SubState.ANALYZING_ARCHITECTURE]: "Analyzing architecture layers",
  [SubState.ANALYZING_CLASS_HIERARCHY]: "Analyzing class hierarchy",
  [SubState.COMPUTING_COMPLEXITY]: "Computing complexity metrics",
  [SubState.SCANNING_API_CONTRACTS]: "Scanning API/SOA contracts",
  [SubState.GENERATING_SEQUENCE_DIAGRAMS]: "Generating UML sequence diagrams",
  [SubState.GENERATING_MVC_DIAGRAMS]: "Generating MVC layer diagrams",
  [SubState.GENERATING_CLASS_INTERACTION_DIAGRAMS]: "Generating class interaction diagrams",
  [SubState.GENERATING_CLASS_OBJECT_DIAGRAMS]: "Generating class/object diagrams",
  [SubState.REASONING_COMPLETE]: "Reasoning & analysis complete",

  [SubState.EXPORTING_JSON]: "Exporting JSON knowledge graph",
  [SubState.EXPORTING_GRAPHML]: "Exporting GraphML format",
  [SubState.EXPORTING_DOT]: "Exporting DOT/Graphviz format",
  [SubState.EXPORTING_RDF_TURTLE]: "Exporting RDF/Turtle format",
  [SubState.GENERATING_BPMN]: "Generating BPMN workflow diagrams",
  [SubState.GENERATING_ENTITY_FLOW]: "Generating entity flow diagrams",
  [SubState.COMPILING_SUMMARY]: "Compiling project summary report",
  [SubState.STORING_EXPORTS]: "Storing exports to database",
  [SubState.EXPORTING_COMPLETE]: "Export & visualization complete",
};

export function calculateProgress(state: PipelineState, subState: SubState | null, completedSubStates: SubState[]): number {
  const stateWeights: Record<PipelineState, [number, number]> = {
    [PipelineState.PENDING]: [0, 0],
    [PipelineState.INITIALIZING]: [0, 5],
    [PipelineState.PARSING]: [5, 20],
    [PipelineState.SEMANTIC_GRAPH]: [20, 45],
    [PipelineState.REASONING]: [45, 75],
    [PipelineState.EXPORTING]: [75, 95],
    [PipelineState.COMPLETED]: [100, 100],
    [PipelineState.FAILED]: [0, 0],
  };

  const [start, end] = stateWeights[state] || [0, 0];
  if (state === PipelineState.COMPLETED) return 100;
  if (state === PipelineState.FAILED) return 0;

  const subStates = STEP_SUB_STATES[state];
  if (!subStates || subStates.length === 0) return start;

  const completedCount = completedSubStates.filter(s => subStates.includes(s)).length;
  const fraction = completedCount / subStates.length;
  return Math.round(start + (end - start) * fraction);
}
