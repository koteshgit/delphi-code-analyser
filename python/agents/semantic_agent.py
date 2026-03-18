#!/usr/bin/env python3
"""
Semantic & Graph Constructor Agent
Step 2: Semantic Analysis - Symbol Table Building, Type Resolution, Reference Linking, Scope Analysis
Step 3: Graph Construction - Node Creation, Edge Creation, Metadata Attachment
"""

import json
import sys
from typing import Dict, List, Any, Set, Optional
from collections import defaultdict


class RDFNamespaces:
    DELPHI = "delphi:"
    CODE = "code:"
    ARCH = "arch:"
    DEP = "dep:"
    RDF = "rdf:"
    RDFS = "rdfs:"
    SCOPE = "scope:"
    REF = "ref:"
    FLOW = "flow:"


class SymbolEntry:
    def __init__(self, name: str, kind: str, unit_name: str, scope: str,
                 parent: Optional[str] = None, type_info: Optional[str] = None,
                 visibility: Optional[str] = None, line: int = 0, file_path: str = ""):
        self.name = name
        self.kind = kind
        self.unit_name = unit_name
        self.scope = scope
        self.parent = parent
        self.type_info = type_info
        self.visibility = visibility
        self.line = line
        self.file_path = file_path
        self.resolved_type: Optional[str] = None
        self.references: List[str] = []


class SymbolTable:
    def __init__(self):
        self.symbols: Dict[str, SymbolEntry] = {}
        self.unit_symbols: Dict[str, List[str]] = defaultdict(list)
        self.type_registry: Dict[str, str] = {}
        self.scope_tree: Dict[str, List[str]] = defaultdict(list)

    def add_symbol(self, qualified_name: str, entry: SymbolEntry):
        self.symbols[qualified_name] = entry
        self.unit_symbols[entry.unit_name].append(qualified_name)
        if entry.kind in ('class', 'interface', 'record', 'typeAlias', 'procedural_type'):
            self.type_registry[entry.name] = qualified_name
        self.scope_tree[entry.scope].append(qualified_name)

    def resolve_type(self, type_name: str, current_unit: str) -> Optional[str]:
        if not type_name:
            return None
        if type_name in self.type_registry:
            return self.type_registry[type_name]
        qualified = f"{current_unit}.{type_name}"
        if qualified in self.symbols:
            return qualified
        return None

    def get_unit_exports(self, unit_name: str) -> List[str]:
        return [
            qn for qn in self.unit_symbols.get(unit_name, [])
            if self.symbols[qn].scope in ('unit', 'interface')
        ]


