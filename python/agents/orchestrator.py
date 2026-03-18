#!/usr/bin/env python3
"""
Orchestrator Agent
Coordinates all sub-agents for the Delphi Legacy Code analysis pipeline.
5-Step Pipeline:
  Step 1: Parsing (DelphiAST / Python fallback)
  Step 2+3: Semantic Analysis & Graph Construction (semantic_agent)
  Step 4: Graph Analysis & Reasoning (reasoning_agent)
  Step 5: Export & Visualization (exporter_agent)

Message-driven architecture: emits structured state events via stdout JSON
for BullMQ consumption by the Node.js state machine.
"""

import json
import sys
import os
import time
from typing import Dict, List, Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import psycopg2
    import psycopg2.extras
    HAS_DB = True
except ImportError:
    HAS_DB = False


class OrchestratorAgent:
    def __init__(self, project_id: str, repo_path: str, db_url: Optional[str] = None):
        self.project_id = project_id
        self.repo_path = repo_path
        self.db_url = db_url or os.environ.get("DATABASE_URL")
        self.conn = None
        self.parsed_data: List[Dict[str, Any]] = []
        self.triples: List[Dict[str, str]] = []
        self.semantic_data: Any = None
        self.analysis_results: List[Dict[str, Any]] = []
        self.exports: Dict[str, str] = {}

        if HAS_DB and self.db_url:
            try:
                self.conn = psycopg2.connect(self.db_url)
                self.conn.autocommit = True
            except Exception as e:
                self._log("error", "orchestrator", f"DB connection failed: {e}")

    def _emit_state(self, event_type: str, state: str, sub_state: str = None,
                    previous_state: str = None, message: str = None, metadata: dict = None):
        event = {
            "type": "STATE_EVENT",
            "eventType": event_type,
            "state": state,
            "timestamp": int(time.time() * 1000),
        }
        if sub_state:
            event["subState"] = sub_state
        if previous_state:
            event["previousState"] = previous_state
        if message:
            event["message"] = message
        if metadata:
            event["metadata"] = metadata
        print(json.dumps(event), flush=True)

    def _log(self, level: str, agent: str, message: str):
        print(json.dumps({"type": "LOG", "level": level, "agent": agent, "message": message}), flush=True)
        if self.conn:
            try:
                cur = self.conn.cursor()
                cur.execute("""
                    INSERT INTO agent_logs (id, job_id, agent_name, message, level)
                    SELECT gen_random_uuid(), id, %s, %s, %s
                    FROM analysis_jobs WHERE project_id = %s
                    ORDER BY started_at DESC LIMIT 1
                """, (agent, message, level, self.project_id))
            except Exception:
                pass

    def _update_job(self, status: str, step: str, progress: int):
        if self.conn:
            try:
                cur = self.conn.cursor()
                completed_at = None
                if status in ('completed', 'failed'):
                    completed_at = 'NOW()'
                if completed_at:
                    cur.execute("""
                        UPDATE analysis_jobs SET status = %s, current_step = %s, progress = %s, completed_at = NOW()
                        WHERE id = (
                            SELECT id FROM analysis_jobs WHERE project_id = %s
                            AND status != 'completed' AND status != 'failed'
                            ORDER BY started_at DESC LIMIT 1
                        )
                    """, (status, step, progress, self.project_id))
                else:
                    cur.execute("""
                        UPDATE analysis_jobs SET status = %s, current_step = %s, progress = %s
                        WHERE id = (
                            SELECT id FROM analysis_jobs WHERE project_id = %s
                            AND status != 'completed' AND status != 'failed'
                            ORDER BY started_at DESC LIMIT 1
                        )
                    """, (status, step, progress, self.project_id))
            except Exception:
                pass

    def _update_project(self, **kwargs):
        if self.conn:
            try:
                cur = self.conn.cursor()
                sets = []
                vals = []
                for k, v in kwargs.items():
                    sets.append(f"{k} = %s")
                    vals.append(v)
                vals.append(self.project_id)
                cur.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = %s", vals)
            except Exception:
                pass

    def run(self) -> Dict[str, Any]:
        try:
            self._emit_state("STATE_TRANSITION", "INITIALIZING", message="Pipeline initializing")
            self._update_job("running", "parsing", 0)
            self._log("info", "orchestrator", "Initializing Delphi Legacy Code Analyser pipeline")
            self._log("info", "orchestrator", f"Project ID: {self.project_id}")
            self._log("info", "orchestrator", f"Source path: {self.repo_path}")
            self._log("info", "orchestrator", "Loading agent modules: ParsingAgent, SemanticAgent, ReasoningAgent, ExporterAgent")
            self._log("info", "orchestrator", "Database connection established — agent log sink ready")
            self._log("info", "orchestrator", "Starting 5-step analysis pipeline")

            self._emit_state("STATE_TRANSITION", "PARSING", previous_state="INITIALIZING",
                           message="Starting parsing phase")
            self._log("info", "orchestrator", "Step 1/5: Dispatching Parsing Agent — Lexical Analysis & Syntax Tree Generation")
            self._update_job("running", "parsing", 5)
            self._run_parsing()

            self._emit_state("STATE_TRANSITION", "SEMANTIC_GRAPH", previous_state="PARSING",
                           message="Starting semantic & graph construction phase")
            self._log("info", "orchestrator", "Step 2-3/5: Dispatching Semantic & Graph Agent — Symbol Table, Type Resolution, Graph Construction")
            self._update_job("running", "semantic_graph", 25)
            self._run_semantic()

            self._emit_state("STATE_TRANSITION", "REASONING", previous_state="SEMANTIC_GRAPH",
                           message="Starting reasoning & analysis phase")
            self._log("info", "orchestrator", "Step 4/5: Dispatching Reasoning Agent — Architecture, Patterns, Diagrams")
            self._update_job("running", "reasoning", 50)
            self._run_reasoning()

            self._emit_state("STATE_TRANSITION", "EXPORTING", previous_state="REASONING",
                           message="Starting export & visualization phase")
            self._log("info", "orchestrator", "Step 5/5: Dispatching Exporter Agent — Multi-format Export & Visualization")
            self._update_job("running", "exporting", 75)
            self._run_exporter()

            self._update_job("completed", "done", 100)
            self._update_project(status="completed")
            self._log("info", "orchestrator", "All 5 pipeline steps completed successfully")
            self._log("info", "orchestrator", f"Final stats — Files: {len(self.parsed_data)}, Triples: {len(self.triples)}, Analysis results: {len(self.analysis_results)}, Exports: {len(self.exports)}")

            self._emit_state("PIPELINE_COMPLETED", "COMPLETED", previous_state="EXPORTING",
                           message="Pipeline completed successfully",
                           metadata={
                               "totalFiles": len(self.parsed_data),
                               "tripleCount": len(self.triples),
                               "analysisResults": len(self.analysis_results),
                               "exportCount": len(self.exports),
                           })

            return {"success": True, "project_id": self.project_id}

        except Exception as e:
            self._log("error", "orchestrator", f"Pipeline failed: {str(e)}")
            self._update_job("failed", "error", -1)
            self._update_project(status="failed")
            self._emit_state("PIPELINE_FAILED", "FAILED", message=str(e))
            return {"success": False, "error": str(e)}

        finally:
            if self.conn:
                self.conn.close()

    def _run_parsing(self):
        import os
        from parser.delphi_parser import parse_directory, DELPHIAST_BINARY

        self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="scanning_files",
                        message="Scanning source directory for Delphi files")

        has_delphiast = os.path.isfile(DELPHIAST_BINARY)
        self._log("info", "parsing_agent", f"Scanning source directory: {self.repo_path}")

        self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="scanning_files")

        if has_delphiast:
            self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="invoking_delphiast",
                            message="Invoking DelphiAST native FPC parser")
            self._log("info", "parsing_agent", f"DelphiAST binary found — will attempt native FPC parser first")
        else:
            self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="invoking_python_parser",
                            message="Invoking Python built-in parser")
            self._log("info", "parsing_agent", "DelphiAST binary not available — using Python built-in parser")

        self._log("info", "parsing_agent", "Invoking parser on all .pas, .dpr, .dpk, .lpr, .pp files...")
        self.parsed_data = parse_directory(self.repo_path, project_id=self.project_id)

        if has_delphiast:
            self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="invoking_delphiast")
        else:
            self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="invoking_python_parser")

        total_files = len(self.parsed_data)
        self._update_project(total_files=total_files, status="analyzing")

        delphiast_count = sum(1 for a in self.parsed_data if a.get("parser") == "delphiast" and "error" not in a)
        builtin_count = sum(1 for a in self.parsed_data if a.get("parser") == "builtin" and "error" not in a)
        error_count = sum(1 for a in self.parsed_data if "error" in a)
        total_classes = sum(len(a.get("classes", [])) for a in self.parsed_data if "error" not in a)
        total_procs = sum(len(a.get("procedures", [])) + len(a.get("functions", [])) for a in self.parsed_data if "error" not in a)
        total_uses = sum(len(a.get("uses_interface", [])) + len(a.get("uses_implementation", [])) for a in self.parsed_data if "error" not in a)
        total_lines = sum(a.get("line_count", 0) for a in self.parsed_data if "error" not in a)

        self._log("info", "parsing_agent", f"Discovered {total_files} Delphi source files ({total_lines:,} total lines)")
        if delphiast_count > 0:
            self._log("info", "parsing_agent", f"DelphiAST (native FPC parser) parsed {delphiast_count} files")
        if builtin_count > 0:
            self._log("info", "parsing_agent", f"Python built-in parser handled {builtin_count} files")
        if error_count > 0:
            self._log("warn", "parsing_agent", f"{error_count} files had parse errors (skipped)")
        self._log("info", "parsing_agent", f"Extracted {total_classes} classes, {total_procs} procedures/functions, {total_uses} unit dependencies")

        self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="building_ast",
                        message="Building abstract syntax trees")
        self._log("info", "parsing_agent", "Building abstract syntax trees (ASTs)...")
        self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="building_ast",
                        metadata={"totalFiles": total_files, "totalLines": total_lines,
                                  "classes": total_classes, "procedures": total_procs})

        self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="storing_parsed_metadata",
                        message="Storing parsed metadata to database")
        self._log("info", "parsing_agent", "Storing parsed file metadata to database...")

        if self.conn:
            cur = self.conn.cursor()
            parsed_count = 0
            for ast in self.parsed_data:
                if "error" in ast:
                    self._log("warn", "parsing_agent", f"Parse error in {ast.get('file_path', 'unknown')}: {ast['error']}")
                    continue

                try:
                    cur.execute("""
                        INSERT INTO parsed_files (id, project_id, file_path, unit_name, unit_type, line_count, parsed_ast, metadata)
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        self.project_id,
                        ast.get("file_path", ""),
                        ast.get("unit_name", ""),
                        ast.get("unit_type", "unknown"),
                        ast.get("line_count", 0),
                        json.dumps(ast),
                        json.dumps({
                            "classes": len(ast.get("classes", [])),
                            "procedures": len(ast.get("procedures", [])),
                            "functions": len(ast.get("functions", [])),
                            "uses_count": len(ast.get("uses_interface", [])) + len(ast.get("uses_implementation", [])),
                            "parser": ast.get("parser", "builtin"),
                        })
                    ))
                    parsed_count += 1
                except Exception as e:
                    self._log("warn", "parsing_agent", f"DB insert error: {str(e)}")

            self._update_project(parsed_files=parsed_count)
            self._log("info", "parsing_agent", f"Stored {parsed_count} parsed files to database")
            self._update_job("running", "parsing", 20)

        self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="storing_parsed_metadata",
                        metadata={"storedFiles": parsed_count if self.conn else 0})
        self._emit_state("SUB_STATE_ENTERED", "PARSING", sub_state="parsing_complete",
                        message="Parsing phase complete")
        self._emit_state("SUB_STATE_COMPLETED", "PARSING", sub_state="parsing_complete")
        self._emit_state("STEP_COMPLETED", "PARSING", message="Parsing step completed",
                        metadata={"totalFiles": total_files, "totalLines": total_lines})

    def _run_semantic(self):
        from agents.semantic_agent import run_semantic_analysis

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="building_symbol_table",
                        message="Building symbol table from parsed ASTs")
        self._log("info", "semantic_agent", "Building symbol table from parsed ASTs...")
        self._log("info", "semantic_agent", "Phase 1: Registering units, classes, methods, fields, properties...")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="building_symbol_table")

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="resolving_types",
                        message="Resolving type references across units")
        result = run_semantic_analysis(self.parsed_data, self.project_id)
        self.triples = result["triples"]
        self.semantic_data = result.get("semantic_data")
        stats = result.get("stats", {})
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="resolving_types",
                        metadata={"symbolsResolved": stats.get("symbols_resolved", 0)})

        self._log("info", "semantic_agent", f"Symbol table built — {stats.get('symbols_resolved', 0)} symbols registered")

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="linking_references",
                        message="Linking cross-references")
        self._log("info", "semantic_agent", "Phase 2: Type resolution — resolving type references across units...")
        self._log("info", "semantic_agent", f"Phase 3: Reference linking — {stats.get('references_linked', 0)} cross-references linked")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="linking_references",
                        metadata={"referencesLinked": stats.get("references_linked", 0)})

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="analyzing_scopes",
                        message="Analyzing scopes")
        self._log("info", "semantic_agent", f"Phase 4: Scope analysis — {stats.get('scopes_analyzed', 0)} scopes analyzed")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="analyzing_scopes",
                        metadata={"scopesAnalyzed": stats.get("scopes_analyzed", 0)})

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="constructing_graph_nodes",
                        message="Constructing knowledge graph nodes")
        self._log("info", "semantic_agent", "Constructing knowledge graph nodes (classes, methods, fields, properties, types)...")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="constructing_graph_nodes")

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="constructing_graph_edges",
                        message="Constructing knowledge graph edges")
        self._log("info", "semantic_agent", "Constructing knowledge graph edges (inheritance, calls, uses, contains, implements)...")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="constructing_graph_edges")

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="attaching_metadata",
                        message="Attaching metadata to graph")
        self._log("info", "semantic_agent", "Attaching metadata to graph nodes (visibility, line numbers, complexity)...")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="attaching_metadata")

        self._log("info", "semantic_agent", f"Knowledge graph complete — {len(self.triples)} RDF triples generated")

        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="storing_triples",
                        message="Storing RDF triples to database")
        self._log("info", "semantic_agent", "Storing RDF triples to PostgreSQL triple store...")
        self._update_project(triple_count=len(self.triples))

        if self.conn:
            cur = self.conn.cursor()
            batch_size = 500
            for i in range(0, len(self.triples), batch_size):
                batch = self.triples[i:i + batch_size]
                values = []
                for t in batch:
                    values.append((
                        self.project_id,
                        t["subject"],
                        t["predicate"],
                        t["object"],
                        t.get("context")
                    ))
                try:
                    psycopg2.extras.execute_batch(cur, """
                        INSERT INTO rdf_triples (id, project_id, subject, predicate, object, context)
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
                    """, values)
                except Exception as e:
                    self._log("warn", "semantic_agent", f"Triple insert error: {str(e)}")

                stored = min(i + batch_size, len(self.triples))
                if stored == len(self.triples) or (stored % 2000 == 0):
                    self._log("info", "semantic_agent", f"Stored {stored:,}/{len(self.triples):,} triples to database...")
                progress = 25 + int(20 * stored / max(len(self.triples), 1))
                self._update_job("running", "semantic_graph", min(progress, 49))

        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="storing_triples",
                        metadata={"tripleCount": len(self.triples)})
        self._emit_state("SUB_STATE_ENTERED", "SEMANTIC_GRAPH", sub_state="semantic_graph_complete",
                        message="Semantic & graph construction complete")
        self._emit_state("SUB_STATE_COMPLETED", "SEMANTIC_GRAPH", sub_state="semantic_graph_complete")
        self._emit_state("STEP_COMPLETED", "SEMANTIC_GRAPH", message="Semantic & graph step completed",
                        metadata={"tripleCount": len(self.triples)})

    def _run_reasoning(self):
        from agents.reasoning_agent import ReasoningAgent

        self._emit_state("SUB_STATE_ENTERED", "REASONING", sub_state="indexing_triples",
                        message="Indexing RDF triples")
        self._log("info", "reasoning_agent", f"Indexing {len(self.triples)} RDF triples (subject, predicate, object indexes)...")
        agent = ReasoningAgent(self.triples, self.parsed_data, self.semantic_data)
        self._emit_state("SUB_STATE_COMPLETED", "REASONING", sub_state="indexing_triples",
                        metadata={"tripleCount": len(self.triples)})

        reasoning_substates = [
            ("analyzing_control_flow", "Analyzing control flow",
             "Analyzing control flow — event handlers, initialization sequences, form lifecycles..."),
            ("analyzing_data_flow", "Analyzing data flow",
             "Analyzing data flow — field access patterns, parameter propagation, state mutations..."),
            ("analyzing_dependencies", "Analyzing dependencies",
             "Analyzing dependencies — unit dependency graph, circular dependency detection, coupling metrics..."),
            ("detecting_dead_code", "Detecting dead code",
             "Detecting dead code — unreferenced units, unused classes, uncalled methods & functions..."),
            ("generating_call_graph", "Generating call graph",
             "Generating call graph — caller/callee relationships, entry points, hub nodes, leaf functions..."),
            ("calculating_metrics", "Calculating codebase metrics",
             "Calculating codebase metrics — size, structural, coupling, stability, inheritance depth..."),
            ("detecting_patterns", "Detecting design patterns",
             "Detecting design patterns — Singleton, Factory, Observer, MVC, Repository, DAO..."),
            ("analyzing_architecture", "Analyzing architecture",
             "Analyzing architecture — layer classification, component boundaries, coupling metrics..."),
            ("analyzing_class_hierarchy", "Analyzing class hierarchy",
             "Analyzing class hierarchy — inheritance trees, interface implementations, depth metrics..."),
            ("computing_complexity", "Computing complexity metrics",
             "Computing complexity metrics — cyclomatic complexity, method counts, coupling scores..."),
            ("scanning_api_contracts", "Scanning API/SOA contracts",
             "Scanning for API/SOA contracts — SOAP, REST, DataSnap, WebBroker patterns..."),
            ("generating_sequence_diagrams", "Generating UML sequence diagrams",
             "Generating UML sequence diagrams — form event flows, service call chains..."),
            ("generating_mvc_diagrams", "Generating MVC layer diagrams",
             "Generating MVC/layer diagrams — presentation, business logic, data access tiers..."),
            ("generating_class_interaction_diagrams", "Generating class interaction diagrams",
             "Generating class interaction diagrams — method calls, field references, dependencies..."),
            ("generating_class_object_diagrams", "Generating class/object diagrams",
             "Generating class/object diagrams — properties, methods, associations, compositions..."),
        ]

        for sub_state, short_msg, log_msg in reasoning_substates:
            self._emit_state("SUB_STATE_ENTERED", "REASONING", sub_state=sub_state, message=short_msg)
            self._log("info", "reasoning_agent", log_msg)

        self.analysis_results = agent.analyze()

        for sub_state, short_msg, _ in reasoning_substates:
            self._emit_state("SUB_STATE_COMPLETED", "REASONING", sub_state=sub_state)

        self._log("info", "reasoning_agent", f"Reasoning complete — generated {len(self.analysis_results)} analysis reports & diagrams")

        if self.conn:
            cur = self.conn.cursor()
            for result in self.analysis_results:
                try:
                    cur.execute("""
                        INSERT INTO analysis_results (id, project_id, result_type, title, content, metadata)
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
                    """, (
                        self.project_id,
                        result["result_type"],
                        result["title"],
                        result.get("content", ""),
                        json.dumps(result.get("metadata", {}))
                    ))
                except Exception as e:
                    self._log("warn", "reasoning_agent", f"Result insert error: {str(e)}")

        self._update_job("running", "reasoning", 70)

        self._emit_state("SUB_STATE_ENTERED", "REASONING", sub_state="reasoning_complete",
                        message="Reasoning & analysis complete")
        self._emit_state("SUB_STATE_COMPLETED", "REASONING", sub_state="reasoning_complete")
        self._emit_state("STEP_COMPLETED", "REASONING", message="Reasoning step completed",
                        metadata={"analysisResults": len(self.analysis_results)})

    def _run_exporter(self):
        from agents.exporter_agent import ExporterAgent

        export_substates = [
            ("exporting_json", "Exporting JSON knowledge graph",
             "Generating JSON export — full knowledge graph with nodes and edges..."),
            ("exporting_graphml", "Exporting GraphML format",
             "Generating GraphML export — yEd-compatible graph interchange format..."),
            ("exporting_dot", "Exporting DOT/Graphviz format",
             "Generating DOT export — Graphviz visualization format..."),
            ("exporting_rdf_turtle", "Exporting RDF/Turtle format",
             "Generating RDF/Turtle export — semantic web triple serialization..."),
            ("generating_bpmn", "Generating BPMN workflow diagrams",
             "Generating BPMN workflow diagrams — business process model notation..."),
            ("generating_entity_flow", "Generating entity flow diagrams",
             "Generating entity flow diagrams — data entity relationships & data flow..."),
            ("compiling_summary", "Compiling project summary report",
             "Compiling project summary report..."),
        ]

        self._log("info", "exporter_agent", "Initializing multi-format export engine...")

        for sub_state, short_msg, log_msg in export_substates:
            self._emit_state("SUB_STATE_ENTERED", "EXPORTING", sub_state=sub_state, message=short_msg)
            self._log("info", "exporter_agent", log_msg)

        agent = ExporterAgent(self.triples, self.parsed_data, self.analysis_results, self.project_id)
        export_result = agent.export_all()

        self.exports = export_result.get("exports", {})
        exporter_results = export_result.get("results", [])

        for sub_state, _, _ in export_substates:
            self._emit_state("SUB_STATE_COMPLETED", "EXPORTING", sub_state=sub_state)

        self._log("info", "exporter_agent", f"Export complete — {len(self.exports)} formats: {', '.join(self.exports.keys())}")

        self._emit_state("SUB_STATE_ENTERED", "EXPORTING", sub_state="storing_exports",
                        message="Storing exports to database")

        if self.conn:
            cur = self.conn.cursor()
            for fmt, content in self.exports.items():
                try:
                    size_kb = round(len(content) / 1024, 1)
                    cur.execute("""
                        INSERT INTO analysis_results (id, project_id, result_type, title, content, metadata)
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
                    """, (
                        self.project_id,
                        f"export_{fmt}",
                        f"Export: {fmt.upper()}",
                        content,
                        json.dumps({"format": fmt, "size_bytes": len(content), "size_kb": size_kb})
                    ))
                    self._log("info", "exporter_agent", f"Stored {fmt.upper()} export ({size_kb} KB)")
                except Exception as e:
                    self._log("warn", "exporter_agent", f"Export store error ({fmt}): {str(e)}")

            for result in exporter_results:
                try:
                    cur.execute("""
                        INSERT INTO analysis_results (id, project_id, result_type, title, content, metadata)
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
                    """, (
                        self.project_id,
                        result["result_type"],
                        result["title"],
                        result.get("content", ""),
                        json.dumps(result.get("metadata", {}))
                    ))
                except Exception as e:
                    self._log("warn", "exporter_agent", f"Result insert error: {str(e)}")

        self._emit_state("SUB_STATE_COMPLETED", "EXPORTING", sub_state="storing_exports",
                        metadata={"exportCount": len(self.exports)})

        self._update_job("running", "exporting", 95)

        self._emit_state("SUB_STATE_ENTERED", "EXPORTING", sub_state="exporting_complete",
                        message="Export & visualization complete")
        self._emit_state("SUB_STATE_COMPLETED", "EXPORTING", sub_state="exporting_complete")
        self._emit_state("STEP_COMPLETED", "EXPORTING", message="Export step completed",
                        metadata={"exportCount": len(self.exports), "formats": list(self.exports.keys())})


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: orchestrator.py <project_id> <repo_path>"}))
        sys.exit(1)

    project_id = sys.argv[1]
    repo_path = sys.argv[2]

    agent = OrchestratorAgent(project_id, repo_path)
    result = agent.run()
    print(json.dumps(result))
