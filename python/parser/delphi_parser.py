#!/usr/bin/env python3
"""
Delphi Legacy Code Analyser - Step 1: Parsing Agent
Performs Lexical Analysis and Syntax Tree Generation on Delphi/Object Pascal source files.
Uses DelphiAST (compiled with Free Pascal) when available, falls back to built-in parser.
Extracts units, classes, methods, properties, uses clauses, type definitions, etc.
"""

import re
import json
import sys
import os
import subprocess
import xml.etree.ElementTree as ET
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple


DELPHIAST_BINARY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "delphiast_cli")

PARSER_LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs", "parser")
os.makedirs(PARSER_LOG_DIR, exist_ok=True)

_parser_loggers: Dict[str, logging.Logger] = {}

def _get_parser_logger(project_id: str = "default") -> logging.Logger:
    global _parser_loggers
    if project_id in _parser_loggers:
        return _parser_loggers[project_id]
    logger = logging.getLogger(f"delphi_parser_{project_id}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(PARSER_LOG_DIR, f"parser_{project_id}_{timestamp}.log")
    fh = logging.FileHandler(log_file, encoding='utf-8')
    fh.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s | %(levelname)-7s | %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    logger.info(f"Parser log started for project: {project_id}")
    logger.info(f"Log file: {log_file}")
    logger.info(f"DelphiAST binary: {DELPHIAST_BINARY} (exists: {os.path.isfile(DELPHIAST_BINARY)})")
    _parser_loggers[project_id] = logger
    return logger


def _try_delphiast(file_path: str, logger: Optional[logging.Logger] = None) -> Optional[Dict[str, Any]]:
    if not os.path.isfile(DELPHIAST_BINARY):
        if logger:
            logger.warning(f"SKIP DelphiAST | {file_path} | Binary not found at {DELPHIAST_BINARY}")
        return None
    start = time.time()
    try:
        result = subprocess.run(
            [DELPHIAST_BINARY, file_path],
            capture_output=True, text=True, timeout=30
        )
        elapsed = time.time() - start
        if result.returncode != 0:
            stderr_msg = result.stderr.strip()[:500] if result.stderr else "(no stderr)"
            if logger:
                logger.warning(f"FAIL DelphiAST | {file_path} | returncode={result.returncode} | {elapsed:.2f}s | stderr: {stderr_msg}")
            return None
        xml_output = result.stdout.strip()
        if not xml_output or not xml_output.startswith('<'):
            if logger:
                logger.warning(f"FAIL DelphiAST | {file_path} | Invalid XML output | {elapsed:.2f}s | stdout[:200]: {(xml_output or '')[:200]}")
            return None
        parsed = _parse_delphiast_xml(xml_output, file_path)
        if logger:
            logger.info(f"OK   DelphiAST | {file_path} | {elapsed:.2f}s | unit={parsed.get('unit_name', '?')} classes={len(parsed.get('classes', []))} uses={len(parsed.get('uses_interface', []))}")
        return parsed
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start
        if logger:
            logger.error(f"TIMEOUT DelphiAST | {file_path} | {elapsed:.2f}s | Killed after 30s timeout")
        return None
    except Exception as e:
        elapsed = time.time() - start
        if logger:
            logger.error(f"ERROR DelphiAST | {file_path} | {elapsed:.2f}s | {type(e).__name__}: {str(e)[:300]}")
        return None


def _parse_delphiast_xml(xml_str: str, file_path: str) -> Dict[str, Any]:
    root = ET.fromstring(xml_str)
    ast = {
        "file_path": file_path,
        "unit_name": "",
        "unit_type": "unknown",
        "uses_interface": [],
        "uses_implementation": [],
        "types": [],
        "classes": [],
        "records": [],
        "interfaces_decl": [],
        "procedures": [],
        "functions": [],
        "variables": [],
        "constants": [],
        "form_type": None,
        "directives": [],
        "parser": "delphiast",
    }

    unit_node = root.find(".//UNIT") or root.find(".//PROGRAM") or root.find(".//LIBRARY")
    if unit_node is not None:
        ast["unit_name"] = unit_node.get("name", "")
        ast["unit_type"] = unit_node.tag.lower()

    for uses_node in root.findall(".//USES"):
        section = uses_node.get("section", "interface")
        for unit in uses_node.findall("UNIT"):
            name = unit.get("name", "")
            if name:
                if section == "implementation":
                    ast["uses_implementation"].append(name)
                else:
                    ast["uses_interface"].append(name)

    for type_node in root.findall(".//TYPE"):
        for child in type_node:
            if child.tag == "CLASS":
                cls = _parse_xml_class(child)
                if cls:
                    ast["classes"].append(cls)
            elif child.tag == "RECORD":
                rec = _parse_xml_record(child)
                if rec:
                    ast["records"].append(rec)
            elif child.tag == "INTERFACE":
                iface = _parse_xml_interface(child)
                if iface:
                    ast["interfaces_decl"].append(iface)

    return ast


def _parse_xml_class(node) -> Optional[Dict[str, Any]]:
    name = node.get("name", "")
    if not name:
        return None
    cls = {
        "name": name,
        "parent": node.get("parent"),
        "interfaces": [],
        "fields": [],
        "methods": [],
        "properties": [],
        "line": int(node.get("line", 0)),
    }
    for method in node.findall(".//METHOD"):
        m = {
            "name": method.get("name", ""),
            "kind": method.get("kind", "procedure"),
            "visibility": method.get("visibility", "public"),
        }
        cls["methods"].append(m)
    for field in node.findall(".//FIELD"):
        f = {
            "names": [field.get("name", "")],
            "type": field.get("type", ""),
            "visibility": field.get("visibility", "public"),
        }
        cls["fields"].append(f)
    for prop in node.findall(".//PROPERTY"):
        p = {
            "name": prop.get("name", ""),
            "type": prop.get("type", ""),
            "visibility": prop.get("visibility", "public"),
        }
        cls["properties"].append(p)
    return cls


def _parse_xml_record(node) -> Optional[Dict[str, Any]]:
    name = node.get("name", "")
    if not name:
        return None
    return {
        "name": name,
        "fields": [{"names": [f.get("name", "")], "type": f.get("type", "")} for f in node.findall(".//FIELD")],
        "methods": [],
        "line": int(node.get("line", 0)),
    }


def _parse_xml_interface(node) -> Optional[Dict[str, Any]]:
    name = node.get("name", "")
    if not name:
        return None
    return {
        "name": name,
        "parent": node.get("parent"),
        "guid": node.get("guid"),
        "methods": [{"name": m.get("name", ""), "kind": m.get("kind", "procedure")} for m in node.findall(".//METHOD")],
        "properties": [],
        "line": int(node.get("line", 0)),
    }


class DelphiToken:
    def __init__(self, token_type: str, value: str, line: int, col: int):
        self.token_type = token_type
        self.value = value
        self.line = line
        self.col = col

    def to_dict(self):
        return {
            "type": self.token_type,
            "value": self.value,
            "line": self.line,
            "col": self.col
        }


class DelphiLexer:
    KEYWORDS = {
        'unit', 'program', 'library', 'package',
        'interface', 'implementation', 'initialization', 'finalization',
        'uses', 'type', 'var', 'const', 'resourcestring', 'threadvar',
        'class', 'object', 'record', 'interface', 'dispinterface',
        'procedure', 'function', 'constructor', 'destructor',
        'property', 'index', 'read', 'write', 'default', 'stored', 'nodefault',
        'public', 'private', 'protected', 'published', 'strict',
        'virtual', 'override', 'abstract', 'dynamic', 'reintroduce',
        'overload', 'cdecl', 'stdcall', 'safecall', 'pascal', 'register',
        'external', 'forward', 'inline', 'assembler',
        'if', 'then', 'else', 'case', 'of',
        'for', 'to', 'downto', 'do', 'while', 'repeat', 'until',
        'with', 'try', 'except', 'finally', 'raise', 'on',
        'begin', 'end',
        'and', 'or', 'not', 'xor', 'shl', 'shr', 'div', 'mod', 'in', 'is', 'as',
        'nil', 'true', 'false', 'self', 'inherited',
        'array', 'set', 'file', 'string', 'packed',
        'absolute', 'label', 'goto', 'exports',
    }

    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1
        self.col = 1
        self.tokens: List[DelphiToken] = []

    def tokenize(self) -> List[DelphiToken]:
        while self.pos < len(self.source):
            self._skip_whitespace()
            if self.pos >= len(self.source):
                break

            ch = self.source[self.pos]

            if ch == '{':
                self._skip_brace_comment()
            elif ch == '(' and self.pos + 1 < len(self.source) and self.source[self.pos + 1] == '*':
                self._skip_paren_comment()
            elif ch == '/' and self.pos + 1 < len(self.source) and self.source[self.pos + 1] == '/':
                self._skip_line_comment()
            elif ch == "'":
                self._read_string()
            elif ch == '#':
                self._read_char_literal()
            elif ch.isalpha() or ch == '_':
                self._read_identifier()
            elif ch.isdigit() or (ch == '$' and self.pos + 1 < len(self.source) and self.source[self.pos + 1] in '0123456789abcdefABCDEF'):
                self._read_number()
            elif ch in '.,:;()[]@^=<>+-*/':
                self._read_symbol()
            else:
                self.pos += 1
                self.col += 1

        return self.tokens

    def _skip_whitespace(self):
        while self.pos < len(self.source) and self.source[self.pos] in ' \t\r\n':
            if self.source[self.pos] == '\n':
                self.line += 1
                self.col = 1
            else:
                self.col += 1
            self.pos += 1

    def _skip_brace_comment(self):
        if self.pos < len(self.source) and self.source[self.pos] == '{':
            if self.pos + 1 < len(self.source) and self.source[self.pos + 1] == '$':
                end = self.source.find('}', self.pos)
                if end == -1:
                    end = len(self.source) - 1
                directive = self.source[self.pos:end + 1]
                self.tokens.append(DelphiToken('DIRECTIVE', directive, self.line, self.col))
                for ch in directive:
                    if ch == '\n':
                        self.line += 1
                        self.col = 1
                    else:
                        self.col += 1
                self.pos = end + 1
                return

            depth = 1
            self.pos += 1
            self.col += 1
            while self.pos < len(self.source) and depth > 0:
                if self.source[self.pos] == '{':
                    depth += 1
                elif self.source[self.pos] == '}':
                    depth -= 1
                if self.source[self.pos] == '\n':
                    self.line += 1
                    self.col = 1
                else:
                    self.col += 1
                self.pos += 1

    def _skip_paren_comment(self):
        self.pos += 2
        self.col += 2
        while self.pos + 1 < len(self.source):
            if self.source[self.pos] == '*' and self.source[self.pos + 1] == ')':
                self.pos += 2
                self.col += 2
                return
            if self.source[self.pos] == '\n':
                self.line += 1
                self.col = 1
            else:
                self.col += 1
            self.pos += 1
        self.pos = len(self.source)

    def _skip_line_comment(self):
        while self.pos < len(self.source) and self.source[self.pos] != '\n':
            self.pos += 1
            self.col += 1

    def _read_string(self):
        start_line = self.line
        start_col = self.col
        result = ""
        self.pos += 1
        self.col += 1
        while self.pos < len(self.source):
            if self.source[self.pos] == "'":
                self.pos += 1
                self.col += 1
                if self.pos < len(self.source) and self.source[self.pos] == "'":
                    result += "'"
                    self.pos += 1
                    self.col += 1
                else:
                    break
            else:
                if self.source[self.pos] == '\n':
                    self.line += 1
                    self.col = 1
                else:
                    self.col += 1
                result += self.source[self.pos]
                self.pos += 1
        self.tokens.append(DelphiToken('STRING', result, start_line, start_col))

    def _read_char_literal(self):
        start_line = self.line
        start_col = self.col
        self.pos += 1
        self.col += 1
        num = ""
        while self.pos < len(self.source) and self.source[self.pos].isdigit():
            num += self.source[self.pos]
            self.pos += 1
            self.col += 1
        self.tokens.append(DelphiToken('CHAR', num, start_line, start_col))

    def _read_identifier(self):
        start_line = self.line
        start_col = self.col
        start = self.pos
        while self.pos < len(self.source) and (self.source[self.pos].isalnum() or self.source[self.pos] == '_'):
            self.pos += 1
            self.col += 1
        word = self.source[start:self.pos]
        if word.lower() in self.KEYWORDS:
            self.tokens.append(DelphiToken('KEYWORD', word.lower(), start_line, start_col))
        else:
            self.tokens.append(DelphiToken('IDENT', word, start_line, start_col))

    def _read_number(self):
        start_line = self.line
        start_col = self.col
        start = self.pos
        if self.source[self.pos] == '$':
            self.pos += 1
            self.col += 1
            while self.pos < len(self.source) and self.source[self.pos] in '0123456789abcdefABCDEF':
                self.pos += 1
                self.col += 1
        else:
            while self.pos < len(self.source) and self.source[self.pos].isdigit():
                self.pos += 1
                self.col += 1
            if self.pos < len(self.source) and self.source[self.pos] == '.':
                self.pos += 1
                self.col += 1
                while self.pos < len(self.source) and self.source[self.pos].isdigit():
                    self.pos += 1
                    self.col += 1
        self.tokens.append(DelphiToken('NUMBER', self.source[start:self.pos], start_line, start_col))

    def _read_symbol(self):
        start_line = self.line
        start_col = self.col
        ch = self.source[self.pos]
        two_char = self.source[self.pos:self.pos + 2] if self.pos + 1 < len(self.source) else ""

        if two_char in (':=', '<=', '>=', '<>', '..', '(*', '*)'):
            self.tokens.append(DelphiToken('SYMBOL', two_char, start_line, start_col))
            self.pos += 2
            self.col += 2
        else:
            self.tokens.append(DelphiToken('SYMBOL', ch, start_line, start_col))
            self.pos += 1
            self.col += 1


class DelphiParser:
    def __init__(self, tokens: List[DelphiToken], file_path: str = ""):
        self.tokens = tokens
        self.pos = 0
        self.file_path = file_path
        self.ast: Dict[str, Any] = {
            "file_path": file_path,
            "unit_name": "",
            "unit_type": "unknown",
            "uses_interface": [],
            "uses_implementation": [],
            "types": [],
            "classes": [],
            "records": [],
            "interfaces_decl": [],
            "procedures": [],
            "functions": [],
            "variables": [],
            "constants": [],
            "form_type": None,
            "directives": [],
            "parser": "builtin",
        }

    def current(self) -> Optional[DelphiToken]:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def peek(self, offset: int = 1) -> Optional[DelphiToken]:
        idx = self.pos + offset
        if idx < len(self.tokens):
            return self.tokens[idx]
        return None

    def advance(self) -> Optional[DelphiToken]:
        token = self.current()
        self.pos += 1
        return token

    def expect_keyword(self, kw: str) -> bool:
        t = self.current()
        if t and t.token_type == 'KEYWORD' and t.value == kw:
            self.advance()
            return True
        return False

    def expect_symbol(self, sym: str) -> bool:
        t = self.current()
        if t and t.token_type == 'SYMBOL' and t.value == sym:
            self.advance()
            return True
        return False

    def read_ident(self) -> Optional[str]:
        t = self.current()
        if t and t.token_type == 'IDENT':
            self.advance()
            return t.value
        return None

    def parse(self) -> Dict[str, Any]:
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break

            if t.token_type == 'DIRECTIVE':
                self.ast["directives"].append(t.value)
                self.advance()
            elif t.token_type == 'KEYWORD':
                if t.value == 'unit':
                    self._parse_unit_header()
                elif t.value == 'program':
                    self._parse_program_header()
                elif t.value == 'library':
                    self._parse_library_header()
                elif t.value == 'uses':
                    self._parse_uses()
                elif t.value == 'type':
                    self._parse_type_section()
                elif t.value in ('procedure', 'function'):
                    self._parse_routine_decl()
                elif t.value == 'var':
                    self._parse_var_section()
                elif t.value == 'const':
                    self._parse_const_section()
                elif t.value in ('interface', 'implementation', 'initialization', 'finalization'):
                    self.advance()
                elif t.value == 'begin':
                    self._skip_block()
                else:
                    self.advance()
            else:
                self.advance()

        return self.ast

    def _parse_unit_header(self):
        self.advance()
        name = self.read_ident()
        if name:
            self.ast["unit_name"] = name
            self.ast["unit_type"] = "unit"
        self._skip_to_semicolon()

    def _parse_program_header(self):
        self.advance()
        name = self.read_ident()
        if name:
            self.ast["unit_name"] = name
            self.ast["unit_type"] = "program"
        self._skip_to_semicolon()

    def _parse_library_header(self):
        self.advance()
        name = self.read_ident()
        if name:
            self.ast["unit_name"] = name
            self.ast["unit_type"] = "library"
        self._skip_to_semicolon()

    def _parse_uses(self):
        self.advance()
        in_implementation = any(
            t.token_type == 'KEYWORD' and t.value == 'implementation'
            for t in self.tokens[:self.pos]
        )
        units = []
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'IDENT':
                unit_name = t.value
                self.advance()
                if self.current() and self.current().token_type == 'SYMBOL' and self.current().value == '.':
                    self.advance()
                    next_ident = self.read_ident()
                    if next_ident:
                        unit_name += '.' + next_ident
                units.append(unit_name)
            elif t.token_type == 'KEYWORD' and t.value == 'in':
                self.advance()
                if self.current() and self.current().token_type == 'STRING':
                    self.advance()
            elif t.token_type == 'SYMBOL' and t.value == ',':
                self.advance()
            elif t.token_type == 'SYMBOL' and t.value == ';':
                self.advance()
                break
            else:
                break

        if in_implementation:
            self.ast["uses_implementation"].extend(units)
        else:
            self.ast["uses_interface"].extend(units)

    def _parse_type_section(self):
        self.advance()
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value in (
                'var', 'const', 'procedure', 'function', 'implementation',
                'initialization', 'finalization', 'begin', 'type',
                'resourcestring', 'threadvar', 'uses'
            ):
                if t.value == 'type':
                    self.advance()
                    continue
                break

            if t.token_type == 'IDENT':
                type_name = t.value
                self.advance()
                if self.expect_symbol('='):
                    self._parse_type_definition(type_name)
                else:
                    self._skip_to_semicolon()
            else:
                self.advance()

    def _parse_type_definition(self, type_name: str):
        t = self.current()
        if not t:
            return

        if t.token_type == 'KEYWORD' and t.value == 'class':
            self._parse_class(type_name)
        elif t.token_type == 'KEYWORD' and t.value == 'record':
            self._parse_record(type_name)
        elif t.token_type == 'KEYWORD' and t.value == 'interface':
            self._parse_interface_decl(type_name)
        elif t.token_type == 'KEYWORD' and t.value in ('procedure', 'function'):
            self.ast["types"].append({
                "name": type_name,
                "kind": "procedural_type",
                "line": t.line
            })
            self._skip_to_semicolon()
        else:
            type_def = {"name": type_name, "kind": "alias", "line": t.line}
            base = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ';'):
                    self.advance()
                    break
                base.append(c.value)
                self.advance()
            type_def["base_type"] = ' '.join(base)
            self.ast["types"].append(type_def)

    def _parse_class(self, class_name: str):
        self.advance()
        class_info: Dict[str, Any] = {
            "name": class_name,
            "parent": None,
            "interfaces": [],
            "fields": [],
            "methods": [],
            "properties": [],
            "visibility": "public",
            "line": self.tokens[self.pos - 1].line if self.pos > 0 else 0,
        }

        t = self.current()
        if t and t.token_type == 'SYMBOL' and t.value == ';':
            class_info["forward"] = True
            self.advance()
            self.ast["classes"].append(class_info)
            return

        if t and t.token_type == 'SYMBOL' and t.value == '(':
            self.advance()
            parents = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ')'):
                    self.advance()
                    break
                if c.token_type == 'IDENT':
                    parents.append(c.value)
                self.advance()
            if parents:
                class_info["parent"] = parents[0]
                class_info["interfaces"] = parents[1:]

        if t and t.token_type == 'KEYWORD' and t.value == 'abstract':
            class_info["abstract"] = True
            self.advance()

        if t and t.token_type == 'KEYWORD' and t.value == 'sealed':
            class_info["sealed"] = True
            self.advance()

        current_visibility = "published"
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break

            if t.token_type == 'KEYWORD' and t.value == 'end':
                self.advance()
                self.expect_symbol(';')
                break

            if t.token_type == 'KEYWORD' and t.value in ('public', 'private', 'protected', 'published'):
                current_visibility = t.value
                self.advance()
                continue

            if t.token_type == 'KEYWORD' and t.value == 'strict':
                self.advance()
                if self.current() and self.current().value in ('private', 'protected'):
                    current_visibility = 'strict ' + self.current().value
                    self.advance()
                continue

            if t.token_type == 'KEYWORD' and t.value in ('procedure', 'function', 'constructor', 'destructor'):
                method = self._parse_method_decl(t.value)
                if method:
                    method["visibility"] = current_visibility
                    class_info["methods"].append(method)
            elif t.token_type == 'KEYWORD' and t.value == 'property':
                prop = self._parse_property()
                if prop:
                    prop["visibility"] = current_visibility
                    class_info["properties"].append(prop)
            elif t.token_type == 'KEYWORD' and t.value == 'class':
                self.advance()
                if self.current() and self.current().value in ('procedure', 'function', 'var', 'property'):
                    if self.current().value in ('procedure', 'function'):
                        method = self._parse_method_decl(self.current().value)
                        if method:
                            method["visibility"] = current_visibility
                            method["class_method"] = True
                            class_info["methods"].append(method)
                    else:
                        self.advance()
                        self._skip_to_semicolon()
                continue
            elif t.token_type == 'IDENT':
                field = self._parse_field()
                if field:
                    field["visibility"] = current_visibility
                    class_info["fields"].append(field)
            elif t.token_type == 'SYMBOL' and t.value == '[':
                self._skip_brackets()
                self._skip_to_semicolon()
            else:
                self.advance()

        if class_name.startswith('TForm') or class_name.startswith('TFrame') or class_name.startswith('TDataModule'):
            self.ast["form_type"] = class_name

        self.ast["classes"].append(class_info)

    def _parse_record(self, record_name: str):
        self.advance()
        record_info: Dict[str, Any] = {
            "name": record_name,
            "fields": [],
            "methods": [],
            "line": self.tokens[self.pos - 1].line if self.pos > 0 else 0,
        }

        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value == 'end':
                self.advance()
                self.expect_symbol(';')
                break
            if t.token_type == 'KEYWORD' and t.value in ('procedure', 'function'):
                method = self._parse_method_decl(t.value)
                if method:
                    record_info["methods"].append(method)
            elif t.token_type == 'KEYWORD' and t.value == 'case':
                self._skip_to_end_or_semicolon()
                break
            elif t.token_type == 'IDENT':
                field = self._parse_field()
                if field:
                    record_info["fields"].append(field)
            else:
                self.advance()

        self.ast["records"].append(record_info)

    def _parse_interface_decl(self, iface_name: str):
        self.advance()
        iface_info: Dict[str, Any] = {
            "name": iface_name,
            "parent": None,
            "guid": None,
            "methods": [],
            "properties": [],
            "line": self.tokens[self.pos - 1].line if self.pos > 0 else 0,
        }

        t = self.current()
        if t and t.token_type == 'SYMBOL' and t.value == ';':
            iface_info["forward"] = True
            self.advance()
            self.ast["interfaces_decl"].append(iface_info)
            return

        if t and t.token_type == 'SYMBOL' and t.value == '(':
            self.advance()
            parent = self.read_ident()
            if parent:
                iface_info["parent"] = parent
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ')'):
                    self.advance()
                    break
                self.advance()

        t = self.current()
        if t and t.token_type == 'SYMBOL' and t.value == '[':
            self.advance()
            guid_parts = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ']'):
                    self.advance()
                    break
                guid_parts.append(c.value)
                self.advance()
            iface_info["guid"] = ''.join(guid_parts)

        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value == 'end':
                self.advance()
                self.expect_symbol(';')
                break
            if t.token_type == 'KEYWORD' and t.value in ('procedure', 'function'):
                method = self._parse_method_decl(t.value)
                if method:
                    iface_info["methods"].append(method)
            elif t.token_type == 'KEYWORD' and t.value == 'property':
                prop = self._parse_property()
                if prop:
                    iface_info["properties"].append(prop)
            else:
                self.advance()

        self.ast["interfaces_decl"].append(iface_info)

    def _parse_method_decl(self, kind: str) -> Optional[Dict[str, Any]]:
        self.advance()
        name = self.read_ident()
        if not name:
            self._skip_to_semicolon()
            return None

        method: Dict[str, Any] = {
            "name": name,
            "kind": kind,
            "params": [],
            "return_type": None,
            "directives": [],
        }

        if self.current() and self.current().value == '.':
            self.advance()
            actual_name = self.read_ident()
            if actual_name:
                method["class_qualifier"] = name
                method["name"] = actual_name

        if self.current() and self.current().value == '(':
            method["params"] = self._parse_params()

        if self.current() and self.current().value == ':':
            self.advance()
            return_type = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ';'):
                    break
                if c.token_type == 'KEYWORD' and c.value in ('virtual', 'override', 'abstract', 'dynamic',
                                                               'reintroduce', 'overload', 'cdecl', 'stdcall',
                                                               'safecall', 'inline', 'static'):
                    break
                return_type.append(c.value)
                self.advance()
            method["return_type"] = ' '.join(return_type)

        self._skip_to_semicolon()

        while self.pos < len(self.tokens):
            c = self.current()
            if not c:
                break
            if c.token_type == 'KEYWORD' and c.value in ('virtual', 'override', 'abstract', 'dynamic',
                                                          'reintroduce', 'overload', 'cdecl', 'stdcall',
                                                          'safecall', 'inline', 'static', 'external',
                                                          'forward', 'assembler'):
                method["directives"].append(c.value)
                self.advance()
                self._skip_to_semicolon()
            else:
                break

        return method

    def _parse_params(self) -> List[Dict[str, Any]]:
        params = []
        self.advance()
        while self.pos < len(self.tokens):
            t = self.current()
            if not t or (t.token_type == 'SYMBOL' and t.value == ')'):
                self.advance()
                break

            modifier = None
            if t.token_type == 'KEYWORD' and t.value in ('var', 'const', 'out'):
                modifier = t.value
                self.advance()

            names = []
            while self.pos < len(self.tokens):
                name = self.read_ident()
                if name:
                    names.append(name)
                if self.current() and self.current().value == ',':
                    self.advance()
                else:
                    break

            param_type = None
            if self.current() and self.current().value == ':':
                self.advance()
                type_parts = []
                while self.pos < len(self.tokens):
                    c = self.current()
                    if not c or c.value in (';', ')'):
                        break
                    type_parts.append(c.value)
                    self.advance()
                param_type = ' '.join(type_parts)

            for name in names:
                param = {"name": name, "type": param_type}
                if modifier:
                    param["modifier"] = modifier
                params.append(param)

            if self.current() and self.current().value == ';':
                self.advance()
            elif self.current() and self.current().value == ')':
                continue
            else:
                break

        return params

    def _parse_property(self) -> Optional[Dict[str, Any]]:
        self.advance()
        name = self.read_ident()
        if not name:
            self._skip_to_semicolon()
            return None

        prop: Dict[str, Any] = {
            "name": name,
            "type": None,
            "read": None,
            "write": None,
        }

        if self.current() and self.current().value == '[':
            self._skip_brackets()

        if self.current() and self.current().value == ':':
            self.advance()
            type_parts = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or c.value in (';', 'read', 'write', 'default', 'stored', 'nodefault'):
                    break
                type_parts.append(c.value)
                self.advance()
            prop["type"] = ' '.join(type_parts)

        while self.pos < len(self.tokens):
            c = self.current()
            if not c or (c.token_type == 'SYMBOL' and c.value == ';'):
                self.advance()
                break
            if c.token_type == 'KEYWORD' and c.value == 'read':
                self.advance()
                prop["read"] = self.read_ident()
            elif c.token_type == 'KEYWORD' and c.value == 'write':
                self.advance()
                prop["write"] = self.read_ident()
            elif c.token_type == 'KEYWORD' and c.value == 'default':
                self.advance()
                while self.pos < len(self.tokens):
                    cc = self.current()
                    if not cc or cc.value == ';':
                        break
                    self.advance()
            else:
                self.advance()

        while self.pos < len(self.tokens):
            c = self.current()
            if c and c.token_type == 'KEYWORD' and c.value == 'default':
                self.advance()
                self._skip_to_semicolon()
            else:
                break

        return prop

    def _parse_field(self) -> Optional[Dict[str, Any]]:
        names = []
        while self.pos < len(self.tokens):
            name = self.read_ident()
            if name:
                names.append(name)
            if self.current() and self.current().value == ',':
                self.advance()
            else:
                break

        if not names:
            self._skip_to_semicolon()
            return None

        field: Dict[str, Any] = {"names": names, "type": None}

        if self.current() and self.current().value == ':':
            self.advance()
            type_parts = []
            while self.pos < len(self.tokens):
                c = self.current()
                if not c or (c.token_type == 'SYMBOL' and c.value == ';'):
                    self.advance()
                    break
                type_parts.append(c.value)
                self.advance()
            field["type"] = ' '.join(type_parts)
        else:
            self._skip_to_semicolon()

        return field

    def _parse_routine_decl(self):
        t = self.current()
        if not t:
            return

        kind = t.value
        method = self._parse_method_decl(kind)
        if method:
            if method.get("class_qualifier"):
                return

            if kind == 'procedure':
                self.ast["procedures"].append(method)
            elif kind == 'function':
                self.ast["functions"].append(method)

        if self.current() and self.current().value == 'begin':
            self._skip_block()

    def _parse_var_section(self):
        self.advance()
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value in (
                'type', 'const', 'procedure', 'function', 'begin',
                'implementation', 'initialization', 'finalization',
                'var', 'resourcestring', 'threadvar', 'uses'
            ):
                if t.value == 'var':
                    self.advance()
                    continue
                break

            if t.token_type == 'IDENT':
                field = self._parse_field()
                if field:
                    self.ast["variables"].append(field)
            else:
                self.advance()

    def _parse_const_section(self):
        self.advance()
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value in (
                'type', 'var', 'procedure', 'function', 'begin',
                'implementation', 'initialization', 'finalization',
                'const', 'resourcestring', 'threadvar', 'uses'
            ):
                if t.value == 'const':
                    self.advance()
                    continue
                break

            if t.token_type == 'IDENT':
                const_name = t.value
                self.advance()
                const_info: Dict[str, Any] = {"name": const_name, "type": None, "value": None}
                if self.current() and self.current().value == ':':
                    self.advance()
                    type_parts = []
                    while self.pos < len(self.tokens):
                        c = self.current()
                        if not c or c.value == '=':
                            break
                        type_parts.append(c.value)
                        self.advance()
                    const_info["type"] = ' '.join(type_parts)

                if self.current() and self.current().value == '=':
                    self.advance()
                    value_parts = []
                    depth = 0
                    while self.pos < len(self.tokens):
                        c = self.current()
                        if not c:
                            break
                        if c.value == '(' or c.value == '[':
                            depth += 1
                        elif c.value == ')' or c.value == ']':
                            depth -= 1
                        if c.value == ';' and depth <= 0:
                            self.advance()
                            break
                        value_parts.append(c.value)
                        self.advance()
                    const_info["value"] = ' '.join(value_parts)
                else:
                    self._skip_to_semicolon()

                self.ast["constants"].append(const_info)
            else:
                self.advance()

    def _skip_to_semicolon(self):
        depth = 0
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.value == '(' or t.value == '[':
                depth += 1
            elif t.value == ')' or t.value == ']':
                depth -= 1
            elif t.value == ';' and depth <= 0:
                self.advance()
                return
            self.advance()

    def _skip_to_end_or_semicolon(self):
        depth = 0
        while self.pos < len(self.tokens):
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value == 'end':
                self.advance()
                self.expect_symbol(';')
                return
            self.advance()

    def _skip_block(self):
        depth = 1
        self.advance()
        while self.pos < len(self.tokens) and depth > 0:
            t = self.current()
            if not t:
                break
            if t.token_type == 'KEYWORD' and t.value == 'begin':
                depth += 1
            elif t.token_type == 'KEYWORD' and t.value == 'end':
                depth -= 1
            elif t.token_type == 'KEYWORD' and t.value in ('try', 'case'):
                depth += 1
            self.advance()
        self.expect_symbol(';')
        if self.current() and self.current().value == '.':
            self.advance()

    def _skip_brackets(self):
        depth = 1
        self.advance()
        while self.pos < len(self.tokens) and depth > 0:
            t = self.current()
            if not t:
                break
            if t.value == '[':
                depth += 1
            elif t.value == ']':
                depth -= 1
            self.advance()