class SemanticAnalyzer:
    def __init__(self, parsed_files: List[Dict[str, Any]]):
        self.parsed_files = parsed_files
        self.symbol_table = SymbolTable()
        self.reference_links: List[Dict[str, str]] = []
        self.scope_map: Dict[str, Dict[str, Any]] = {}

    def analyze(self) -> Dict[str, Any]:
        self._build_symbol_table()
        self._resolve_types()
        self._link_references()
        self._analyze_scopes()
        return {
            "symbol_table": self.symbol_table,
            "reference_links": self.reference_links,
            "scope_map": self.scope_map,
        }

    def _build_symbol_table(self):
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            if not unit_name:
                continue
            file_path = ast.get("file_path", "")

            self.symbol_table.add_symbol(unit_name, SymbolEntry(
                name=unit_name, kind=ast.get("unit_type", "unit"),
                unit_name=unit_name, scope="global", file_path=file_path
            ))

            for cls in ast.get("classes", []):
                cls_qn = f"{unit_name}.{cls['name']}"
                self.symbol_table.add_symbol(cls_qn, SymbolEntry(
                    name=cls["name"], kind="class", unit_name=unit_name,
                    scope="unit", parent=cls.get("parent"),
                    visibility="public", line=cls.get("line", 0), file_path=file_path
                ))
                for method in cls.get("methods", []):
                    method_qn = f"{cls_qn}.{method['name']}"
                    self.symbol_table.add_symbol(method_qn, SymbolEntry(
                        name=method["name"], kind=method.get("kind", "method"),
                        unit_name=unit_name, scope=cls_qn,
                        type_info=method.get("return_type"),
                        visibility=method.get("visibility", "public"),
                        line=0, file_path=file_path
                    ))
                    for param in method.get("params", []):
                        param_qn = f"{method_qn}.{param['name']}"
                        self.symbol_table.add_symbol(param_qn, SymbolEntry(
                            name=param["name"], kind="parameter",
                            unit_name=unit_name, scope=method_qn,
                            type_info=param.get("type"), file_path=file_path
                        ))
                for field in cls.get("fields", []):
                    for name in field.get("names", []):
                        field_qn = f"{cls_qn}.{name}"
                        self.symbol_table.add_symbol(field_qn, SymbolEntry(
                            name=name, kind="field", unit_name=unit_name,
                            scope=cls_qn, type_info=field.get("type"),
                            visibility=field.get("visibility", "private"), file_path=file_path
                        ))
                for prop in cls.get("properties", []):
                    prop_qn = f"{cls_qn}.{prop['name']}"
                    self.symbol_table.add_symbol(prop_qn, SymbolEntry(
                        name=prop["name"], kind="property", unit_name=unit_name,
                        scope=cls_qn, type_info=prop.get("type"),
                        visibility=prop.get("visibility", "public"), file_path=file_path
                    ))

            for iface in ast.get("interfaces_decl", []):
                iface_qn = f"{unit_name}.{iface['name']}"
                self.symbol_table.add_symbol(iface_qn, SymbolEntry(
                    name=iface["name"], kind="interface", unit_name=unit_name,
                    scope="unit", parent=iface.get("parent"),
                    line=iface.get("line", 0), file_path=file_path
                ))
                for method in iface.get("methods", []):
                    method_qn = f"{iface_qn}.{method['name']}"
                    self.symbol_table.add_symbol(method_qn, SymbolEntry(
                        name=method["name"], kind=method.get("kind", "procedure"),
                        unit_name=unit_name, scope=iface_qn, file_path=file_path
                    ))

            for rec in ast.get("records", []):
                rec_qn = f"{unit_name}.{rec['name']}"
                self.symbol_table.add_symbol(rec_qn, SymbolEntry(
                    name=rec["name"], kind="record", unit_name=unit_name,
                    scope="unit", line=rec.get("line", 0), file_path=file_path
                ))
                for field in rec.get("fields", []):
                    for name in field.get("names", []):
                        field_qn = f"{rec_qn}.{name}"
                        self.symbol_table.add_symbol(field_qn, SymbolEntry(
                            name=name, kind="field", unit_name=unit_name,
                            scope=rec_qn, type_info=field.get("type"), file_path=file_path
                        ))

            for proc in ast.get("procedures", []):
                proc_qn = f"{unit_name}.{proc['name']}"
                self.symbol_table.add_symbol(proc_qn, SymbolEntry(
                    name=proc["name"], kind="procedure", unit_name=unit_name,
                    scope="unit", file_path=file_path
                ))

            for func in ast.get("functions", []):
                func_qn = f"{unit_name}.{func['name']}"
                self.symbol_table.add_symbol(func_qn, SymbolEntry(
                    name=func["name"], kind="function", unit_name=unit_name,
                    scope="unit", type_info=func.get("return_type"), file_path=file_path
                ))

            for typ in ast.get("types", []):
                type_qn = f"{unit_name}.{typ['name']}"
                self.symbol_table.add_symbol(type_qn, SymbolEntry(
                    name=typ["name"], kind=typ.get("kind", "typeAlias"),
                    unit_name=unit_name, scope="unit",
                    type_info=typ.get("base_type"), file_path=file_path
                ))

            for const in ast.get("constants", []):
                const_qn = f"{unit_name}.{const['name']}"
                self.symbol_table.add_symbol(const_qn, SymbolEntry(
                    name=const["name"], kind="constant", unit_name=unit_name,
                    scope="unit", type_info=const.get("type"), file_path=file_path
                ))

            for var_info in ast.get("variables", []):
                for name in var_info.get("names", []):
                    var_qn = f"{unit_name}.{name}"
                    self.symbol_table.add_symbol(var_qn, SymbolEntry(
                        name=name, kind="variable", unit_name=unit_name,
                        scope="unit", type_info=var_info.get("type"), file_path=file_path
                    ))

    def _resolve_types(self):
        for qn, entry in self.symbol_table.symbols.items():
            if entry.type_info:
                resolved = self.symbol_table.resolve_type(entry.type_info, entry.unit_name)
                if resolved:
                    entry.resolved_type = resolved

            if entry.parent:
                resolved_parent = self.symbol_table.resolve_type(entry.parent, entry.unit_name)
                if resolved_parent:
                    entry.references.append(resolved_parent)

    def _link_references(self):
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            all_deps = ast.get("uses_interface", []) + ast.get("uses_implementation", [])

            for dep in all_deps:
                if dep in self.symbol_table.symbols:
                    self.reference_links.append({
                        "source": unit_name,
                        "target": dep,
                        "type": "dependency",
                    })

            for cls in ast.get("classes", []):
                cls_qn = f"{unit_name}.{cls['name']}"
                if cls.get("parent"):
                    parent_resolved = self.symbol_table.resolve_type(cls["parent"], unit_name)
                    self.reference_links.append({
                        "source": cls_qn,
                        "target": parent_resolved or cls["parent"],
                        "type": "inheritance",
                    })
                for iface in cls.get("interfaces", []):
                    iface_resolved = self.symbol_table.resolve_type(iface, unit_name)
                    self.reference_links.append({
                        "source": cls_qn,
                        "target": iface_resolved or iface,
                        "type": "implementation",
                    })

    def _analyze_scopes(self):
        for ast in self.parsed_files:
            if "error" in ast:
                continue
            unit_name = ast.get("unit_name", "")
            self.scope_map[unit_name] = {
                "unit_scope": {
                    "types": [cls["name"] for cls in ast.get("classes", [])] +
                             [rec["name"] for rec in ast.get("records", [])] +
                             [iface["name"] for iface in ast.get("interfaces_decl", [])],
                    "routines": [p["name"] for p in ast.get("procedures", [])] +
                                [f["name"] for f in ast.get("functions", [])],
                    "variables": [n for v in ast.get("variables", []) for n in v.get("names", [])],
                    "constants": [c["name"] for c in ast.get("constants", [])],
                },
                "interface_deps": ast.get("uses_interface", []),
                "implementation_deps": ast.get("uses_implementation", []),
                "class_scopes": {}
            }
            for cls in ast.get("classes", []):
                cls_scope = {
                    "visibility_sections": defaultdict(list),
                    "method_count": len(cls.get("methods", [])),
                    "field_count": sum(len(f.get("names", [])) for f in cls.get("fields", [])),
                    "property_count": len(cls.get("properties", [])),
                }
                for method in cls.get("methods", []):
                    vis = method.get("visibility", "public")
                    cls_scope["visibility_sections"][vis].append(method["name"])
                for field in cls.get("fields", []):
                    vis = field.get("visibility", "private")
                    for name in field.get("names", []):
                        cls_scope["visibility_sections"][vis].append(name)
                cls_scope["visibility_sections"] = dict(cls_scope["visibility_sections"])
                self.scope_map[unit_name]["class_scopes"][cls["name"]] = cls_scope


