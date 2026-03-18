#!/usr/bin/env python3
"""
Exporter Agent - Step 5: Export & Visualization
Generates exports in multiple formats: JSON, GraphML, DOT, RDF/Turtle.
Also produces BPMN workflow diagrams and data entity flow diagrams.
"""

import json
import sys
from typing import Dict, List, Any
from collections import defaultdict


class ExporterAgent:
    def __init__(self, triples: List[Dict[str, str]], parsed_files: List[Dict[str, Any]],
                 analysis_results: List[Dict[str, Any]], project_id: str):
        self.triples = triples
        self.parsed_files = parsed_files
        self.analysis_results = analysis_results
        self.project_id = project_id
        self.exports: Dict[str, str] = {}
        self.results: List[Dict[str, Any]] = []

    def export_all(self) -> Dict[str, Any]:
        self._export_json()
        self._export_graphml()
        self._export_dot()
        self._export_rdf_turtle()
        self._generate_bpmn()
        self._generate_entity_flow()
        self._generate_summary()
        return {
            "exports": self.exports,
            "results": self.results,
        }

    def _export_json(self):
        nodes = []
        edges = []

        type_triples = [t for t in self.triples if t["predicate"] == "rdf:type"]
        label_map = {}
        for t in self.triples:
            if t["predicate"] == "rdfs:label":
                label_map[t["subject"]] = t["object"]

        for t in type_triples:
            node_type = t["object"].replace("code:", "")
            nodes.append({
                "id": t["subject"],
                "label": label_map.get(t["subject"], t["subject"].split(".")[-1]),
                "type": node_type,
            })

        edge_predicates = {"dep:uses", "dep:interfaceDependency", "dep:implementationDependency",
                           "code:extends", "code:implements", "code:declares",
                           "code:hasMethod", "code:hasField", "code:hasProperty",
                           "code:hasParameter", "ref:referencesType"}
        for t in self.triples:
            if t["predicate"] in edge_predicates:
                edges.append({
                    "source": t["subject"],
                    "target": t["object"],
                    "relationship": t["predicate"],
                })

        export_data = {
            "project_id": self.project_id,
            "format": "json",
            "nodes": nodes,
            "edges": edges,
            "triples": self.triples,
            "analysis_results": [{
                "type": r["result_type"],
                "title": r["title"],
                "content": r["content"],
            } for r in self.analysis_results],
            "statistics": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "total_triples": len(self.triples),
                "total_files": len(self.parsed_files),
            }
        }

        self.exports["json"] = json.dumps(export_data, indent=2)

    def _export_graphml(self):
        lines = ['<?xml version="1.0" encoding="UTF-8"?>']
        lines.append('<graphml xmlns="http://graphml.graphstruct.org/graphml"')
        lines.append('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"')
        lines.append('  xsi:schemaLocation="http://graphml.graphstruct.org/graphml">')
        lines.append('  <key id="d0" for="node" attr.name="label" attr.type="string"/>')
        lines.append('  <key id="d1" for="node" attr.name="type" attr.type="string"/>')
        lines.append('  <key id="d2" for="edge" attr.name="relationship" attr.type="string"/>')
        lines.append(f'  <graph id="G" edgedefault="directed">')

        type_triples = [t for t in self.triples if t["predicate"] == "rdf:type"]
        label_map = {}
        for t in self.triples:
            if t["predicate"] == "rdfs:label":
                label_map[t["subject"]] = t["object"]

        node_ids = set()
        for t in type_triples:
            node_id = _xml_escape(t["subject"])
            if node_id not in node_ids:
                node_ids.add(node_id)
                label = _xml_escape(label_map.get(t["subject"], t["subject"].split(".")[-1]))
                node_type = _xml_escape(t["object"].replace("code:", ""))
                lines.append(f'    <node id="{node_id}">')
                lines.append(f'      <data key="d0">{label}</data>')
                lines.append(f'      <data key="d1">{node_type}</data>')
                lines.append(f'    </node>')

        edge_predicates = {"dep:uses", "code:extends", "code:implements", "code:declares",
                           "code:hasMethod", "code:hasField", "code:hasProperty"}
        edge_id = 0
        for t in self.triples:
            if t["predicate"] in edge_predicates:
                src = _xml_escape(t["subject"])
                tgt = _xml_escape(t["object"])
                rel = _xml_escape(t["predicate"])
                lines.append(f'    <edge id="e{edge_id}" source="{src}" target="{tgt}">')
                lines.append(f'      <data key="d2">{rel}</data>')
                lines.append(f'    </edge>')
                edge_id += 1

        lines.append('  </graph>')
        lines.append('</graphml>')

        self.exports["graphml"] = '\n'.join(lines)

    def _export_dot(self):
        lines = ['digraph DelphiCodeGraph {']
        lines.append('  rankdir=LR;')
        lines.append('  node [shape=box, style=filled, fontname="Arial"];')
        lines.append('')

        type_colors = {
            "unit": "#4A90D9", "program": "#4A90D9", "library": "#4A90D9",
            "class": "#50C878", "interface": "#FFB347", "record": "#DDA0DD",
            "procedure": "#87CEEB", "function": "#87CEEB",
            "field": "#F0F0F0", "property": "#F5DEB3",
        }

        type_triples = [t for t in self.triples if t["predicate"] == "rdf:type"]
        label_map = {}
        for t in self.triples:
            if t["predicate"] == "rdfs:label":
                label_map[t["subject"]] = t["object"]

        node_ids = {}
        counter = 0
        for t in type_triples:
            if t["subject"] not in node_ids:
                node_ids[t["subject"]] = f"n{counter}"
                counter += 1
                label = _dot_escape(label_map.get(t["subject"], t["subject"].split(".")[-1]))
                node_type = t["object"].replace("code:", "")
                color = type_colors.get(node_type, "#FFFFFF")
                lines.append(f'  {node_ids[t["subject"]]} [label="{label}", fillcolor="{color}", tooltip="{node_type}"];')

        lines.append('')

        edge_styles = {
            "dep:uses": "color=blue",
            "code:extends": "color=red, style=bold",
            "code:implements": "color=green, style=dashed",
            "code:declares": "color=gray",
            "code:hasMethod": "color=darkgreen",
            "code:hasField": "color=brown",
        }

        for t in self.triples:
            if t["predicate"] in edge_styles and t["subject"] in node_ids and t["object"] in node_ids:
                style = edge_styles[t["predicate"]]
                rel_label = t["predicate"].split(":")[-1]
                lines.append(f'  {node_ids[t["subject"]]} -> {node_ids[t["object"]]} [{style}, label="{rel_label}"];')

        lines.append('}')
        self.exports["dot"] = '\n'.join(lines)

    def _export_rdf_turtle(self):
        lines = []
        lines.append('@prefix delphi: <http://delphi-analyser.org/resource/> .')
        lines.append('@prefix code: <http://delphi-analyser.org/ontology/code#> .')
        lines.append('@prefix dep: <http://delphi-analyser.org/ontology/dependency#> .')
        lines.append('@prefix arch: <http://delphi-analyser.org/ontology/architecture#> .')
        lines.append('@prefix scope: <http://delphi-analyser.org/ontology/scope#> .')
        lines.append('@prefix ref: <http://delphi-analyser.org/ontology/reference#> .')
        lines.append('@prefix flow: <http://delphi-analyser.org/ontology/flow#> .')
        lines.append('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .')
        lines.append('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .')
        lines.append('')

        grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        for t in self.triples:
            grouped[t["subject"]].append(t)

        for subject, triples in grouped.items():
            turtle_subject = _to_turtle_uri(subject)
            lines.append(f'{turtle_subject}')
            for i, t in enumerate(triples):
                pred = _to_turtle_uri(t["predicate"])
                obj = _to_turtle_value(t["object"])
                separator = " ;" if i < len(triples) - 1 else " ."
                lines.append(f'    {pred} {obj}{separator}')
            lines.append('')

        self.exports["turtle"] = '\n'.join(lines)

    def _generate_bpmn(self):
        workflows = []

        for ast in self.parsed_files:
            if "error" in ast:
                continue
            if ast.get("form_type") or any("Form" in cls.get("name", "") for cls in ast.get("classes", [])):
                form_workflow = {
                    "name": ast.get("unit_name", "Unknown"),
                    "type": "form_workflow",
                    "steps": []
                }

                for cls in ast.get("classes", []):
                    for method in cls.get("methods", []):
                        if any(event in method["name"] for event in
                               ("Click", "Change", "Create", "Destroy", "Show",
                                "Close", "Submit", "Save", "Load", "Execute",
                                "KeyPress", "KeyDown", "DblClick", "Enter",
                                "Exit", "Resize", "Activate")):
                            form_workflow["steps"].append({
                                "type": "event",
                                "name": method["name"],
                                "class": cls["name"],
                                "kind": method.get("kind", "procedure")
                            })

                if form_workflow["steps"]:
                    workflows.append(form_workflow)

        content = "## Business Workflow Diagrams (BPMN)\n\n"
        if workflows:
            for wf in workflows:
                content += f"### {wf['name']}\n\n"
                content += "```\n"
                content += f"[Start] → "
                step_names = [s["name"] for s in wf["steps"]]
                content += " → ".join(step_names[:8])
                if len(step_names) > 8:
                    content += f" → ... ({len(step_names) - 8} more steps)"
                content += " → [End]\n"
                content += "```\n\n"

                content += "| Step | Event Handler | Class |\n|------|--------------|-------|\n"
                for step in wf["steps"]:
                    content += f"| {step['name']} | {step['kind']} | {step['class']} |\n"
                content += "\n"
        else:
            content += "No form-based workflows detected in the codebase.\n"

        self.results.append({
            "result_type": "bpmn",
            "title": "Business Workflows (BPMN)",
            "content": content,
            "metadata": {"workflows": workflows}
        })

    def _generate_entity_flow(self):
        data_entities = []
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            for cls in ast.get("classes", []):
                name = cls.get("name", "")
                if any(name.startswith(prefix) for prefix in
                       ("TData", "TDB", "TAdo", "TQuery", "TTable", "TDataSet",
                        "TClient", "TConnection")):
                    data_entities.append({
                        "name": name,
                        "unit": ast.get("unit_name", ""),
                        "fields": [n for f in cls.get("fields", []) for n in f.get("names", [])],
                        "methods": [m["name"] for m in cls.get("methods", [])]
                    })

            for rec in ast.get("records", []):
                data_entities.append({
                    "name": rec["name"],
                    "unit": ast.get("unit_name", ""),
                    "fields": [n for f in rec.get("fields", []) for n in f.get("names", [])],
                    "type": "record"
                })

        content = "## Business Data Entity Flow\n\n"
        if data_entities:
            content += f"**{len(data_entities)} data entities identified**\n\n"
            content += "```\n"
            for i, entity in enumerate(data_entities[:15]):
                arrow = " ←→ " if i < len(data_entities) - 1 else ""
                content += f"[{entity['name']}]{arrow}"
                if (i + 1) % 4 == 0:
                    content += "\n"
            content += "\n```\n\n"

            for entity in data_entities[:20]:
                content += f"### {entity['name']}\n"
                content += f"- **Unit:** {entity['unit']}\n"
                if entity.get("fields"):
                    content += f"- **Fields:** {', '.join(entity['fields'][:10])}\n"
                if entity.get("methods"):
                    content += f"- **Methods:** {', '.join(entity['methods'][:10])}\n"
                content += "\n"
        else:
            content += "No explicit data entities detected. The codebase may use direct database access patterns.\n"

        self.results.append({
            "result_type": "entity_flow",
            "title": "Business Data Entity Flow",
            "content": content,
            "metadata": {"entities": data_entities}
        })

    def _generate_summary(self):
        summary = {
            "project_id": self.project_id,
            "total_files": len(self.parsed_files),
            "total_triples": len(self.triples),
            "total_results": len(self.analysis_results) + len(self.results),
            "result_types": [r["result_type"] for r in self.analysis_results] + [r["result_type"] for r in self.results],
            "export_formats": list(self.exports.keys()),
            "export_sizes": {k: len(v) for k, v in self.exports.items()},
        }

        content = "## Analysis Summary\n\n"
        content += f"- **Total Files Analyzed:** {summary['total_files']}\n"
        content += f"- **Total RDF Triples:** {summary['total_triples']}\n"
        content += f"- **Analysis Results:** {summary['total_results']}\n"
        content += f"- **Export Formats:** {', '.join(summary['export_formats']).upper()}\n\n"

        content += "### Export Sizes\n\n"
        for fmt, size in summary["export_sizes"].items():
            size_kb = round(size / 1024, 1)
            content += f"- **{fmt.upper()}:** {size_kb} KB\n"

        self.results.append({
            "result_type": "summary",
            "title": "Analysis Summary",
            "content": content,
            "metadata": summary
        })