def parse_delphi_file(file_path: str, content: Optional[str] = None, project_id: str = "default") -> Dict[str, Any]:
    logger = _get_parser_logger(project_id)
    if content is None:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            logger.error(f"READ ERROR | {file_path} | {type(e).__name__}: {str(e)}")
            return {"error": str(e), "file_path": file_path}

    file_size = len(content.encode('utf-8', errors='replace'))
    line_count = content.count('\n') + 1

    ast_result = _try_delphiast(file_path, logger)
    if ast_result:
        ast_result["line_count"] = line_count
        return ast_result

    logger.info(f"FALLBACK Python | {file_path} | size={file_size}B lines={line_count} | DelphiAST failed, using Python parser")
    start = time.time()
    try:
        lexer = DelphiLexer(content)
        tokens = lexer.tokenize()
        parser = DelphiParser(tokens, file_path)
        ast = parser.parse()
        ast["line_count"] = line_count
        elapsed = time.time() - start
        logger.info(f"OK   Python    | {file_path} | {elapsed:.2f}s | unit={ast.get('unit_name', '?')} classes={len(ast.get('classes', []))} uses={len(ast.get('uses_interface', []))}")
        return ast
    except Exception as e:
        elapsed = time.time() - start
        logger.error(f"FAIL Python    | {file_path} | {elapsed:.2f}s | {type(e).__name__}: {str(e)[:300]}")
        return {"error": str(e), "file_path": file_path, "line_count": line_count}


