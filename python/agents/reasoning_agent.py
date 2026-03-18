#!/usr/bin/env python3
"""
Reasoning Agent - Step 4: Graph Analysis & Reasoning
Performs Control Flow Analysis, Data Flow Analysis, Dependency Analysis, and Pattern Detection.
"""

import json
import sys
from typing import Dict, List, Any, Set, Tuple
from collections import defaultdict


class ReasoningAgent:
    def __init__(self, triples: List[Dict[str, str]], parsed_files: List[Dict[str, Any]],
                 semantic_data: Any = None):
        self.triples = triples
        self.parsed_files = parsed_files
        self.semantic_data = semantic_data
        self.results: List[Dict[str, Any]] = []

        self.subject_index: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        self.predicate_index: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        self.object_index: Dict[str, List[Dict[str, str]]] = defaultdict(list)

        for t in triples:
            self.subject_index[t["subject"]].append(t)
            self.predicate_index[t["predicate"]].append(t)
            self.object_index[t["object"]].append(t)

    def analyze(self) -> List[Dict[str, Any]]:
        self._analyze_control_flow()
        self._analyze_data_flow()
        self._analyze_dependencies()
        self._detect_dead_code()
        self._generate_call_graph()
        self._calculate_metrics()
        self._detect_patterns()
        self._analyze_architecture()
        self._analyze_class_hierarchy()
        self._analyze_complexity()
        self._analyze_api_soa_contracts()
        self._generate_sequence_diagrams()
        self._generate_mvc_layer_diagram()
        self._generate_class_interaction_diagram()
        self._generate_class_object_diagrams()
        return self.results

    def _analyze_control_flow(self):
        event_chains: List[Dict[str, Any]] = []
        init_sequences: List[Dict[str, Any]] = []
        form_flows: List[Dict[str, Any]] = []

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")

            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")

                events = []
                create_methods = []
                destroy_methods = []
                lifecycle_methods = []

                for method in cls.get("methods", []):
                    m_name = method.get("name", "")
                    kind = method.get("kind", "")

                    if kind == "constructor" or m_name == "Create":
                        create_methods.append(m_name)
                    elif kind == "destructor" or m_name == "Destroy":
                        destroy_methods.append(m_name)

                    if any(ev in m_name for ev in ("Click", "Change", "KeyPress", "KeyDown",
                                                    "MouseDown", "MouseUp", "DblClick",
                                                    "Enter", "Exit", "Resize")):
                        events.append({
                            "handler": m_name,
                            "event_type": next((ev for ev in ["Click", "Change", "KeyPress",
                                                                "KeyDown", "MouseDown", "DblClick"]
                                                if ev in m_name), "unknown"),
                            "class": cls_name,
                            "unit": unit_name,
                        })

                    if m_name in ("FormCreate", "FormShow", "FormActivate",
                                   "FormClose", "FormDestroy", "FormCloseQuery"):
                        lifecycle_methods.append(m_name)

                if events:
                    event_chains.append({
                        "class": cls_name,
                        "unit": unit_name,
                        "events": events,
                        "event_count": len(events),
                    })

                if create_methods or lifecycle_methods:
                    init_seq = {
                        "class": cls_name,
                        "unit": unit_name,
                        "sequence": [],
                    }
                    for m in create_methods:
                        init_seq["sequence"].append({"step": m, "phase": "construction"})
                    for m in lifecycle_methods:
                        phase = "initialization" if "Create" in m or "Show" in m else "cleanup"
                        init_seq["sequence"].append({"step": m, "phase": phase})
                    for m in destroy_methods:
                        init_seq["sequence"].append({"step": m, "phase": "destruction"})
                    init_sequences.append(init_seq)

                is_form = cls_name.startswith("TForm") or ast.get("form_type")
                if is_form and events:
                    form_flows.append({
                        "form": cls_name,
                        "unit": unit_name,
                        "user_actions": [e["handler"] for e in events],
                        "lifecycle": lifecycle_methods,
                    })

        content = "## Control Flow Analysis\n\n"

        if event_chains:
            content += f"### Event Handler Chains ({len(event_chains)} classes with events)\n\n"
            for chain in sorted(event_chains, key=lambda x: x["event_count"], reverse=True)[:15]:
                content += f"**{chain['class']}** ({chain['unit']}) — {chain['event_count']} events\n"
                for ev in chain["events"]:
                    content += f"  - `{ev['handler']}` ({ev['event_type']})\n"
                content += "\n"

        if init_sequences:
            content += f"### Initialization Sequences ({len(init_sequences)} classes)\n\n"
            for seq in init_sequences[:10]:
                if seq["sequence"]:
                    content += f"**{seq['class']}** ({seq['unit']})\n"
                    content += "```\n"
                    steps = [s["step"] for s in seq["sequence"]]
                    content += " → ".join(steps) + "\n"
                    content += "```\n\n"

        if form_flows:
            content += f"### Form Interaction Flows ({len(form_flows)} forms)\n\n"
            for flow in form_flows[:10]:
                content += f"**{flow['form']}** — User Actions: {', '.join(flow['user_actions'][:5])}\n"
                if flow["lifecycle"]:
                    content += f"  Lifecycle: {' → '.join(flow['lifecycle'])}\n"
                content += "\n"

        if not event_chains and not init_sequences and not form_flows:
            content += "No significant control flow patterns detected in the codebase.\n"

        self.results.append({
            "result_type": "control_flow",
            "title": "Control Flow Analysis",
            "content": content,
            "metadata": {
                "event_chains": event_chains[:20],
                "init_sequences": init_sequences[:20],
                "form_flows": form_flows[:20],
            }
        })

    def _analyze_data_flow(self):
        data_entities: List[Dict[str, Any]] = []
        data_transformations: List[Dict[str, Any]] = []
        parameter_flows: List[Dict[str, Any]] = []

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")

            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")

                if any(cls_name.startswith(prefix) for prefix in (
                    "TData", "TDB", "TAdo", "TQuery", "TTable", "TDataSet",
                    "TClient", "TConnection"
                )):
                    data_entities.append({
                        "name": cls_name,
                        "unit": unit_name,
                        "kind": "database_access",
                        "fields": [n for f in cls.get("fields", []) for n in f.get("names", [])],
                        "methods": [m["name"] for m in cls.get("methods", [])],
                    })

                if any(name.endswith("Service") or name.endswith("Manager")
                       or name.endswith("Repository") or name.endswith("DAO")
                       for name in [cls_name]):
                    input_types = set()
                    output_types = set()
                    for method in cls.get("methods", []):
                        for param in method.get("params", []):
                            if param.get("type"):
                                input_types.add(param["type"])
                        if method.get("return_type"):
                            output_types.add(method["return_type"])
                    if input_types or output_types:
                        data_transformations.append({
                            "class": cls_name,
                            "unit": unit_name,
                            "inputs": list(input_types),
                            "outputs": list(output_types),
                        })

            for rec in ast.get("records", []):
                data_entities.append({
                    "name": rec["name"],
                    "unit": unit_name,
                    "kind": "record",
                    "fields": [n for f in rec.get("fields", []) for n in f.get("names", [])],
                })

            for proc in ast.get("procedures", []) + ast.get("functions", []):
                params = proc.get("params", [])
                if len(params) >= 2:
                    parameter_flows.append({
                        "routine": proc["name"],
                        "unit": unit_name,
                        "params": [{"name": p["name"], "type": p.get("type", ""), "modifier": p.get("modifier")} for p in params],
                        "return_type": proc.get("return_type"),
                    })

        content = "## Data Flow Analysis\n\n"

        if data_entities:
            content += f"### Data Entities ({len(data_entities)} identified)\n\n"
            for entity in data_entities[:20]:
                content += f"**{entity['name']}** ({entity['unit']}) — {entity['kind']}\n"
                if entity.get("fields"):
                    content += f"  Fields: {', '.join(entity['fields'][:10])}\n"
                if entity.get("methods"):
                    content += f"  Methods: {', '.join(entity['methods'][:8])}\n"
                content += "\n"

        if data_transformations:
            content += f"### Data Transformations ({len(data_transformations)} services)\n\n"
            for xform in data_transformations[:15]:
                content += f"**{xform['class']}** ({xform['unit']})\n"
                if xform["inputs"]:
                    content += f"  Inputs: {', '.join(xform['inputs'][:5])}\n"
                if xform["outputs"]:
                    content += f"  Outputs: {', '.join(xform['outputs'][:5])}\n"
                content += "\n"

        if parameter_flows:
            content += f"### Parameter Passing Patterns ({len(parameter_flows)} routines)\n\n"
            var_params = [pf for pf in parameter_flows if any(p.get("modifier") == "var" for p in pf["params"])]
            out_params = [pf for pf in parameter_flows if any(p.get("modifier") == "out" for p in pf["params"])]
            if var_params:
                content += f"**Routines with var parameters:** {len(var_params)}\n"
                for pf in var_params[:5]:
                    content += f"  - `{pf['routine']}` in {pf['unit']}\n"
                content += "\n"
            if out_params:
                content += f"**Routines with out parameters:** {len(out_params)}\n"
                for pf in out_params[:5]:
                    content += f"  - `{pf['routine']}` in {pf['unit']}\n"
                content += "\n"

        if not data_entities and not data_transformations:
            content += "No explicit data entities or transformations detected.\n"

        self.results.append({
            "result_type": "data_flow",
            "title": "Data Flow Analysis",
            "content": content,
            "metadata": {
                "entities": data_entities[:30],
                "transformations": data_transformations[:20],
                "parameter_flows": parameter_flows[:30],
            }
        })

    def _analyze_dependencies(self):
        dep_triples = [t for t in self.triples if t["predicate"] == "dep:uses"]
        dep_graph: Dict[str, Set[str]] = defaultdict(set)
        reverse_deps: Dict[str, Set[str]] = defaultdict(set)

        for t in dep_triples:
            src = t["subject"].replace("delphi:", "")
            dst = t["object"].replace("delphi:", "")
            dep_graph[src].add(dst)
            reverse_deps[dst].add(src)

        most_depended = sorted(reverse_deps.items(), key=lambda x: len(x[1]), reverse=True)[:15]
        cycles = self._detect_cycles(dep_graph)

        coupling_metrics = {}
        for unit, deps in dep_graph.items():
            afferent = len(reverse_deps.get(unit, set()))
            efferent = len(deps)
            instability = efferent / max(afferent + efferent, 1)
            coupling_metrics[unit] = {
                "afferent": afferent,
                "efferent": efferent,
                "instability": round(instability, 3),
                "total_coupling": afferent + efferent,
            }

        high_coupling = sorted(coupling_metrics.items(), key=lambda x: x[1]["total_coupling"], reverse=True)[:10]

        dep_layers = {"stdlib": set(), "vcl": set(), "rtl": set(), "project": set(), "third_party": set()}
        stdlib_units = {"SysUtils", "Classes", "Types", "Math", "StrUtils", "DateUtils", "Variants",
                        "System", "System.SysUtils", "System.Classes", "System.Types"}
        vcl_units = {"Forms", "Controls", "StdCtrls", "ExtCtrls", "Graphics", "Dialogs", "Menus",
                     "ComCtrls", "ActnList", "Vcl.Forms", "Vcl.Controls", "Vcl.StdCtrls"}
        rtl_units = {"DB", "DBClient", "SqlExpr", "ADODB", "Data.DB", "Data.Win.ADODB"}

        for unit in set(dep_graph.keys()) | set(reverse_deps.keys()):
            if unit in stdlib_units:
                dep_layers["stdlib"].add(unit)
            elif unit in vcl_units:
                dep_layers["vcl"].add(unit)
            elif unit in rtl_units:
                dep_layers["rtl"].add(unit)
            elif unit in dep_graph:
                dep_layers["project"].add(unit)
            else:
                dep_layers["third_party"].add(unit)

        dep_content = "## Dependency Analysis\n\n"
        dep_content += f"- **Total Dependencies:** {len(dep_triples)}\n"
        dep_content += f"- **Units with Dependencies:** {len(dep_graph)}\n"
        dep_content += f"- **Circular Dependencies:** {len(cycles)}\n\n"

        dep_content += "### Dependency Layers\n\n"
        for layer, units in dep_layers.items():
            if units:
                dep_content += f"- **{layer.upper()}**: {len(units)} units\n"
        dep_content += "\n"

        if most_depended:
            dep_content += "### Most Referenced Units\n\n"
            dep_content += "| Unit | Dependents |\n|------|------------|\n"
            for unit, deps in most_depended:
                dep_content += f"| {unit} | {len(deps)} |\n"
            dep_content += "\n"

        if high_coupling:
            dep_content += "### Coupling Metrics\n\n"
            dep_content += "| Unit | Afferent | Efferent | Instability |\n|------|----------|----------|-------------|\n"
            for unit, metrics in high_coupling:
                dep_content += f"| {unit} | {metrics['afferent']} | {metrics['efferent']} | {metrics['instability']} |\n"
            dep_content += "\n"

        if cycles:
            dep_content += f"### Circular Dependencies ({len(cycles)} detected)\n\n"
            for cycle in cycles[:5]:
                dep_content += f"- {' → '.join(cycle)}\n"
            dep_content += "\n"

        self.results.append({
            "result_type": "dependencies",
            "title": "Dependency Analysis",
            "content": dep_content,
            "metadata": {
                "total_dependencies": len(dep_triples),
                "most_depended": [(u, len(d)) for u, d in most_depended],
                "circular_dependencies": cycles[:10],
                "coupling_metrics": {k: v for k, v in high_coupling},
                "dependency_graph": {k: list(v) for k, v in dep_graph.items()},
                "dependency_layers": {k: list(v) for k, v in dep_layers.items()},
            }
        })

    def _detect_cycles(self, graph: Dict[str, Set[str]]) -> List[List[str]]:
        cycles = []
        visited = set()
        path = []
        path_set = set()

        def dfs(node):
            if len(cycles) >= 10:
                return
            if node in path_set:
                idx = path.index(node)
                cycles.append(path[idx:] + [node])
                return
            if node in visited:
                return
            visited.add(node)
            path.append(node)
            path_set.add(node)
            for neighbor in graph.get(node, []):
                dfs(neighbor)
            path.pop()
            path_set.discard(node)

        for node in list(graph.keys()):
            if node not in visited:
                dfs(node)

        return cycles

    def _detect_dead_code(self):
        all_defined_units = set()
        all_referenced_units = set()
        all_defined_classes: Dict[str, str] = {}
        all_referenced_classes: Set[str] = set()
        all_defined_methods: Dict[str, Dict[str, str]] = {}
        all_called_methods: Set[str] = set()
        all_defined_functions: Dict[str, str] = {}
        all_called_functions: Set[str] = set()

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            file_path = ast.get("file_path", "")
            all_defined_units.add(unit_name)

            for ref_unit in ast.get("uses_interface", []) + ast.get("uses_implementation", []):
                all_referenced_units.add(ref_unit)

            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                all_defined_classes[cls_name] = unit_name

                parent = cls.get("parent", "") or ""
                if parent:
                    all_referenced_classes.add(parent)

                for method in cls.get("methods", []):
                    m_name = method.get("name", "")
                    full_name = f"{cls_name}.{m_name}"
                    all_defined_methods[full_name] = {"class": cls_name, "method": m_name, "unit": unit_name, "file": file_path}

                    if method.get("kind") in ("constructor", "destructor"):
                        all_called_methods.add(full_name)
                    if any(ev in m_name for ev in ("Click", "Change", "KeyPress", "KeyDown",
                                                    "MouseDown", "MouseUp", "DblClick", "Enter",
                                                    "Exit", "Resize", "FormCreate", "FormDestroy",
                                                    "FormShow", "FormClose", "FormActivate",
                                                    "Timer", "Paint", "Execute")):
                        all_called_methods.add(full_name)

                for field in cls.get("fields", []):
                    ft = field.get("type", "") or ""
                    if ft.startswith("T") and ft != cls_name:
                        all_referenced_classes.add(ft)

                for prop in cls.get("properties", []):
                    pt = prop.get("type", "") or ""
                    if pt.startswith("T"):
                        all_referenced_classes.add(pt)

            for proc in ast.get("procedures", []):
                all_defined_functions[proc["name"]] = unit_name
            for func in ast.get("functions", []):
                all_defined_functions[func["name"]] = unit_name

        for t in self.triples:
            pred = t["predicate"]
            if pred == "code:calls":
                called = t["object"].replace("delphi:", "").split(".")[-1]
                caller_class = t["subject"].replace("delphi:", "").split(".")
                if len(caller_class) >= 2:
                    all_called_methods.add(f"{caller_class[-2]}.{caller_class[-1]}")
                all_called_functions.add(called)
                for cls_name in all_defined_classes:
                    all_called_methods.add(f"{cls_name}.{called}")
            elif pred == "code:extends" or pred == "code:implements":
                ref = t["object"].replace("delphi:", "").split(".")[-1]
                all_referenced_classes.add(ref)
            elif pred == "code:hasType":
                ref = t["object"].replace("delphi:", "").split(".")[-1]
                all_referenced_classes.add(ref)

        unreferenced_units = []
        for unit in all_defined_units:
            if unit not in all_referenced_units:
                is_main = any(
                    ast.get("unit_type") in ("program", "library", "package")
                    for ast in self.parsed_files
                    if ast.get("unit_name") == unit and "error" not in ast
                )
                if not is_main:
                    unreferenced_units.append(unit)

        unused_classes = []
        for cls_name, unit in all_defined_classes.items():
            if cls_name not in all_referenced_classes:
                is_form = any(
                    any(c.get("name") == cls_name and (c.get("parent", "") or "").lower().startswith("tform")
                        for c in ast.get("classes", []))
                    for ast in self.parsed_files if ast.get("unit_name") == unit and "error" not in ast
                )
                if not is_form:
                    unused_classes.append({"class": cls_name, "unit": unit})

        uncalled_methods = []
        for full_name, info in all_defined_methods.items():
            if full_name not in all_called_methods:
                vis = "public"
                for ast in self.parsed_files:
                    if ast.get("unit_name") == info["unit"] and "error" not in ast:
                        for cls in ast.get("classes", []):
                            if cls.get("name") == info["class"]:
                                for m in cls.get("methods", []):
                                    if m.get("name") == info["method"]:
                                        vis = m.get("visibility", "public")
                if vis in ("public", "published"):
                    uncalled_methods.append({
                        "method": info["method"],
                        "class": info["class"],
                        "unit": info["unit"],
                        "visibility": vis,
                    })

        uncalled_functions = []
        for func_name, unit in all_defined_functions.items():
            if func_name not in all_called_functions:
                uncalled_functions.append({"function": func_name, "unit": unit})

        total_dead = len(unreferenced_units) + len(unused_classes) + len(uncalled_methods) + len(uncalled_functions)
        total_defined = len(all_defined_units) + len(all_defined_classes) + len(all_defined_methods) + len(all_defined_functions)
        dead_pct = round(total_dead / max(total_defined, 1) * 100, 1)

        content = "## Dead Code Detection\n\n"
        content += f"Scanned **{total_defined}** code elements. Found **{total_dead}** potentially unused ({dead_pct}%).\n\n"

        if unreferenced_units:
            content += f"### Unreferenced Units ({len(unreferenced_units)})\n\n"
            content += "These units are not imported by any other unit in the project:\n\n"
            for u in sorted(unreferenced_units):
                content += f"- `{u}`\n"
            content += "\n"

        if unused_classes:
            content += f"### Potentially Unused Classes ({len(unused_classes)})\n\n"
            content += "Classes not referenced as types, parents, or field types elsewhere:\n\n"
            content += "| Class | Unit |\n|-------|------|\n"
            for item in sorted(unused_classes, key=lambda x: x["class"])[:30]:
                content += f"| `{item['class']}` | {item['unit']} |\n"
            content += "\n"

        if uncalled_methods:
            content += f"### Uncalled Public Methods ({len(uncalled_methods)})\n\n"
            content += "Public/published methods with no detected callers:\n\n"
            content += "| Method | Class | Unit | Visibility |\n|--------|-------|------|------------|\n"
            for item in sorted(uncalled_methods, key=lambda x: x["class"])[:40]:
                content += f"| `{item['method']}` | {item['class']} | {item['unit']} | {item['visibility']} |\n"
            content += "\n"

        if uncalled_functions:
            content += f"### Uncalled Standalone Routines ({len(uncalled_functions)})\n\n"
            content += "Standalone procedures/functions with no detected callers:\n\n"
            content += "| Routine | Unit |\n|---------|------|\n"
            for item in sorted(uncalled_functions, key=lambda x: x["function"])[:30]:
                content += f"| `{item['function']}` | {item['unit']} |\n"
            content += "\n"

        if total_dead == 0:
            content += "No dead code detected — all defined elements appear to be referenced.\n"

        self.results.append({
            "result_type": "dead_code",
            "title": "Dead Code Detection",
            "content": content,
            "metadata": {
                "total_defined": total_defined,
                "total_dead": total_dead,
                "dead_percentage": dead_pct,
                "unreferenced_units": unreferenced_units,
                "unused_classes": unused_classes[:30],
                "uncalled_methods": uncalled_methods[:40],
                "uncalled_functions": uncalled_functions[:30],
            }
        })

    def _generate_call_graph(self):
        call_triples = [t for t in self.triples if t["predicate"] == "code:calls"]
        method_triples = [t for t in self.triples if t["predicate"] == "code:hasMethod"]

        callers: Dict[str, Set[str]] = defaultdict(set)
        callees: Dict[str, Set[str]] = defaultdict(set)
        call_edges: List[Dict[str, str]] = []

        for t in call_triples:
            src = t["subject"].replace("delphi:", "")
            dst = t["object"].replace("delphi:", "")
            callers[dst].add(src)
            callees[src].add(dst)
            call_edges.append({"from": src, "to": dst})

        method_owners: Dict[str, str] = {}
        for t in method_triples:
            cls = t["subject"].replace("delphi:", "").split(".")[-1]
            method = t["object"].replace("delphi:", "").split(".")[-1]
            method_owners[method] = cls

        class_calls: Dict[str, Set[str]] = defaultdict(set)
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                for method in cls.get("methods", []):
                    m_name = method.get("name", "")
                    full = f"{cls_name}.{m_name}"
                    for target in callees.get(full, set()):
                        target_cls = method_owners.get(target.split(".")[-1], target.split(".")[0] if "." in target else "")
                        if target_cls and target_cls != cls_name:
                            class_calls[cls_name].add(target_cls)

        most_called = sorted(callers.items(), key=lambda x: len(x[1]), reverse=True)[:20]
        most_calling = sorted(callees.items(), key=lambda x: len(x[1]), reverse=True)[:20]

        entry_points = []
        for name, targets in callees.items():
            if name not in callers or len(callers[name]) == 0:
                if targets:
                    entry_points.append({"name": name, "calls_count": len(targets)})
        entry_points.sort(key=lambda x: x["calls_count"], reverse=True)

        leaf_functions = []
        for name in callers:
            if name not in callees or len(callees[name]) == 0:
                leaf_functions.append({"name": name, "called_by": len(callers[name])})
        leaf_functions.sort(key=lambda x: x["called_by"], reverse=True)

        hub_nodes = []
        for name in set(list(callers.keys()) + list(callees.keys())):
            in_deg = len(callers.get(name, set()))
            out_deg = len(callees.get(name, set()))
            if in_deg >= 3 and out_deg >= 3:
                hub_nodes.append({"name": name, "in_degree": in_deg, "out_degree": out_deg,
                                   "total": in_deg + out_deg})
        hub_nodes.sort(key=lambda x: x["total"], reverse=True)

        content = "## Call Graph Analysis\n\n"
        content += f"- **Total Call Edges:** {len(call_edges)}\n"
        content += f"- **Unique Callers:** {len(callees)}\n"
        content += f"- **Unique Callees:** {len(callers)}\n"
        content += f"- **Entry Points:** {len(entry_points)}\n"
        content += f"- **Leaf Functions:** {len(leaf_functions)}\n\n"

        if most_called:
            content += "### Most Called Functions\n\n"
            content += "| Function | Called By (count) |\n|----------|---------|\n"
            for name, caller_set in most_called[:15]:
                short = name.split(".")[-1] if "." in name else name
                content += f"| `{short}` | {len(caller_set)} |\n"
            content += "\n"

        if most_calling:
            content += "### Functions with Most Outgoing Calls\n\n"
            content += "| Function | Calls (count) |\n|----------|-------|\n"
            for name, callee_set in most_calling[:15]:
                short = name.split(".")[-1] if "." in name else name
                content += f"| `{short}` | {len(callee_set)} |\n"
            content += "\n"

        if hub_nodes:
            content += f"### Hub Nodes ({len(hub_nodes[:15])} high-connectivity functions)\n\n"
            content += "Functions that both receive many calls and make many calls (potential refactoring targets):\n\n"
            content += "| Function | In-Degree | Out-Degree | Total |\n|----------|-----------|------------|-------|\n"
            for h in hub_nodes[:15]:
                short = h["name"].split(".")[-1] if "." in h["name"] else h["name"]
                content += f"| `{short}` | {h['in_degree']} | {h['out_degree']} | {h['total']} |\n"
            content += "\n"

        if entry_points:
            content += f"### Entry Points ({len(entry_points[:10])})\n\n"
            content += "Functions that call others but are not called themselves (top-level entry points):\n\n"
            for ep in entry_points[:10]:
                short = ep["name"].split(".")[-1] if "." in ep["name"] else ep["name"]
                content += f"- `{short}` — makes {ep['calls_count']} calls\n"
            content += "\n"

        if leaf_functions:
            content += f"### Leaf Functions ({len(leaf_functions[:10])})\n\n"
            content += "Functions called by others but making no outgoing calls (utility/helper functions):\n\n"
            for lf in leaf_functions[:10]:
                short = lf["name"].split(".")[-1] if "." in lf["name"] else lf["name"]
                content += f"- `{short}` — called by {lf['called_by']} functions\n"
            content += "\n"

        if class_calls:
            top_interacting = sorted(class_calls.items(), key=lambda x: len(x[1]), reverse=True)[:10]
            content += "### Class-Level Call Graph\n\n"
            content += "Aggregated call relationships between classes:\n\n"

            merm = "graph LR\n"
            added_nodes = set()
            for cls, targets in top_interacting:
                cls_id = self._safe_id(cls)
                if cls_id not in added_nodes:
                    merm += f'    {cls_id}["{self._safe_label(cls)}"]\n'
                    added_nodes.add(cls_id)
                for tgt in sorted(targets)[:5]:
                    tgt_id = self._safe_id(tgt)
                    if tgt_id not in added_nodes:
                        merm += f'    {tgt_id}["{self._safe_label(tgt)}"]\n'
                        added_nodes.add(tgt_id)
                    merm += f"    {cls_id} --> {tgt_id}\n"
            content += f"```mermaid\n{merm}```\n\n"

        if not call_edges:
            content += "No call relationships detected in the codebase.\n"

        self.results.append({
            "result_type": "call_graph",
            "title": "Call Graph Analysis",
            "content": content,
            "metadata": {
                "total_edges": len(call_edges),
                "unique_callers": len(callees),
                "unique_callees": len(callers),
                "entry_points": entry_points[:20],
                "leaf_functions": leaf_functions[:20],
                "hub_nodes": hub_nodes[:20],
                "most_called": [(n, len(s)) for n, s in most_called],
                "most_calling": [(n, len(s)) for n, s in most_calling],
                "class_calls": {k: list(v) for k, v in list(class_calls.items())[:20]},
            }
        })

    def _calculate_metrics(self):
        total_lines = 0
        total_files = 0
        total_classes = 0
        total_interfaces = 0
        total_records = 0
        total_methods = 0
        total_functions = 0
        total_procedures = 0
        total_fields = 0
        total_properties = 0
        total_uses = 0
        blank_lines = 0
        comment_lines = 0

        file_metrics: List[Dict[str, Any]] = []
        class_metrics: List[Dict[str, Any]] = []
        method_counts: List[int] = []
        field_counts: List[int] = []
        param_counts: List[int] = []
        lines_per_file: List[int] = []

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            total_files += 1
            lc = ast.get("line_count", 0)
            total_lines += lc
            lines_per_file.append(lc)

            n_classes = len(ast.get("classes", []))
            n_procs = len(ast.get("procedures", []))
            n_funcs = len(ast.get("functions", []))
            n_records = len(ast.get("records", []))
            n_interfaces = len(ast.get("interfaces_decl", []))
            n_uses = len(ast.get("uses_interface", [])) + len(ast.get("uses_implementation", []))

            total_classes += n_classes
            total_procedures += n_procs
            total_functions += n_funcs
            total_records += n_records
            total_interfaces += n_interfaces
            total_uses += n_uses

            file_metrics.append({
                "file": ast.get("file_path", ""),
                "unit": ast.get("unit_name", ""),
                "lines": lc,
                "classes": n_classes,
                "procedures": n_procs,
                "functions": n_funcs,
                "records": n_records,
                "uses": n_uses,
            })

            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                n_methods = len(cls.get("methods", []))
                n_fields = sum(len(f.get("names", [])) for f in cls.get("fields", []))
                n_props = len(cls.get("properties", []))
                total_methods += n_methods
                total_fields += n_fields
                total_properties += n_props
                method_counts.append(n_methods)
                field_counts.append(n_fields)

                for m in cls.get("methods", []):
                    param_counts.append(len(m.get("params", [])))

                class_metrics.append({
                    "class": cls_name,
                    "unit": ast.get("unit_name", ""),
                    "methods": n_methods,
                    "fields": n_fields,
                    "properties": n_props,
                    "weighted_complexity": n_methods * 2 + n_fields + n_props,
                })

            for proc in ast.get("procedures", []):
                param_counts.append(len(proc.get("params", [])))
                total_methods += 1
            for func in ast.get("functions", []):
                param_counts.append(len(func.get("params", [])))
                total_methods += 1

        dep_triples = [t for t in self.triples if t["predicate"] == "dep:uses"]
        call_triples = [t for t in self.triples if t["predicate"] == "code:calls"]
        extends_triples = [t for t in self.triples if t["predicate"] == "code:extends"]
        implements_triples = [t for t in self.triples if t["predicate"] == "code:implements"]

        avg_lines = round(sum(lines_per_file) / max(len(lines_per_file), 1), 1)
        avg_methods = round(sum(method_counts) / max(len(method_counts), 1), 1)
        avg_fields = round(sum(field_counts) / max(len(field_counts), 1), 1)
        avg_params = round(sum(param_counts) / max(len(param_counts), 1), 1)
        max_lines = max(lines_per_file) if lines_per_file else 0
        max_methods = max(method_counts) if method_counts else 0

        dep_graph: Dict[str, Set[str]] = defaultdict(set)
        reverse_deps: Dict[str, Set[str]] = defaultdict(set)
        for t in dep_triples:
            src = t["subject"].replace("delphi:", "")
            dst = t["object"].replace("delphi:", "")
            dep_graph[src].add(dst)
            reverse_deps[dst].add(src)

        afferent_values = [len(v) for v in reverse_deps.values()]
        efferent_values = [len(v) for v in dep_graph.values()]
        avg_afferent = round(sum(afferent_values) / max(len(afferent_values), 1), 2)
        avg_efferent = round(sum(efferent_values) / max(len(efferent_values), 1), 2)

        instability_values = []
        for unit in dep_graph:
            ca = len(reverse_deps.get(unit, set()))
            ce = len(dep_graph.get(unit, set()))
            if ca + ce > 0:
                instability_values.append(ce / (ca + ce))
        avg_instability = round(sum(instability_values) / max(len(instability_values), 1), 3)

        dit_values: Dict[str, int] = {}
        parent_map: Dict[str, str] = {}
        for t in extends_triples:
            child = t["subject"].replace("delphi:", "").split(".")[-1]
            parent = t["object"].replace("delphi:", "").split(".")[-1]
            parent_map[child] = parent

        def get_dit(cls: str, seen: set) -> int:
            if cls in dit_values:
                return dit_values[cls]
            if cls in seen or cls not in parent_map:
                return 0
            seen.add(cls)
            depth = 1 + get_dit(parent_map[cls], seen)
            dit_values[cls] = depth
            return depth

        for cls in parent_map:
            get_dit(cls, set())

        max_dit = max(dit_values.values()) if dit_values else 0
        avg_dit = round(sum(dit_values.values()) / max(len(dit_values), 1), 2)

        class_metrics.sort(key=lambda x: x["weighted_complexity"], reverse=True)

        content = "## Codebase Metrics\n\n"

        content += "### Size Metrics\n\n"
        content += "| Metric | Value |\n|--------|-------|\n"
        content += f"| Total Source Files | {total_files} |\n"
        content += f"| Total Lines of Code | {total_lines:,} |\n"
        content += f"| Average Lines per File | {avg_lines} |\n"
        content += f"| Largest File (lines) | {max_lines:,} |\n"
        content += f"| Total Classes | {total_classes} |\n"
        content += f"| Total Interfaces | {total_interfaces} |\n"
        content += f"| Total Records | {total_records} |\n"
        content += f"| Total Methods/Routines | {total_methods} |\n"
        content += f"| Total Fields | {total_fields} |\n"
        content += f"| Total Properties | {total_properties} |\n"
        content += "\n"

        content += "### Structural Metrics\n\n"
        content += "| Metric | Value |\n|--------|-------|\n"
        content += f"| Avg Methods per Class | {avg_methods} |\n"
        content += f"| Max Methods in a Class | {max_methods} |\n"
        content += f"| Avg Fields per Class | {avg_fields} |\n"
        content += f"| Avg Parameters per Method | {avg_params} |\n"
        content += f"| Total Unit Dependencies | {len(dep_triples)} |\n"
        content += f"| Total Call Relationships | {len(call_triples)} |\n"
        content += f"| Inheritance Relationships | {len(extends_triples)} |\n"
        content += f"| Interface Implementations | {len(implements_triples)} |\n"
        content += "\n"

        content += "### Coupling & Stability Metrics\n\n"
        content += "| Metric | Value |\n|--------|-------|\n"
        content += f"| Avg Afferent Coupling (Ca) | {avg_afferent} |\n"
        content += f"| Avg Efferent Coupling (Ce) | {avg_efferent} |\n"
        content += f"| Avg Instability (Ce/(Ca+Ce)) | {avg_instability} |\n"
        content += f"| Max Depth of Inheritance (DIT) | {max_dit} |\n"
        content += f"| Avg Depth of Inheritance | {avg_dit} |\n"
        content += "\n"

        if class_metrics:
            content += "### Most Complex Classes (Weighted)\n\n"
            content += "| Class | Unit | Methods | Fields | Properties | Score |\n"
            content += "|-------|------|---------|--------|------------|-------|\n"
            for cm in class_metrics[:15]:
                content += f"| `{cm['class']}` | {cm['unit']} | {cm['methods']} | {cm['fields']} | {cm['properties']} | {cm['weighted_complexity']} |\n"
            content += "\n"

        if file_metrics:
            file_metrics.sort(key=lambda x: x["lines"], reverse=True)
            content += "### File Size Distribution\n\n"
            size_buckets = {"0-100": 0, "101-500": 0, "501-1000": 0, "1001-2000": 0, "2000+": 0}
            for fm in file_metrics:
                lines = fm["lines"]
                if lines <= 100:
                    size_buckets["0-100"] += 1
                elif lines <= 500:
                    size_buckets["101-500"] += 1
                elif lines <= 1000:
                    size_buckets["501-1000"] += 1
                elif lines <= 2000:
                    size_buckets["1001-2000"] += 1
                else:
                    size_buckets["2000+"] += 1

            content += "| Range (lines) | Files |\n|---------------|-------|\n"
            for bucket, count in size_buckets.items():
                bar = "█" * min(count, 30)
                content += f"| {bucket} | {count} {bar} |\n"
            content += "\n"

        self.results.append({
            "result_type": "metrics",
            "title": "Codebase Metrics",
            "content": content,
            "metadata": {
                "total_files": total_files,
                "total_lines": total_lines,
                "total_classes": total_classes,
                "total_interfaces": total_interfaces,
                "total_records": total_records,
                "total_methods": total_methods,
                "total_fields": total_fields,
                "total_properties": total_properties,
                "avg_lines_per_file": avg_lines,
                "avg_methods_per_class": avg_methods,
                "avg_fields_per_class": avg_fields,
                "avg_params_per_method": avg_params,
                "avg_afferent_coupling": avg_afferent,
                "avg_efferent_coupling": avg_efferent,
                "avg_instability": avg_instability,
                "max_dit": max_dit,
                "avg_dit": avg_dit,
                "top_complex_classes": class_metrics[:15],
                "file_metrics": file_metrics[:20],
            }
        })

    def _detect_patterns(self):
        patterns = []

        singleton_candidates = []
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            for cls in ast.get("classes", []):
                has_instance_field = any("Instance" in n or "FInstance" in n
                                        for f in cls.get("fields", []) for n in f.get("names", []))
                has_get_instance = any("GetInstance" in m.get("name", "") or "Instance" in m.get("name", "")
                                      for m in cls.get("methods", []))
                has_private_constructor = any(
                    m.get("kind") == "constructor" and m.get("visibility") in ("private", "strict private")
                    for m in cls.get("methods", [])
                )
                if has_instance_field or has_get_instance or has_private_constructor:
                    singleton_candidates.append(cls["name"])
                    patterns.append({"pattern": "Singleton", "class": cls["name"],
                                    "unit": ast.get("unit_name", ""),
                                    "confidence": "high" if has_instance_field and has_get_instance else "medium"})

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            for cls in ast.get("classes", []):
                name = cls.get("name", "")

                if "Factory" in name or "Creator" in name:
                    create_methods = [m for m in cls.get("methods", []) if "Create" in m.get("name", "")]
                    patterns.append({"pattern": "Factory", "class": name, "unit": unit_name,
                                    "confidence": "high" if create_methods else "medium"})

                if "Observer" in name or "Listener" in name or "Subscriber" in name:
                    patterns.append({"pattern": "Observer", "class": name, "unit": unit_name, "confidence": "medium"})

                notify_methods = [m for m in cls.get("methods", [])
                                  if any(kw in m.get("name", "") for kw in ("Notify", "Fire", "Dispatch", "Trigger"))]
                listener_fields = [n for f in cls.get("fields", []) for n in f.get("names", [])
                                   if any(kw in n for kw in ("Listener", "Observer", "Handler", "OnChange", "OnNotify"))]
                if notify_methods and listener_fields:
                    patterns.append({"pattern": "Observer", "class": name, "unit": unit_name, "confidence": "high"})

                if "Adapter" in name or "Wrapper" in name:
                    patterns.append({"pattern": "Adapter", "class": name, "unit": unit_name, "confidence": "medium"})

                if "Command" in name and any(m.get("name") == "Execute" for m in cls.get("methods", [])):
                    patterns.append({"pattern": "Command", "class": name, "unit": unit_name, "confidence": "high"})

                if "Strategy" in name or (cls.get("parent") and "Strategy" in (cls.get("parent") or "")):
                    patterns.append({"pattern": "Strategy", "class": name, "unit": unit_name, "confidence": "medium"})

                if "Visitor" in name:
                    visit_methods = [m for m in cls.get("methods", []) if "Visit" in m.get("name", "")]
                    patterns.append({"pattern": "Visitor", "class": name, "unit": unit_name,
                                    "confidence": "high" if visit_methods else "medium"})

                if "Decorator" in name or "Proxy" in name:
                    patterns.append({"pattern": name.split("T")[-1] if name.startswith("T") else "Decorator",
                                    "class": name, "unit": unit_name, "confidence": "medium"})

                if "Iterator" in name or "Enumerator" in name:
                    has_next = any(m.get("name") in ("MoveNext", "Next", "HasNext") for m in cls.get("methods", []))
                    patterns.append({"pattern": "Iterator", "class": name, "unit": unit_name,
                                    "confidence": "high" if has_next else "medium"})

        content = "## Pattern Detection\n\n"
        if patterns:
            pattern_groups: Dict[str, List[Dict]] = defaultdict(list)
            for p in patterns:
                pattern_groups[p["pattern"]].append(p)
            for pattern, items in sorted(pattern_groups.items()):
                content += f"### {pattern} Pattern ({len(items)} detected)\n\n"
                for item in items:
                    confidence = item.get("confidence", "medium")
                    badge = "🟢" if confidence == "high" else "🟡"
                    content += f"- {badge} **{item['class']}** ({item['unit']}) — {confidence} confidence\n"
                content += "\n"
        else:
            content += "No common design patterns were explicitly detected in the codebase.\n"

        self.results.append({
            "result_type": "patterns",
            "title": "Pattern Detection",
            "content": content,
            "metadata": {"patterns": patterns}
        })

    def _analyze_architecture(self):
        units = [t for t in self.triples if t["predicate"] == "rdf:type" and t["object"] in ("code:unit", "code:program", "code:library")]
        classes = [t for t in self.triples if t["predicate"] == "rdf:type" and t["object"] == "code:class"]
        interfaces = [t for t in self.triples if t["predicate"] == "rdf:type" and t["object"] == "code:interface"]
        records = [t for t in self.triples if t["predicate"] == "rdf:type" and t["object"] == "code:record"]

        form_units = []
        data_module_units = []
        service_units = []

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            if ast.get("form_type"):
                form_units.append(ast.get("unit_name", ""))
            for cls in ast.get("classes", []):
                name = cls.get("name", "")
                if name.startswith("TDataModule") or (cls.get("parent") and "DataModule" in (cls.get("parent") or "")):
                    data_module_units.append(ast.get("unit_name", ""))
                elif name.endswith("Service") or name.endswith("Manager") or name.endswith("Controller"):
                    service_units.append(ast.get("unit_name", ""))

        layers = {"presentation": [], "business": [], "data": [], "utility": []}
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit = ast.get("unit_name", "")
            uses = set(ast.get("uses_interface", []) + ast.get("uses_implementation", []))

            if unit in form_units:
                layers["presentation"].append(unit)
            elif unit in data_module_units:
                layers["data"].append(unit)
            elif unit in service_units:
                layers["business"].append(unit)
            elif any(u in uses for u in ("Forms", "Controls", "StdCtrls", "ExtCtrls", "Graphics",
                                          "Vcl.Forms", "Vcl.Controls")):
                layers["presentation"].append(unit)
            elif any(u in uses for u in ("DB", "DBClient", "SqlExpr", "ADODB", "Data.DB")):
                layers["data"].append(unit)
            elif any(cls.get("name", "").endswith(("Service", "Manager", "Controller", "Handler", "Logic"))
                     for cls in ast.get("classes", [])):
                layers["business"].append(unit)
            else:
                layers["utility"].append(unit)

        is_mvc = bool(form_units) and bool(service_units or data_module_units)

        arch_content = "## Architecture Overview\n\n"
        arch_content += f"- **Total Units:** {len(units)}\n"
        arch_content += f"- **Total Classes:** {len(classes)}\n"
        arch_content += f"- **Total Interfaces:** {len(interfaces)}\n"
        arch_content += f"- **Total Records:** {len(records)}\n\n"

        if is_mvc:
            arch_content += "### MVC/Layered Architecture Detected\n\n"
            arch_content += "The codebase follows a layered architecture pattern:\n\n"
        else:
            arch_content += "### Architecture Structure\n\n"

        for layer_name, layer_units in layers.items():
            if layer_units:
                arch_content += f"**{layer_name.title()} Layer** ({len(layer_units)} units):\n"
                for u in layer_units:
                    arch_content += f"  - {u}\n"
                arch_content += "\n"

        if is_mvc:
            arch_content += "### Layer Interactions\n\n"
            arch_content += "```\n"
            arch_content += "┌─────────────────────┐\n"
            arch_content += "│  Presentation Layer  │  (Forms, Controls, UI)\n"
            arch_content += "│       ↕              │\n"
            arch_content += "│  Business Layer      │  (Services, Managers)\n"
            arch_content += "│       ↕              │\n"
            arch_content += "│  Data Layer          │  (DataModules, DB Access)\n"
            arch_content += "│       ↕              │\n"
            arch_content += "│  Utility Layer       │  (Helpers, Commons)\n"
            arch_content += "└─────────────────────┘\n"
            arch_content += "```\n\n"

        self.results.append({
            "result_type": "architecture",
            "title": "Architecture Analysis",
            "content": arch_content,
            "metadata": {
                "total_units": len(units),
                "total_classes": len(classes),
                "total_interfaces": len(interfaces),
                "total_records": len(records),
                "layers": layers,
                "is_mvc": is_mvc,
                "form_units": form_units,
                "data_module_units": data_module_units,
                "service_units": service_units,
            }
        })

    def _analyze_class_hierarchy(self):
        extends_triples = [t for t in self.triples if t["predicate"] == "code:extends"]
        implements_triples = [t for t in self.triples if t["predicate"] == "code:implements"]

        hierarchy: Dict[str, List[str]] = defaultdict(list)
        for t in extends_triples:
            parent = t["object"].split(".")[-1] if "." in t["object"] else t["object"].replace("delphi:", "")
            child = t["subject"].split(".")[-1] if "." in t["subject"] else t["subject"].replace("delphi:", "")
            hierarchy[parent].append(child)

        content = "## Class Hierarchy\n\n"
        if hierarchy:
            content += "### Inheritance Tree\n\n"
            roots = set()
            all_children = set()
            for parent, children in hierarchy.items():
                roots.add(parent)
                all_children.update(children)
            roots -= all_children

            for root in sorted(roots):
                content += self._render_tree(root, hierarchy, 0)
            content += "\n"

        if implements_triples:
            content += "### Interface Implementations\n\n"
            impl_map: Dict[str, List[str]] = defaultdict(list)
            for t in implements_triples:
                cls = t["subject"].split(".")[-1]
                iface = t["object"].replace("delphi:", "")
                impl_map[iface].append(cls)
            for iface, impls in sorted(impl_map.items()):
                content += f"- **{iface}**: {', '.join(impls)}\n"

        self.results.append({
            "result_type": "class_hierarchy",
            "title": "Class Hierarchy",
            "content": content,
            "metadata": {
                "hierarchy": {k: v for k, v in hierarchy.items()},
                "interface_count": len(implements_triples)
            }
        })

    def _render_tree(self, node: str, hierarchy: Dict[str, List[str]], depth: int) -> str:
        indent = "  " * depth
        result = f"{indent}- {node}\n"
        for child in sorted(hierarchy.get(node, [])):
            result += self._render_tree(child, hierarchy, depth + 1)
        return result

    def _analyze_complexity(self):
        method_triples = [t for t in self.triples if t["predicate"] == "code:hasMethod"]
        field_triples = [t for t in self.triples if t["predicate"] == "code:hasField"]
        prop_triples = [t for t in self.triples if t["predicate"] == "code:hasProperty"]
        param_triples = [t for t in self.triples if t["predicate"] == "code:hasParameter"]

        class_complexity: Dict[str, Dict[str, int]] = defaultdict(lambda: {"methods": 0, "fields": 0, "properties": 0})
        for t in method_triples:
            class_complexity[t["subject"]]["methods"] += 1
        for t in field_triples:
            class_complexity[t["subject"]]["fields"] += 1
        for t in prop_triples:
            class_complexity[t["subject"]]["properties"] += 1

        complex_classes = sorted(
            class_complexity.items(),
            key=lambda x: x[1]["methods"] + x[1]["fields"] + x[1]["properties"],
            reverse=True
        )[:15]

        file_sizes = []
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            file_sizes.append({
                "file": ast.get("file_path", "unknown"),
                "lines": ast.get("line_count", 0),
                "classes": len(ast.get("classes", [])),
                "procedures": len(ast.get("procedures", [])),
                "functions": len(ast.get("functions", [])),
            })
        file_sizes.sort(key=lambda x: x["lines"], reverse=True)

        content = "## Complexity Analysis\n\n"
        content += f"- **Total Methods:** {len(method_triples)}\n"
        content += f"- **Total Fields:** {len(field_triples)}\n"
        content += f"- **Total Properties:** {len(prop_triples)}\n"
        content += f"- **Total Parameters:** {len(param_triples)}\n\n"

        if complex_classes:
            content += "### Most Complex Classes\n\n"
            content += "| Class | Methods | Fields | Properties |\n|-------|---------|--------|------------|\n"
            for cls_uri, metrics in complex_classes:
                cls_name = cls_uri.split(".")[-1]
                content += f"| {cls_name} | {metrics['methods']} | {metrics['fields']} | {metrics['properties']} |\n"
            content += "\n"

        if file_sizes:
            content += "### Largest Files\n\n"
            content += "| File | Lines | Classes | Procedures | Functions |\n|------|-------|---------|------------|----------|\n"
            for f in file_sizes[:10]:
                content += f"| {f['file']} | {f['lines']} | {f['classes']} | {f['procedures']} | {f['functions']} |\n"

        self.results.append({
            "result_type": "complexity",
            "title": "Complexity Analysis",
            "content": content,
            "metadata": {
                "total_methods": len(method_triples),
                "total_fields": len(field_triples),
                "complex_classes": [(c.split(".")[-1], m) for c, m in complex_classes],
                "file_sizes": file_sizes[:20]
            }
        })


    def _analyze_api_soa_contracts(self):
        SOAP_INDICATORS = {
            "uses": {"Soap.InvokeRegistry", "Soap.Rio", "Soap.SOAPHTTPClient", "Soap.WSDLIntf",
                      "Soap.SOAPHTTPTrans", "Soap.SOAPPasInv", "SOAPHTTPClient", "InvokeRegistry",
                      "Rio", "WSDLIntf", "SOAPHTTPTrans", "MSXML", "XMLDoc", "xmldom"},
            "parents": {"TInvokableClass", "THTTPRio", "THTTPRIO"},
            "interfaces_prefix": ("IOTA", "INTA", "IInvokable"),
        }
        REST_INDICATORS = {
            "uses": {"REST.Client", "REST.Types", "REST.Json", "REST.Response.Adapter",
                      "System.JSON", "Data.DBXJSON", "IdHTTP", "IdHTTPServer",
                      "IdCustomHTTPServer", "MVCFramework", "MVCFramework.Commons",
                      "MVCFramework.RESTAdapter", "MVCFramework.Logger",
                      "Web.HTTPApp", "Web.WebBroker", "Web.WebReq",
                      "IdHTTPWebBrokerBridge", "REST.Authenticator.OAuth",
                      "REST.Authenticator.Basic", "REST.Authenticator.Simple",
                      "System.Net.HttpClient", "System.Net.HttpClientComponent",
                      "XData.Server", "XData.Service", "mORMot", "mORMotHTTPServer"},
            "parents": {"TWebModule", "TRESTClient", "TRESTRequest", "TRESTResponse",
                         "TMVCController", "TCustomRESTRequest"},
        }
        DATASNAP_INDICATORS = {
            "uses": {"Datasnap.DSServer", "Datasnap.DSHTTPLayer", "Datasnap.DSCommonServer",
                      "Datasnap.DSAuth", "DataSnap.DSProviderDataModuleAdapter",
                      "Datasnap.DSClientRest", "Datasnap.DSHTTPWebBroker",
                      "DSServer", "DSHTTPLayer", "DSCommonServer", "DSProxyGenerator"},
            "parents": {"TDSServerModule", "TDSServer", "TDSHTTPService"},
        }
        INDY_INDICATORS = {
            "uses": {"IdHTTPServer", "IdTCPServer", "IdTCPClient", "IdHTTP",
                      "IdCustomHTTPServer", "IdContext", "IdSocketHandle",
                      "IdGlobal", "IdSSLOpenSSL", "IdSSL"},
            "parents": {"TIdHTTPServer", "TIdTCPServer", "TIdCmdTCPServer",
                         "TIdCustomHTTPServer"},
        }
        WEBBROKER_INDICATORS = {
            "uses": {"Web.HTTPApp", "Web.WebBroker", "Web.WebReq",
                      "Web.HTTPProd", "Web.WebFileDispatcher"},
            "parents": {"TWebModule", "TWebDispatcher", "TWebActionItem"},
        }

        soap_services: List[Dict[str, Any]] = []
        rest_endpoints: List[Dict[str, Any]] = []
        datasnap_services: List[Dict[str, Any]] = []
        indy_servers: List[Dict[str, Any]] = []
        webbroker_modules: List[Dict[str, Any]] = []
        invokable_interfaces: List[Dict[str, Any]] = []
        service_contracts: List[Dict[str, Any]] = []
        frameworks_detected: Set[str] = set()
        protocols_detected: Set[str] = set()

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            file_path = ast.get("file_path", "")
            raw_uses = ast.get("uses_interface", []) + ast.get("uses_implementation", [])
            all_uses = set(raw_uses)
            all_uses_lower = {u.lower() for u in raw_uses}

            def uses_match(indicator_set: set) -> bool:
                return bool(all_uses_lower & {s.lower() for s in indicator_set})

            is_soap = uses_match(SOAP_INDICATORS["uses"])
            is_rest = uses_match(REST_INDICATORS["uses"])
            is_datasnap = uses_match(DATASNAP_INDICATORS["uses"])
            is_indy = uses_match(INDY_INDICATORS["uses"])
            is_webbroker = uses_match(WEBBROKER_INDICATORS["uses"])

            if uses_match({"MVCFramework", "MVCFramework.Commons"}):
                frameworks_detected.add("DelphiMVCFramework")
            if uses_match({"XData.Server", "XData.Service"}):
                frameworks_detected.add("TMS XData")
            if uses_match({"mORMot", "mORMotHTTPServer"}):
                frameworks_detected.add("mORMot")
            if is_datasnap:
                frameworks_detected.add("DataSnap")
            if is_webbroker:
                frameworks_detected.add("WebBroker")
            if is_indy:
                frameworks_detected.add("Indy")
            if uses_match({"REST.Client", "REST.Types"}):
                frameworks_detected.add("REST Client Library")

            for iface in ast.get("interfaces_decl", []):
                iface_name = iface.get("name", "")
                iface_parent = iface.get("parent", "") or ""
                iface_parent_lower = iface_parent.lower()
                iface_name_upper = iface_name.upper()
                is_invokable = (
                    iface_parent_lower == "iinvokable" or
                    (iface_parent_lower == "iinterface" and is_soap) or
                    any(iface_name_upper.startswith(p) for p in ("IOTA", "INTA")) or
                    (is_soap and any(iface_name_upper.startswith(p) for p in ("IINVOKABLE",)))
                )
                methods = []
                for m in iface.get("methods", []):
                    m_name = m.get("name", "")
                    m_kind = m.get("kind", "procedure")
                    params = m.get("params", [])
                    ret_type = m.get("return_type", "")
                    param_list = []
                    for p in params:
                        p_name = p.get("name", "")
                        p_type = p.get("type", "")
                        p_mod = p.get("modifier", "")
                        param_list.append({
                            "name": p_name,
                            "type": p_type,
                            "direction": p_mod if p_mod in ("var", "out", "const") else "in"
                        })
                    methods.append({
                        "name": m_name,
                        "kind": m_kind,
                        "return_type": ret_type if m_kind == "function" else None,
                        "parameters": param_list,
                    })
                if is_invokable and methods:
                    invokable_interfaces.append({
                        "name": iface_name,
                        "unit": unit_name,
                        "parent": iface_parent,
                        "methods": methods,
                        "protocol": "SOAP" if is_soap else "RPC",
                    })
                    protocols_detected.add("SOAP" if is_soap else "RPC")

            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                parent = cls.get("parent", "") or ""
                cls_interfaces = cls.get("interfaces", [])
                cls_methods = cls.get("methods", [])
                visibility_public = [m for m in cls_methods if m.get("visibility") in ("public", "published", None)]

                published_methods = []
                for m in visibility_public:
                    m_name = m.get("name", "")
                    m_kind = m.get("kind", "procedure")
                    params = m.get("params", [])
                    ret_type = m.get("return_type", "")
                    if m_name.startswith("_") or m_name in ("Create", "Destroy", "Free"):
                        continue
                    param_list = []
                    for p in params:
                        param_list.append({
                            "name": p.get("name", ""),
                            "type": p.get("type", ""),
                            "direction": p.get("modifier", "in") if p.get("modifier") in ("var", "out", "const") else "in"
                        })
                    published_methods.append({
                        "name": m_name,
                        "kind": m_kind,
                        "return_type": ret_type if m_kind == "function" else None,
                        "parameters": param_list,
                    })

                parent_lower = (parent or "").lower()

                if parent_lower in {p.lower() for p in SOAP_INDICATORS["parents"]} or is_soap:
                    if parent_lower in ("tinvokableclass", "thttprio") and published_methods:
                        soap_services.append({
                            "class": cls_name,
                            "unit": unit_name,
                            "file": file_path,
                            "parent": parent,
                            "implements": cls_interfaces,
                            "methods": published_methods,
                            "wsdl_based": bool(all_uses & {"Soap.WSDLIntf", "WSDLIntf"}),
                        })
                        protocols_detected.add("SOAP")

                is_form_class = parent_lower in ("tform", "tframe") or (parent_lower and ("form" in parent_lower or "frame" in parent_lower))
                is_rest_class = parent_lower in {p.lower() for p in REST_INDICATORS["parents"]}
                has_controller_semantics = (
                    any(kw in cls_name for kw in ("Controller", "Resource", "API", "Service", "Handler", "Endpoint")) or
                    parent_lower in ("tmvccontroller", "twebmodule")
                )
                is_rest_by_uses = is_rest and not is_form_class and published_methods and has_controller_semantics

                if is_rest_class or is_rest_by_uses:
                    http_methods_map = {"Get": "GET", "Post": "POST", "Put": "PUT", "Delete": "DELETE",
                                        "Patch": "PATCH", "Head": "HEAD", "Options": "OPTIONS"}
                    endpoints = []
                    for m in published_methods:
                        m_name = m["name"]
                        if is_form_class and any(kw in m_name for kw in ("Click", "FormCreate", "FormDestroy", "FormShow")):
                            continue
                        http_method = "GET"
                        for prefix, method in http_methods_map.items():
                            if m_name.startswith(prefix) or m_name.lower().startswith(prefix.lower()):
                                http_method = method
                                break
                        if any(kw in m_name for kw in ("Create", "Add", "Insert", "Save", "Submit", "Post")):
                            http_method = "POST"
                        elif any(kw in m_name for kw in ("Update", "Modify", "Edit", "Put")):
                            http_method = "PUT"
                        elif any(kw in m_name for kw in ("Delete", "Remove", "Destroy")):
                            http_method = "DELETE"
                        endpoints.append({
                            **m,
                            "http_method": http_method,
                            "route_hint": f"/{m_name}",
                        })
                    if endpoints:
                        rest_endpoints.append({
                            "class": cls_name,
                            "unit": unit_name,
                            "file": file_path,
                            "parent": parent,
                            "framework": "MVCFramework" if "MVCFramework" in all_uses else
                                          "XData" if "XData" in str(all_uses) else
                                          "WebBroker" if parent == "TWebModule" else "REST",
                            "endpoints": endpoints,
                        })
                        protocols_detected.add("REST/HTTP")

                is_datasnap_cls = (
                    parent_lower in {p.lower() for p in DATASNAP_INDICATORS["parents"]} and is_datasnap
                ) or (
                    is_datasnap and ("servermethods" in cls_name.lower() or "dsserver" in cls_name.lower())
                )
                if is_datasnap_cls and published_methods:
                    datasnap_services.append({
                        "class": cls_name,
                        "unit": unit_name,
                        "file": file_path,
                        "parent": parent,
                        "methods": published_methods,
                        "transport": "HTTP" if all_uses & {"Datasnap.DSHTTPLayer", "DSHTTPLayer"} else "TCP",
                    })
                    protocols_detected.add("DataSnap")

                if parent_lower in {p.lower() for p in INDY_INDICATORS["parents"]} or (is_indy and "server" in cls_name.lower()):
                    event_handlers = [m for m in cls_methods if m.get("name", "").startswith(("CommandGet", "CommandOther", "Execute", "OnCommand"))]
                    indy_servers.append({
                        "class": cls_name,
                        "unit": unit_name,
                        "file": file_path,
                        "parent": parent,
                        "handlers": [m.get("name", "") for m in event_handlers],
                        "ssl": bool(all_uses & {"IdSSLOpenSSL", "IdSSL"}),
                    })
                    protocols_detected.add("TCP/HTTP (Indy)")

                if parent_lower in {p.lower() for p in WEBBROKER_INDICATORS["parents"]} or (is_webbroker and "webmodule" in cls_name.lower()):
                    actions = [m for m in cls_methods if "Action" in m.get("name", "")]
                    webbroker_modules.append({
                        "class": cls_name,
                        "unit": unit_name,
                        "file": file_path,
                        "parent": parent,
                        "actions": [m.get("name", "") for m in actions],
                        "methods": published_methods,
                    })
                    if not any(r["class"] == cls_name for r in rest_endpoints):
                        protocols_detected.add("WebBroker")

                if cls_interfaces:
                    for iface_name in cls_interfaces:
                        matching = [i for i in invokable_interfaces if i["name"] == iface_name]
                        if matching:
                            service_contracts.append({
                                "interface": iface_name,
                                "implementation": cls_name,
                                "unit": unit_name,
                                "methods": matching[0]["methods"],
                                "protocol": matching[0]["protocol"],
                            })

        content = "## API / SOA Web Service Contracts\n\n"

        total_services = len(soap_services) + len(rest_endpoints) + len(datasnap_services) + len(indy_servers) + len(webbroker_modules)

        if total_services == 0 and not invokable_interfaces:
            content += "No API/SOA web service contracts detected in this codebase.\n\n"
            content += "The analyser scans for the following patterns:\n"
            content += "- **SOAP**: TInvokableClass, THTTPRIO, IInvokable interfaces, WSDL imports\n"
            content += "- **REST**: TWebModule, REST.Client, MVCFramework controllers, XData/mORMot services\n"
            content += "- **DataSnap**: TDSServerModule, ServerMethods classes\n"
            content += "- **Indy**: TIdHTTPServer, TIdTCPServer with command handlers\n"
            content += "- **WebBroker**: TWebModule, Web.HTTPApp action items\n"
            self.results.append({
                "result_type": "api_soa_contracts",
                "title": "API / SOA Web Service Contracts",
                "content": content,
                "metadata": {"total_services": 0}
            })
            return

        content += "### Overview\n\n"
        content += f"- **Total Service Endpoints:** {total_services}\n"
        if protocols_detected:
            content += f"- **Protocols Detected:** {', '.join(sorted(protocols_detected))}\n"
        if frameworks_detected:
            content += f"- **Frameworks/Libraries:** {', '.join(sorted(frameworks_detected))}\n"
        content += f"- **Invokable Interfaces:** {len(invokable_interfaces)}\n"
        content += f"- **Service Contracts (Interface → Implementation):** {len(service_contracts)}\n\n"

        if rest_endpoints:
            content += f"### REST API Endpoints ({len(rest_endpoints)} controllers)\n\n"
            for svc in rest_endpoints:
                content += f"#### {svc['class']} ({svc['unit']})\n\n"
                content += f"- **File:** `{svc['file']}`\n"
                content += f"- **Parent Class:** `{svc['parent']}`\n"
                content += f"- **Framework:** {svc['framework']}\n\n"
                content += "| HTTP Method | Endpoint | Parameters | Return Type |\n"
                content += "|-------------|----------|------------|-------------|\n"
                for ep in svc["endpoints"][:30]:
                    params_str = ", ".join(
                        f"{p['direction']} {p['name']}: {p['type']}" for p in ep.get("parameters", [])
                    ) or "—"
                    ret = ep.get("return_type") or "void"
                    content += f"| `{ep['http_method']}` | `{ep['route_hint']}` | {params_str} | `{ret}` |\n"
                content += "\n"

        if soap_services:
            content += f"### SOAP Services ({len(soap_services)} classes)\n\n"
            for svc in soap_services:
                content += f"#### {svc['class']} ({svc['unit']})\n\n"
                content += f"- **File:** `{svc['file']}`\n"
                content += f"- **Parent Class:** `{svc['parent']}`\n"
                if svc.get("implements"):
                    content += f"- **Implements:** {', '.join(svc['implements'])}\n"
                if svc.get("wsdl_based"):
                    content += "- **WSDL-Based:** Yes\n"
                content += "\n**Service Methods:**\n\n"
                content += "| Method | Kind | Parameters | Return Type |\n"
                content += "|--------|------|------------|-------------|\n"
                for m in svc["methods"][:30]:
                    params_str = ", ".join(
                        f"{p['direction']} {p['name']}: {p['type']}" for p in m.get("parameters", [])
                    ) or "—"
                    ret = m.get("return_type") or "void"
                    content += f"| `{m['name']}` | {m['kind']} | {params_str} | `{ret}` |\n"
                content += "\n"

        if datasnap_services:
            content += f"### DataSnap Services ({len(datasnap_services)} classes)\n\n"
            for svc in datasnap_services:
                content += f"#### {svc['class']} ({svc['unit']})\n\n"
                content += f"- **File:** `{svc['file']}`\n"
                content += f"- **Parent Class:** `{svc['parent']}`\n"
                content += f"- **Transport:** {svc['transport']}\n\n"
                content += "**Exposed Methods:**\n\n"
                content += "| Method | Kind | Parameters | Return Type |\n"
                content += "|--------|------|------------|-------------|\n"
                for m in svc["methods"][:30]:
                    params_str = ", ".join(
                        f"{p['direction']} {p['name']}: {p['type']}" for p in m.get("parameters", [])
                    ) or "—"
                    ret = m.get("return_type") or "void"
                    content += f"| `{m['name']}` | {m['kind']} | {params_str} | `{ret}` |\n"
                content += "\n"

        if webbroker_modules:
            content += f"### WebBroker Modules ({len(webbroker_modules)} modules)\n\n"
            for svc in webbroker_modules:
                content += f"#### {svc['class']} ({svc['unit']})\n\n"
                content += f"- **File:** `{svc['file']}`\n"
                content += f"- **Parent Class:** `{svc['parent']}`\n"
                if svc.get("actions"):
                    content += f"- **Web Actions:** {', '.join(svc['actions'])}\n"
                content += "\n"
                if svc["methods"]:
                    content += "| Method | Kind | Parameters | Return Type |\n"
                    content += "|--------|------|------------|-------------|\n"
                    for m in svc["methods"][:20]:
                        params_str = ", ".join(
                            f"{p['direction']} {p['name']}: {p['type']}" for p in m.get("parameters", [])
                        ) or "—"
                        ret = m.get("return_type") or "void"
                        content += f"| `{m['name']}` | {m['kind']} | {params_str} | `{ret}` |\n"
                    content += "\n"

        if indy_servers:
            content += f"### Indy Server Components ({len(indy_servers)} servers)\n\n"
            for svc in indy_servers:
                content += f"#### {svc['class']} ({svc['unit']})\n\n"
                content += f"- **File:** `{svc['file']}`\n"
                content += f"- **Parent Class:** `{svc['parent']}`\n"
                content += f"- **SSL/TLS:** {'Yes' if svc.get('ssl') else 'No'}\n"
                if svc.get("handlers"):
                    content += f"- **Request Handlers:** {', '.join(svc['handlers'])}\n"
                content += "\n"

        if invokable_interfaces:
            content += f"### Invokable Interfaces ({len(invokable_interfaces)} interfaces)\n\n"
            content += "These interfaces define the service contracts for RPC/SOAP communication. "
            content += "A class implementing an invokable interface is automatically registered "
            content += "with the Invocation Registry and its methods become remotely callable.\n\n"
            for iface in invokable_interfaces:
                content += f"#### {iface['name']} ({iface['unit']})\n\n"
                content += f"- **Parent:** `{iface['parent']}`\n"
                content += f"- **Protocol:** {iface['protocol']}\n\n"
                content += "| Method | Kind | Parameters | Return Type |\n"
                content += "|--------|------|------------|-------------|\n"
                for m in iface["methods"][:20]:
                    params_str = ", ".join(
                        f"{p['direction']} {p['name']}: {p['type']}" for p in m.get("parameters", [])
                    ) or "—"
                    ret = m.get("return_type") or "void"
                    content += f"| `{m['name']}` | {m['kind']} | {params_str} | `{ret}` |\n"
                content += "\n"

        if service_contracts:
            content += f"### Service Contract Bindings ({len(service_contracts)} bindings)\n\n"
            content += "These map interface contracts to their concrete implementations:\n\n"
            content += "| Interface | Implementation | Unit | Protocol | Methods |\n"
            content += "|-----------|----------------|------|----------|---------|\n"
            for sc in service_contracts:
                method_names = ", ".join(m["name"] for m in sc["methods"][:5])
                if len(sc["methods"]) > 5:
                    method_names += f" (+{len(sc['methods']) - 5} more)"
                content += f"| `{sc['interface']}` | `{sc['implementation']}` | {sc['unit']} | {sc['protocol']} | {method_names} |\n"
            content += "\n"

        if protocols_detected:
            content += "### Protocol & Technology Summary\n\n"
            content += "| Technology | Standard | Data Format | Transport |\n"
            content += "|------------|----------|-------------|----------|\n"
            if "SOAP" in protocols_detected:
                content += "| SOAP | WSDL 1.1 / SOAP 1.1 | XML | HTTP/HTTPS |\n"
            if "REST/HTTP" in protocols_detected:
                content += "| REST | OpenAPI-compatible | JSON / XML | HTTP/HTTPS |\n"
            if "DataSnap" in protocols_detected:
                content += "| DataSnap | Embarcadero proprietary | JSON | HTTP / TCP |\n"
            if "TCP/HTTP (Indy)" in protocols_detected:
                content += "| Indy | Custom TCP/HTTP | Variable | TCP / HTTP |\n"
            if "WebBroker" in protocols_detected:
                content += "| WebBroker | CGI / ISAPI / Apache | HTML / JSON | HTTP |\n"
            if "RPC" in protocols_detected:
                content += "| RPC | Interface-based | Binary / XML | Variable |\n"
            content += "\n"

        self.results.append({
            "result_type": "api_soa_contracts",
            "title": "API / SOA Web Service Contracts",
            "content": content,
            "metadata": {
                "total_services": total_services,
                "protocols": list(protocols_detected),
                "frameworks": list(frameworks_detected),
                "rest_endpoints": rest_endpoints,
                "soap_services": soap_services,
                "datasnap_services": datasnap_services,
                "indy_servers": indy_servers,
                "webbroker_modules": webbroker_modules,
                "invokable_interfaces": [{
                    "name": i["name"], "unit": i["unit"], "protocol": i["protocol"],
                    "method_count": len(i["methods"])
                } for i in invokable_interfaces],
                "service_contracts": service_contracts,
            }
        })

    def _safe_id(self, name: str) -> str:
        import re
        s = name.replace(" ", "_").replace(".", "_").replace("-", "_").replace("/", "_")
        s = re.sub(r'[^A-Za-z0-9_]', '', s)
        if not s or not s[0].isalpha():
            s = "N" + s
        return s

    def _safe_label(self, text: str) -> str:
        return (text.replace('"', "'")
                    .replace('<', '‹')
                    .replace('>', '›')
                    .replace('{', '(')
                    .replace('}', ')')
                    .replace('&', '+')
                    .replace('#', '')
                    .replace('\n', ' ')
                    .replace('\r', '')
                    .replace('`', "'")
                    .replace('|', '/')
                    .replace('[', '(')
                    .replace(']', ')'))

    def _collect_form_sequences(self):
        form_sequences = []
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                parent = cls.get("parent", "") or ""
                if "Form" not in parent and "Frame" not in parent:
                    continue
                events = []
                data_calls = []
                service_calls = []
                for method in cls.get("methods", []):
                    m_name = method.get("name", "")
                    if m_name.startswith("btn") or m_name.endswith("Click") or "Click" in m_name:
                        events.append({"name": m_name, "type": "button_click"})
                    elif m_name.startswith("FormCreate") or m_name == "Create":
                        events.append({"name": m_name, "type": "lifecycle"})
                    elif m_name.startswith("FormDestroy") or m_name == "Destroy":
                        events.append({"name": m_name, "type": "lifecycle"})
                    elif m_name.startswith("FormShow") or m_name.startswith("FormActivate"):
                        events.append({"name": m_name, "type": "lifecycle"})
                    elif any(kw in m_name for kw in ("Changed", "Change", "Select", "Edit", "Modified")):
                        events.append({"name": m_name, "type": "user_input"})
                    elif any(kw in m_name for kw in ("Load", "Fetch", "Get", "Query", "Open", "Execute")):
                        data_calls.append(m_name)
                    elif any(kw in m_name for kw in ("Save", "Post", "Insert", "Update", "Delete", "Apply")):
                        data_calls.append(m_name)
                for field in cls.get("fields", []):
                    for fn in field.get("names", []):
                        ft = field.get("type", "") or ""
                        if any(kw in ft for kw in ("DataModule", "DataSet", "Connection", "Query", "Table")):
                            service_calls.append(fn)
                if events or data_calls:
                    form_sequences.append({
                        "form": cls_name, "unit": unit_name, "events": events,
                        "data_calls": data_calls, "service_refs": service_calls, "parent": parent,
                    })
        return form_sequences

    def _collect_service_chains(self):
        uses_map = {}
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit = ast.get("unit_name", "")
            uses = list(set(ast.get("uses_interface", []) + ast.get("uses_implementation", [])))
            if uses:
                uses_map[unit] = uses
        service_chains = []
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit = ast.get("unit_name", "")
            for cls in ast.get("classes", []):
                cls_name = cls.get("name", "")
                if not any(cls_name.endswith(s) for s in ("Service", "Manager", "Controller", "Handler")):
                    continue
                methods = [m["name"] for m in cls.get("methods", [])]
                deps = uses_map.get(unit, [])
                if methods and deps:
                    service_chains.append({"class": cls_name, "unit": unit, "methods": methods, "deps": deps})
        return service_chains

    def _collect_layers(self):
        layers = {"presentation": [], "business": [], "data": [], "utility": []}
        unit_classes = {}
        unit_uses = {}
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit = ast.get("unit_name", "")
            uses = list(set(ast.get("uses_interface", []) + ast.get("uses_implementation", [])))
            unit_uses[unit] = uses
            classes = [cls.get("name", "") for cls in ast.get("classes", [])]
            unit_classes[unit] = classes
            is_form = bool(ast.get("form_type"))
            is_dm = any("DataModule" in (cls.get("parent", "") or "") for cls in ast.get("classes", []))
            is_service = any(cls.get("name", "").endswith(("Service", "Manager", "Controller"))
                             for cls in ast.get("classes", []))
            if is_form:
                layers["presentation"].append(unit)
            elif is_dm:
                layers["data"].append(unit)
            elif is_service:
                layers["business"].append(unit)
            elif any(u in uses for u in ("Forms", "Controls", "StdCtrls", "ExtCtrls", "Vcl.Forms", "Vcl.Controls", "FMX.Forms")):
                layers["presentation"].append(unit)
            elif any(u in uses for u in ("DB", "DBClient", "SqlExpr", "ADODB", "Data.DB", "FireDAC.Comp.Client")):
                layers["data"].append(unit)
            else:
                layers["utility"].append(unit)
        return layers, unit_classes, unit_uses

    def _collect_class_data(self):
        class_data = []
        class_info = {}
        class_unit = {}
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit = ast.get("unit_name", "")
            for cls in ast.get("classes", []):
                name = cls.get("name", "")
                parent = cls.get("parent", "") or ""
                fields = []
                for f in cls.get("fields", []):
                    vis = f.get("visibility", "private")
                    ft = f.get("type", "") or ""
                    for fn in f.get("names", []):
                        fields.append({"name": fn, "type": ft, "visibility": vis})
                methods = []
                for m in cls.get("methods", []):
                    vis = m.get("visibility", "public")
                    ret = m.get("return_type", "")
                    kind = m.get("kind", "procedure")
                    params = m.get("params", [])
                    param_str = ", ".join(f"{p.get('name', '?')}: {p.get('type', '?')}" for p in params[:4])
                    methods.append({"name": m["name"], "return_type": ret, "visibility": vis,
                                    "kind": kind, "params": param_str})
                properties = []
                for p in cls.get("properties", []):
                    properties.append({"name": p.get("name", ""), "type": p.get("type", ""),
                                       "visibility": p.get("visibility", "public")})
                complexity = len(fields) + len(methods) + len(properties)
                entry = {
                    "name": name, "unit": unit, "parent": parent,
                    "fields": fields, "methods": methods, "properties": properties,
                    "complexity": complexity
                }
                class_data.append(entry)
                class_info[name] = {"parent": parent, "fields": [{"name": f["name"], "type": f["type"]} for f in fields],
                                    "methods": [m["name"] for m in methods], "unit": unit}
                class_unit[name] = unit
        class_data.sort(key=lambda x: x["complexity"], reverse=True)
        return class_data, class_info, class_unit

    def _collect_interactions(self, class_info):
        interactions = []
        for cls_name, info in class_info.items():
            for field in info["fields"]:
                ft = field["type"]
                if ft.startswith("T") and ft in class_info and ft != cls_name:
                    interactions.append({"from": cls_name, "to": ft, "type": "has-a", "via": field["name"]})
            if info["parent"] and info["parent"] in class_info:
                interactions.append({"from": cls_name, "to": info["parent"], "type": "inherits", "via": ""})
        return interactions

    def _generate_sequence_diagrams(self):
        content = "## Sequence Diagrams (UML 2.0)\n\n"
        content += "Interaction flows showing how components communicate during key operations.\n\n"

        form_sequences = self._collect_form_sequences()
        service_chains = self._collect_service_chains()

        for seq in sorted(form_sequences, key=lambda x: len(x["events"]), reverse=True)[:8]:
            form_name = seq["form"]
            content += f"### {form_name} ({seq['unit']})\n\n"

            lifecycle = [e for e in seq["events"] if e["type"] == "lifecycle"]
            clicks = [e for e in seq["events"] if e["type"] == "button_click"]
            inputs = [e for e in seq["events"] if e["type"] == "user_input"]
            has_dm = bool(seq["service_refs"] or seq["data_calls"])
            dm_label = seq["service_refs"][0] if seq["service_refs"] else "Database"

            puml = "@startuml\n!theme plain\nskinparam style strictuml\n"
            puml += "actor User\n"
            puml += f'participant "{form_name}" as F\n'
            if has_dm:
                puml += f'participant "{dm_label}" as DM\n'
            if lifecycle:
                puml += "== Initialization ==\n"
                for ev in lifecycle[:3]:
                    puml += f"hnote over F : {ev['name']}\n"
                    if has_dm and seq["data_calls"]:
                        puml += f"F -> DM : {seq['data_calls'][0]}()\n"
                        puml += "activate DM\n"
                        puml += "DM --> F : dataset\n"
                        puml += "deactivate DM\n"
            if inputs:
                puml += "== User Input ==\n"
                for ev in inputs[:4]:
                    puml += f"User -> F : {ev['name']}\n"
                    puml += "activate F\n"
                    puml += "F --> User : update UI\n"
                    puml += "deactivate F\n"
            if clicks:
                puml += "== Actions ==\n"
                for ev in clicks[:5]:
                    puml += f"User -> F : {ev['name']}\n"
                    puml += "activate F\n"
                    if has_dm:
                        dc = seq["data_calls"][0] if seq["data_calls"] else "processAction"
                        puml += f"F -> DM : {dc}()\n"
                        puml += "activate DM\n"
                        puml += "DM --> F : result\n"
                        puml += "deactivate DM\n"
                    puml += "F --> User : update display\n"
                    puml += "deactivate F\n"
            puml += "@enduml"
            content += f"```plantuml\n{puml}\n```\n\n"

            fid = self._safe_id(form_name)
            merm = "sequenceDiagram\n"
            merm += "    actor User\n"
            merm += f"    participant {fid} as {self._safe_label(form_name)}\n"
            dm_id = self._safe_id(dm_label)
            if has_dm:
                merm += f"    participant {dm_id} as {self._safe_label(dm_label)}\n"
            if lifecycle:
                for ev in lifecycle[:3]:
                    merm += f"    Note over {fid}: {self._safe_label(ev['name'])}\n"
                    if has_dm and seq["data_calls"]:
                        merm += f"    {fid}->>+{dm_id}: {self._safe_label(seq['data_calls'][0])}()\n"
                        merm += f"    {dm_id}-->>-{fid}: dataset\n"
            for ev in inputs[:4]:
                merm += f"    User->>+{fid}: {self._safe_label(ev['name'])}\n"
                merm += f"    {fid}-->>-User: update UI\n"
            for ev in clicks[:5]:
                merm += f"    User->>+{fid}: {self._safe_label(ev['name'])}\n"
                if has_dm:
                    dc = seq["data_calls"][0] if seq["data_calls"] else "processAction"
                    merm += f"    {fid}->>+{dm_id}: {self._safe_label(dc)}()\n"
                    merm += f"    {dm_id}-->>-{fid}: result\n"
                merm += f"    {fid}-->>-User: update display\n"
            content += f"```mermaid\n{merm}```\n\n"

        if not form_sequences:
            content += "No form-based interaction sequences detected.\n\n"

        if service_chains:
            content += "### Service Layer Sequences\n\n"
            for chain in service_chains[:5]:
                svc_name = chain["class"]
                content += f"#### {svc_name}\n\n"

                puml = "@startuml\n!theme plain\nskinparam style strictuml\n"
                puml += "participant Caller\n"
                puml += f'participant "{svc_name}" as S\n'
                dep_names = []
                for dep in chain["deps"][:3]:
                    if dep not in dep_names:
                        dep_names.append(dep)
                        puml += f'participant "{dep}" as {self._safe_id(dep)}\n'
                for method in chain["methods"][:5]:
                    puml += f"Caller -> S : {method}()\n"
                    puml += "activate S\n"
                    if dep_names:
                        did = self._safe_id(dep_names[0])
                        puml += f"S -> {did} : process()\n"
                        puml += f"activate {did}\n"
                        puml += f"{did} --> S : result\n"
                        puml += f"deactivate {did}\n"
                    puml += "S --> Caller : response\n"
                    puml += "deactivate S\n"
                puml += "@enduml"
                content += f"```plantuml\n{puml}\n```\n\n"

                sid = self._safe_id(svc_name)
                merm = "sequenceDiagram\n"
                merm += "    participant Caller\n"
                merm += f"    participant {sid} as {self._safe_label(svc_name)}\n"
                dep_ids = []
                for dep in chain["deps"][:3]:
                    did = self._safe_id(dep)
                    if did not in dep_ids:
                        dep_ids.append(did)
                        merm += f"    participant {did} as {self._safe_label(dep)}\n"
                for method in chain["methods"][:5]:
                    merm += f"    Caller->>+{sid}: {self._safe_label(method)}()\n"
                    if dep_ids:
                        merm += f"    {sid}->>+{dep_ids[0]}: process()\n"
                        merm += f"    {dep_ids[0]}-->>-{sid}: result\n"
                    merm += f"    {sid}-->>-Caller: response\n"
                content += f"```mermaid\n{merm}```\n\n"

        self.results.append({
            "result_type": "sequence_diagrams",
            "title": "Sequence Diagrams",
            "content": content,
            "metadata": {
                "form_sequences_count": len(form_sequences),
                "service_chains_count": len(service_chains),
            }
        })

    def _generate_mvc_layer_diagram(self):
        layers, unit_classes, unit_uses = self._collect_layers()

        content = "## MVC Layer Diagram\n\n"
        content += "Visual representation of the architectural layers and their relationships.\n\n"

        content += "### Layer Overview\n\n"

        layer_prefixes = {"presentation": "PL", "business": "BL", "data": "DL", "utility": "UL"}
        layer_colors = {"presentation": "#LightBlue", "business": "#LightGreen", "data": "#Wheat", "utility": "#LightGray"}
        layer_titles = {"presentation": "Presentation Layer", "business": "Business Layer", "data": "Data Layer", "utility": "Utility Layer"}
        layer_limits = {"presentation": 20, "business": 20, "data": 20, "utility": 15}

        puml = "@startuml\n!theme plain\nskinparam style strictuml\n"
        puml += "skinparam packageStyle rectangle\n"

        for layer_name in ["presentation", "business", "data", "utility"]:
            prefix = layer_prefixes[layer_name]
            color = layer_colors[layer_name]
            title = layer_titles[layer_name]
            limit = layer_limits[layer_name]
            unique_units = [u for u in dict.fromkeys(layers[layer_name]) if u and u.strip()][:limit]

            puml += f'package "{title}" as {prefix} {color} {{\n'
            if unique_units:
                for u in unique_units:
                    safe = u.replace('"', "'")
                    alias = f"{prefix}_{self._safe_id(u)}"
                    puml += f'  ["{safe}"] as {alias}\n'
            elif layer_name == "business":
                puml += '  ["No explicit business layer"] as BL_none\n'
            puml += "}\n"

        puml += "PL --> BL\nBL --> DL\nPL --> UL\nBL --> UL\nDL --> UL\n"
        puml += "@enduml"
        content += f"```plantuml\n{puml}\n```\n\n"

        merm_prefixes = {"presentation": "PL", "business": "BL", "data": "DL", "utility": "UL"}
        merm_titles = {"presentation": "Presentation Layer", "business": "Business Layer", "data": "Data Layer", "utility": "Utility Layer"}
        merm_limits = {"presentation": 15, "business": 15, "data": 15, "utility": 10}

        merm = "graph TB\n"
        for layer_name in ["presentation", "business", "data", "utility"]:
            prefix = merm_prefixes[layer_name]
            title = merm_titles[layer_name]
            limit = merm_limits[layer_name]
            unique_units = [u for u in dict.fromkeys(layers[layer_name]) if u and u.strip()][:limit]

            merm += f'    subgraph {prefix}Sub["{title}"]\n'
            merm += "        direction LR\n"
            if unique_units:
                for u in unique_units:
                    uid = f"{prefix}_{self._safe_id(u)}"
                    safe = self._safe_label(u)
                    merm += f'        {uid}["{safe}"]\n'
            elif layer_name == "business":
                merm += '        BL_none["(No explicit business layer)"]\n'
            merm += "    end\n"

        merm += "    PLSub --> BLSub\n    BLSub --> DLSub\n"
        merm += "    PLSub --> ULSub\n    BLSub --> ULSub\n    DLSub --> ULSub\n"
        content += f"```mermaid\n{merm}```\n\n"

        cross_layer = []
        all_layer_units = {}
        for layer_name, units in layers.items():
            for u in units:
                all_layer_units[u] = layer_name
        for unit, uses in unit_uses.items():
            src_layer = all_layer_units.get(unit)
            if not src_layer:
                continue
            for dep in uses:
                dep_layer = all_layer_units.get(dep)
                if dep_layer and dep_layer != src_layer:
                    cross_layer.append({"from": unit, "from_layer": src_layer, "to": dep, "to_layer": dep_layer})

        if cross_layer:
            content += "### Cross-Layer Dependencies\n\n"
            content += "| Source Unit | Source Layer | Target Unit | Target Layer |\n"
            content += "|------------|-------------|-------------|-------------|\n"
            seen = set()
            for dep in cross_layer:
                key = f"{dep['from']}->{dep['to']}"
                if key in seen:
                    continue
                seen.add(key)
                content += f"| {dep['from']} | {dep['from_layer'].title()} | {dep['to']} | {dep['to_layer'].title()} |\n"
            content += "\n"

        content += "### Layer Statistics\n\n"
        for layer_name, units in layers.items():
            if units:
                total_classes = sum(len(unit_classes.get(u, [])) for u in units)
                content += f"**{layer_name.title()} Layer**: {len(units)} units, {total_classes} classes\n"
                for u in units:
                    classes = unit_classes.get(u, [])
                    if classes:
                        content += f"  - **{u}**: {', '.join(classes)}\n"
                    else:
                        content += f"  - {u}\n"
                content += "\n"

        self.results.append({
            "result_type": "mvc_layers",
            "title": "MVC Layer Diagram",
            "content": content,
            "metadata": {
                "layers": {k: v for k, v in layers.items()},
                "cross_layer_deps": len(cross_layer),
            }
        })

    def _generate_class_interaction_diagram(self):
        content = "## Class & Object Interactions\n\n"
        content += "How classes and objects communicate, including field references, method calls, and inheritance.\n\n"

        class_data, class_info, class_unit = self._collect_class_data()
        interactions = self._collect_interactions(class_info)

        seen_classes = set()
        for inter in interactions:
            seen_classes.add(inter["from"])
            seen_classes.add(inter["to"])

        if interactions:
            top_classes = sorted(seen_classes, key=lambda c: sum(1 for i in interactions if c in (i["from"], i["to"])), reverse=True)[:25]
            filtered = [i for i in interactions if i["from"] in top_classes and i["to"] in top_classes]

            content += "### Interaction Graph\n\n"

            puml = "@startuml\n!theme plain\nskinparam style strictuml\n"
            puml += "left to right direction\n"
            rendered_puml = set()
            for inter in filtered:
                if inter["type"] == "inherits":
                    key = f"{inter['from']}--|>{inter['to']}"
                    if key not in rendered_puml:
                        rendered_puml.add(key)
                        puml += f'class "{inter["from"]}"\nclass "{inter["to"]}"\n'
                        puml += f'"{inter["from"]}" --|> "{inter["to"]}"\n'
                else:
                    key = f"{inter['from']}-->{inter['to']}"
                    if key not in rendered_puml:
                        rendered_puml.add(key)
                        puml += f'class "{inter["from"]}"\nclass "{inter["to"]}"\n'
                        label = inter["via"] if inter["via"] else "uses"
                        puml += f'"{inter["from"]}" --> "{inter["to"]}" : {label}\n'
            puml += "@enduml"
            content += f"```plantuml\n{puml}\n```\n\n"

            merm = "graph LR\n"
            rendered_edges = set()
            for inter in filtered:
                fid = self._safe_id(inter["from"])
                tid = self._safe_id(inter["to"])
                edge_key = f"{fid}-{tid}-{inter['type']}"
                if edge_key in rendered_edges:
                    continue
                rendered_edges.add(edge_key)
                if inter["type"] == "inherits":
                    merm += f"    {fid} -->|extends| {tid}\n"
                else:
                    label = self._safe_label(inter["via"]) if inter["via"] else "uses"
                    merm += f"    {fid} -.->|{label}| {tid}\n"
            content += f"```mermaid\n{merm}```\n\n"

        has_a_groups = defaultdict(list)
        inherits_groups = defaultdict(list)
        for inter in interactions:
            if inter["type"] == "has-a":
                has_a_groups[inter["from"]].append(inter)
            else:
                inherits_groups[inter["to"]].append(inter)

        if has_a_groups:
            content += "### Composition Relationships (Has-A)\n\n"
            content += "Classes that hold references to other classes.\n\n"
            for cls_name, rels in sorted(has_a_groups.items(), key=lambda x: len(x[1]), reverse=True):
                content += f"**{cls_name}** ({class_unit.get(cls_name, '?')}):\n"
                for rel in rels:
                    content += f"  - `{rel['via']}`: {rel['to']}\n"
                content += "\n"

        if inherits_groups:
            content += "### Inheritance Relationships\n\n"
            for parent, children_rels in sorted(inherits_groups.items(), key=lambda x: len(x[1]), reverse=True):
                child_names = [r["from"] for r in children_rels]
                content += f"**{parent}** <- {', '.join(child_names)}\n\n"

        if not interactions:
            content += "No direct class-to-class interactions detected through field references.\n"

        self.results.append({
            "result_type": "class_interactions",
            "title": "Class & Object Interactions",
            "content": content,
            "metadata": {
                "total_interactions": len(interactions),
                "composition_count": sum(1 for i in interactions if i["type"] == "has-a"),
                "inheritance_count": sum(1 for i in interactions if i["type"] == "inherits"),
            }
        })

    def _generate_class_object_diagrams(self):
        content = "## Class & Object Diagrams (UML 2.0)\n\n"
        content += "Detailed class structure showing fields, methods, and relationships.\n\n"

        class_data, class_info, class_unit = self._collect_class_data()
        top_classes = class_data[:12]
        vis_map = {"public": "+", "published": "+", "protected": "#", "private": "-",
                   "strict private": "-", "strict protected": "#"}

        if top_classes:
            content += "### Class Diagrams (Top Classes by Complexity)\n\n"

            puml = "@startuml\n!theme plain\nskinparam style strictuml\n"
            puml += "skinparam classAttributeIconSize 0\n"
            puml += "left to right direction\n"
            rendered_names = set()
            for cls in top_classes:
                rendered_names.add(cls["name"])
                puml += f'class {cls["name"]} {{\n'
                for field in cls["fields"][:10]:
                    v = vis_map.get(field["visibility"], "-")
                    ft = field["type"] if field["type"] else "var"
                    puml += f'  {v} {field["name"]} : {ft}\n'
                puml += "  ..\n"
                for method in cls["methods"][:12]:
                    v = vis_map.get(method["visibility"], "+")
                    ret = f" : {method['return_type']}" if method["return_type"] else ""
                    puml += f'  {v} {method["name"]}({method["params"]}){ret}\n'
                puml += "}\n"
            for cls in top_classes:
                if cls["parent"]:
                    pid = cls["parent"]
                    if pid not in rendered_names:
                        puml += f'class {pid}\n'
                        rendered_names.add(pid)
                    puml += f'{cls["name"]} --|> {pid}\n'
                for field in cls["fields"]:
                    ft = field["type"]
                    if ft.startswith("T") and ft in rendered_names and ft != cls["name"]:
                        puml += f'{cls["name"]} --> {ft} : {field["name"]}\n'
            puml += "@enduml"
            content += f"```plantuml\n{puml}\n```\n\n"

            merm = "classDiagram\n"
            rendered_m = set()
            for cls in top_classes:
                cid = self._safe_id(cls["name"])
                rendered_m.add(cls["name"])
                merm += f"    class {cid} {{\n"
                for field in cls["fields"][:8]:
                    v = vis_map.get(field["visibility"], "-")
                    ft = self._safe_id(field["type"]) if field["type"] else "var"
                    fname = self._safe_id(field["name"])
                    merm += f"        {v}{fname} : {ft}\n"
                for method in cls["methods"][:10]:
                    v = vis_map.get(method["visibility"], "+")
                    safe_params = self._safe_label(method["params"]).replace("(", "").replace(")", "")
                    safe_ret = self._safe_label(method["return_type"]) if method["return_type"] else ""
                    ret = f" {safe_ret}" if safe_ret else ""
                    safe_mname = self._safe_id(method["name"])
                    merm += f"        {v}{safe_mname}({safe_params}){ret}\n"
                merm += "    }\n"
            for cls in top_classes:
                cid = self._safe_id(cls["name"])
                if cls["parent"]:
                    pid = self._safe_id(cls["parent"])
                    merm += f"    {pid} <|-- {cid}\n"
                    rendered_m.add(cls["parent"])
                for field in cls["fields"]:
                    ft = field["type"]
                    if ft.startswith("T") and ft in rendered_m and ft != cls["name"]:
                        fid = self._safe_id(ft)
                        merm += f"    {cid} --> {fid} : {self._safe_label(field['name'])}\n"
            content += f"```mermaid\n{merm}```\n\n"

        if class_data:
            content += "### All Classes Overview\n\n"
            content += "| Class | Unit | Parent | Fields | Methods | Properties |\n"
            content += "|-------|------|--------|--------|---------|------------|\n"
            for cls in class_data:
                content += f"| {cls['name']} | {cls['unit']} | {cls['parent'] or '-'} | {len(cls['fields'])} | {len(cls['methods'])} | {len(cls['properties'])} |\n"
            content += "\n"

        for cls in top_classes[:5]:
            content += f"### {cls['name']} ({cls['unit']})\n\n"
            if cls["parent"]:
                content += f"**Extends:** {cls['parent']}\n\n"
            if cls["fields"]:
                content += "**Fields:**\n"
                for f in cls["fields"]:
                    content += f"  - `{f['visibility']}` **{f['name']}**: {f['type'] or 'untyped'}\n"
                content += "\n"
            if cls["methods"]:
                content += "**Methods:**\n"
                for m in cls["methods"]:
                    ret = f" -> {m['return_type']}" if m["return_type"] else ""
                    content += f"  - `{m['visibility']}` **{m['name']}**({m['params']}){ret} *[{m['kind']}]*\n"
                content += "\n"
            if cls["properties"]:
                content += "**Properties:**\n"
                for p in cls["properties"]:
                    content += f"  - `{p['visibility']}` **{p['name']}**: {p['type']}\n"
                content += "\n"

        self.results.append({
            "result_type": "class_diagrams",
            "title": "Class & Object Diagrams",
            "content": content,
            "metadata": {
                "total_classes": len(class_data),
                "top_classes": [c["name"] for c in top_classes],
            }
        })


def analyze(triples_file: str, parsed_file: str) -> List[Dict[str, Any]]:
    with open(triples_file, 'r') as f:
        triples = json.load(f)
    with open(parsed_file, 'r') as f:
        parsed_files = json.load(f)

    agent = ReasoningAgent(triples, parsed_files)
    return agent.analyze()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: reasoning_agent.py <triples_json> <parsed_json>"}))
        sys.exit(1)

    results = analyze(sys.argv[1], sys.argv[2])
    print(json.dumps(results))