def _xml_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def _dot_escape(s: str) -> str:
    return s.replace('"', '\\"').replace('\n', '\\n')


def _to_turtle_uri(s: str) -> str:
    if ":" in s and not s.startswith("http"):
        prefix, local = s.split(":", 1)
        local = local.replace(" ", "_").replace("(", "").replace(")", "").replace("[", "").replace("]", "")
        return f'{prefix}:{local}'
    return f'<{s}>'


def _to_turtle_value(s: str) -> str:
    if ":" in s and not s.startswith("http") and not s.startswith('"'):
        return _to_turtle_uri(s)
    escaped = s.replace('\\', '\\\\').replace('"', '\\"')
    return f'"{escaped}"'


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: exporter_agent.py <triples_json> <parsed_json> <results_json> [project_id]"}))
        sys.exit(1)

    with open(sys.argv[1], 'r') as f:
        triples = json.load(f)
    with open(sys.argv[2], 'r') as f:
        parsed_files = json.load(f)
    with open(sys.argv[3], 'r') as f:
        analysis_results = json.load(f)

    project_id = sys.argv[4] if len(sys.argv) > 4 else "default"

    agent = ExporterAgent(triples, parsed_files, analysis_results, project_id)
    result = agent.export_all()
    print(json.dumps({
        "exports": {k: f"{len(v)} bytes" for k, v in result["exports"].items()},
        "results": result["results"],
    }))