class GraphConstructor:
    def __init__(self, semantic_data: Dict[str, Any], parsed_files: List[Dict[str, Any]]):
        self.symbol_table: SymbolTable = semantic_data["symbol_table"]
        self.reference_links = semantic_data["reference_links"]
        self.scope_map = semantic_data["scope_map"]
        self.parsed_files = parsed_files
        self.triples: List[Dict[str, str]] = []

    def build(self, project_id: str) -> List[Dict[str, str]]:
        self.triples = []
        for ast in self.parsed_files:
            if "error" not in ast:
                self._create_nodes(ast, project_id)
                self._create_edges(ast, project_id)
                self._attach_metadata(ast, project_id)
        return self.triples

    def _create_nodes(self, ast: Dict[str, Any], project_id: str):
        unit_name = ast.get("unit_name", "")
        if not unit_name:
            return
        unit_uri = f"{RDFNamespaces.DELPHI}{unit_name}"

        self._add(unit_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}{ast.get('unit_type', 'unit')}")
        self._add(unit_uri, f"{RDFNamespaces.RDFS}label", unit_name)

        for cls in ast.get("classes", []):
            class_uri = f"{unit_uri}.{cls['name']}"
            self._add(class_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}class")
            self._add(class_uri, f"{RDFNamespaces.RDFS}label", cls["name"])
            for method in cls.get("methods", []):
                method_uri = f"{class_uri}.{method['name']}"
                self._add(method_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}{method.get('kind', 'method')}")
                self._add(method_uri, f"{RDFNamespaces.RDFS}label", method["name"])
            for field in cls.get("fields", []):
                for name in field.get("names", []):
                    field_uri = f"{class_uri}.{name}"
                    self._add(field_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}field")
                    self._add(field_uri, f"{RDFNamespaces.RDFS}label", name)
            for prop in cls.get("properties", []):
                prop_uri = f"{class_uri}.{prop['name']}"
                self._add(prop_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}property")
                self._add(prop_uri, f"{RDFNamespaces.RDFS}label", prop["name"])

        for iface in ast.get("interfaces_decl", []):
            iface_uri = f"{unit_uri}.{iface['name']}"
            self._add(iface_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}interface")
            self._add(iface_uri, f"{RDFNamespaces.RDFS}label", iface["name"])
            for method in iface.get("methods", []):
                method_uri = f"{iface_uri}.{method['name']}"
                self._add(method_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}{method.get('kind', 'procedure')}")

        for rec in ast.get("records", []):
            rec_uri = f"{unit_uri}.{rec['name']}"
            self._add(rec_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}record")
            self._add(rec_uri, f"{RDFNamespaces.RDFS}label", rec["name"])
            for field in rec.get("fields", []):
                for name in field.get("names", []):
                    field_uri = f"{rec_uri}.{name}"
                    self._add(field_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}field")

        for proc in ast.get("procedures", []):
            proc_uri = f"{unit_uri}.{proc['name']}"
            self._add(proc_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}procedure")
            self._add(proc_uri, f"{RDFNamespaces.RDFS}label", proc["name"])

        for func in ast.get("functions", []):
            func_uri = f"{unit_uri}.{func['name']}"
            self._add(func_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}function")
            self._add(func_uri, f"{RDFNamespaces.RDFS}label", func["name"])

        for typ in ast.get("types", []):
            type_uri = f"{unit_uri}.{typ['name']}"
            self._add(type_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}typeAlias")
            self._add(type_uri, f"{RDFNamespaces.RDFS}label", typ["name"])

        for const in ast.get("constants", []):
            const_uri = f"{unit_uri}.{const['name']}"
            self._add(const_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}constant")
            self._add(const_uri, f"{RDFNamespaces.RDFS}label", const["name"])

        for var_info in ast.get("variables", []):
            for name in var_info.get("names", []):
                var_uri = f"{unit_uri}.{name}"
                self._add(var_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}variable")
                self._add(var_uri, f"{RDFNamespaces.RDFS}label", name)

    def _create_edges(self, ast: Dict[str, Any], project_id: str):
        unit_name = ast.get("unit_name", "")
        if not unit_name:
            return
        unit_uri = f"{RDFNamespaces.DELPHI}{unit_name}"

        for dep in ast.get("uses_interface", []):
            dep_uri = f"{RDFNamespaces.DELPHI}{dep}"
            self._add(unit_uri, f"{RDFNamespaces.DEP}uses", dep_uri)
            self._add(unit_uri, f"{RDFNamespaces.DEP}interfaceDependency", dep_uri)
            self._add(dep_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}unit")

        for dep in ast.get("uses_implementation", []):
            dep_uri = f"{RDFNamespaces.DELPHI}{dep}"
            self._add(unit_uri, f"{RDFNamespaces.DEP}uses", dep_uri)
            self._add(unit_uri, f"{RDFNamespaces.DEP}implementationDependency", dep_uri)
            self._add(dep_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}unit")

        for cls in ast.get("classes", []):
            class_uri = f"{unit_uri}.{cls['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", class_uri)

            if cls.get("parent"):
                parent_uri = f"{RDFNamespaces.DELPHI}{cls['parent']}"
                self._add(class_uri, f"{RDFNamespaces.CODE}extends", parent_uri)

            for iface in cls.get("interfaces", []):
                iface_uri = f"{RDFNamespaces.DELPHI}{iface}"
                self._add(class_uri, f"{RDFNamespaces.CODE}implements", iface_uri)

            for method in cls.get("methods", []):
                method_uri = f"{class_uri}.{method['name']}"
                self._add(class_uri, f"{RDFNamespaces.CODE}hasMethod", method_uri)
                for param in method.get("params", []):
                    param_uri = f"{method_uri}.{param['name']}"
                    self._add(param_uri, f"{RDFNamespaces.RDF}type", f"{RDFNamespaces.CODE}parameter")
                    self._add(method_uri, f"{RDFNamespaces.CODE}hasParameter", param_uri)
                    if param.get("type"):
                        self._add(param_uri, f"{RDFNamespaces.CODE}hasType", param["type"])

            for field in cls.get("fields", []):
                for name in field.get("names", []):
                    field_uri = f"{class_uri}.{name}"
                    self._add(class_uri, f"{RDFNamespaces.CODE}hasField", field_uri)
                    if field.get("type"):
                        self._add(field_uri, f"{RDFNamespaces.CODE}hasType", field["type"])
                        resolved = self.symbol_table.resolve_type(field["type"], unit_name)
                        if resolved:
                            self._add(field_uri, f"{RDFNamespaces.REF}referencesType", f"{RDFNamespaces.DELPHI}{resolved}")

            for prop in cls.get("properties", []):
                prop_uri = f"{class_uri}.{prop['name']}"
                self._add(class_uri, f"{RDFNamespaces.CODE}hasProperty", prop_uri)
                if prop.get("type"):
                    self._add(prop_uri, f"{RDFNamespaces.CODE}hasType", prop["type"])
                if prop.get("read"):
                    self._add(prop_uri, f"{RDFNamespaces.CODE}readAccessor", prop["read"])
                if prop.get("write"):
                    self._add(prop_uri, f"{RDFNamespaces.CODE}writeAccessor", prop["write"])

        for iface in ast.get("interfaces_decl", []):
            iface_uri = f"{unit_uri}.{iface['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", iface_uri)
            if iface.get("parent"):
                self._add(iface_uri, f"{RDFNamespaces.CODE}extends", f"{RDFNamespaces.DELPHI}{iface['parent']}")
            if iface.get("guid"):
                self._add(iface_uri, f"{RDFNamespaces.CODE}guid", iface["guid"])
            for method in iface.get("methods", []):
                method_uri = f"{iface_uri}.{method['name']}"
                self._add(iface_uri, f"{RDFNamespaces.CODE}hasMethod", method_uri)

        for rec in ast.get("records", []):
            rec_uri = f"{unit_uri}.{rec['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", rec_uri)
            for field in rec.get("fields", []):
                for name in field.get("names", []):
                    field_uri = f"{rec_uri}.{name}"
                    self._add(rec_uri, f"{RDFNamespaces.CODE}hasField", field_uri)
                    if field.get("type"):
                        self._add(field_uri, f"{RDFNamespaces.CODE}hasType", field["type"])

        for proc in ast.get("procedures", []):
            proc_uri = f"{unit_uri}.{proc['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", proc_uri)
            if proc.get("return_type"):
                self._add(proc_uri, f"{RDFNamespaces.CODE}returnType", proc["return_type"])

        for func in ast.get("functions", []):
            func_uri = f"{unit_uri}.{func['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", func_uri)
            if func.get("return_type"):
                self._add(func_uri, f"{RDFNamespaces.CODE}returnType", func["return_type"])

        for typ in ast.get("types", []):
            type_uri = f"{unit_uri}.{typ['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", type_uri)

        for const in ast.get("constants", []):
            const_uri = f"{unit_uri}.{const['name']}"
            self._add(unit_uri, f"{RDFNamespaces.CODE}declares", const_uri)

        for var_info in ast.get("variables", []):
            for name in var_info.get("names", []):
                var_uri = f"{unit_uri}.{name}"
                self._add(unit_uri, f"{RDFNamespaces.CODE}declares", var_uri)
                if var_info.get("type"):
                    self._add(var_uri, f"{RDFNamespaces.CODE}hasType", var_info["type"])

    def _attach_metadata(self, ast: Dict[str, Any], project_id: str):
        unit_name = ast.get("unit_name", "")
        if not unit_name:
            return
        unit_uri = f"{RDFNamespaces.DELPHI}{unit_name}"

        self._add(unit_uri, f"{RDFNamespaces.CODE}filePath", ast.get("file_path", ""))
        if ast.get("line_count"):
            self._add(unit_uri, f"{RDFNamespaces.CODE}lineCount", str(ast["line_count"]))

        for directive in ast.get("directives", []):
            self._add(unit_uri, f"{RDFNamespaces.CODE}hasDirective", directive)

        for cls in ast.get("classes", []):
            class_uri = f"{unit_uri}.{cls['name']}"
            if cls.get("line"):
                self._add(class_uri, f"{RDFNamespaces.CODE}lineNumber", str(cls["line"]))
            if cls.get("abstract"):
                self._add(class_uri, f"{RDFNamespaces.CODE}isAbstract", "true")
            if cls.get("sealed"):
                self._add(class_uri, f"{RDFNamespaces.CODE}isSealed", "true")
            if cls.get("forward"):
                self._add(class_uri, f"{RDFNamespaces.CODE}isForward", "true")
            for method in cls.get("methods", []):
                method_uri = f"{class_uri}.{method['name']}"
                if method.get("visibility"):
                    self._add(method_uri, f"{RDFNamespaces.CODE}visibility", method["visibility"])
                if method.get("return_type"):
                    self._add(method_uri, f"{RDFNamespaces.CODE}returnType", method["return_type"])
                for directive in method.get("directives", []):
                    self._add(method_uri, f"{RDFNamespaces.CODE}hasDirective", directive)
                if method.get("class_method"):
                    self._add(method_uri, f"{RDFNamespaces.CODE}isClassMethod", "true")
            for field in cls.get("fields", []):
                for name in field.get("names", []):
                    field_uri = f"{class_uri}.{name}"
                    if field.get("visibility"):
                        self._add(field_uri, f"{RDFNamespaces.CODE}visibility", field["visibility"])
            for prop in cls.get("properties", []):
                prop_uri = f"{class_uri}.{prop['name']}"
                if prop.get("visibility"):
                    self._add(prop_uri, f"{RDFNamespaces.CODE}visibility", prop["visibility"])

        scope_info = self.scope_map.get(unit_name, {})
        if scope_info:
            unit_scope = scope_info.get("unit_scope", {})
            self._add(unit_uri, f"{RDFNamespaces.SCOPE}typeCount", str(len(unit_scope.get("types", []))))
            self._add(unit_uri, f"{RDFNamespaces.SCOPE}routineCount", str(len(unit_scope.get("routines", []))))
            self._add(unit_uri, f"{RDFNamespaces.SCOPE}interfaceDepCount", str(len(scope_info.get("interface_deps", []))))
            self._add(unit_uri, f"{RDFNamespaces.SCOPE}implementationDepCount", str(len(scope_info.get("implementation_deps", []))))

    def _add(self, subject: str, predicate: str, obj: str):
        self.triples.append({
            "subject": subject,
            "predicate": predicate,
            "object": obj
        })