def parse_directory(directory: str, project_id: str = "default") -> List[Dict[str, Any]]:
    logger = _get_parser_logger(project_id)
    results = []
    delphi_extensions = {'.pas', '.dpr', '.dpk', '.pp', '.lpr', '.inc'}
    all_files = []

    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('__history', '__recovery', 'backup')]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in delphi_extensions:
                full_path = os.path.join(root, f)
                all_files.append(full_path)

    logger.info(f"SCAN | Found {len(all_files)} Delphi source files in {directory}")

    for i, full_path in enumerate(all_files, 1):
        rel_path = os.path.relpath(full_path, directory)
        logger.debug(f"PARSE [{i}/{len(all_files)}] | {rel_path}")
        result = parse_delphi_file(full_path, project_id=project_id)
        result["file_path"] = rel_path
        results.append(result)

    delphiast_count = sum(1 for r in results if r.get("parser") == "delphiast")
    python_count = sum(1 for r in results if r.get("parser") == "builtin")
    error_count = sum(1 for r in results if "error" in r)
    logger.info(f"SUMMARY | Total={len(results)} | DelphiAST={delphiast_count} | Python={python_count} | Errors={error_count}")

    return results


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: delphi_parser.py <command> <path>"}))
        sys.exit(1)

    command = sys.argv[1]
    path = sys.argv[2]

    pid = sys.argv[3] if len(sys.argv) > 3 else "cli"

    if command == 'parse_file':
        result = parse_delphi_file(path, project_id=pid)
        print(json.dumps(result, indent=2))
    elif command == 'parse_dir':
        results = parse_directory(path, project_id=pid)
        print(json.dumps(results))
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