def run_semantic_analysis(parsed_files: List[Dict[str, Any]], project_id: str) -> Dict[str, Any]:
    analyzer = SemanticAnalyzer(parsed_files)
    semantic_data = analyzer.analyze()

    constructor = GraphConstructor(semantic_data, parsed_files)
    triples = constructor.build(project_id)

    symbol_count = len(semantic_data["symbol_table"].symbols)
    ref_count = len(semantic_data["reference_links"])
    scope_count = len(semantic_data["scope_map"])

    return {
        "triples": triples,
        "semantic_data": semantic_data,
        "stats": {
            "symbols_resolved": symbol_count,
            "references_linked": ref_count,
            "scopes_analyzed": scope_count,
            "triples_generated": len(triples),
        }
    }


def build_graph(parsed_files: List[Dict[str, Any]], project_id: str) -> List[Dict[str, str]]:
    result = run_semantic_analysis(parsed_files, project_id)
    return result["triples"]


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: semantic_agent.py <parsed_json_file> [project_id]"}))
        sys.exit(1)

    parsed_file = sys.argv[1]
    project_id = sys.argv[2] if len(sys.argv) > 2 else "default"

    with open(parsed_file, 'r') as f:
        parsed_data = json.load(f)

    if isinstance(parsed_data, list):
        result = run_semantic_analysis(parsed_data, project_id)
    else:
        result = run_semantic_analysis([parsed_data], project_id)

    print(json.dumps({
        "triples": result["triples"],
        "stats": result["stats"]
    }))
