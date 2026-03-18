import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileCode2, Folder, ChevronRight, ChevronDown, Search,
  Box, Braces, FunctionSquare, Hash, Code2, Eye, Copy, Check
} from "lucide-react";
import type { ParsedFile } from "@shared/schema";

interface Props {
  projectId: string;
  files: ParsedFile[];
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: ParsedFile;
}

function buildFileTree(files: ParsedFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };

  for (const file of files) {
    const parts = file.filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  function sortTree(node: TreeNode) {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  }
  sortTree(root);

  return root;
}

const DELPHI_KEYWORDS = new Set([
  "program", "unit", "library", "package", "uses", "interface", "implementation",
  "initialization", "finalization", "begin", "end", "var", "const", "type",
  "class", "record", "object", "array", "set", "file", "of",
  "function", "procedure", "constructor", "destructor", "property",
  "if", "then", "else", "case", "for", "to", "downto", "do", "while", "repeat", "until",
  "with", "try", "except", "finally", "raise", "on",
  "inherited", "self", "result", "exit", "break", "continue",
  "nil", "true", "false", "not", "and", "or", "xor", "in", "is", "as", "div", "mod", "shl", "shr",
  "public", "private", "protected", "published", "strict",
  "virtual", "override", "abstract", "dynamic", "reintroduce",
  "overload", "inline", "static", "external", "forward",
  "out", "string", "integer", "boolean", "byte", "word", "cardinal", "int64",
  "single", "double", "extended", "real", "char", "widechar", "pchar",
  "tclass", "tobject", "tcomponent", "tform",
]);

const DELPHI_TYPES = new Set([
  "string", "integer", "boolean", "byte", "word", "cardinal", "int64", "uint64",
  "single", "double", "extended", "real", "currency", "comp",
  "char", "widechar", "ansichar", "pchar", "pansichar", "pwidechar",
  "shortstring", "ansistring", "widestring", "unicodestring",
  "pointer", "tobject", "tclass", "tcomponent", "tform", "tlist",
  "variant", "olevariant", "iunknown", "idispatch",
  "tstrings", "tstringlist", "tstream", "tfilestream", "tmemorystream",
]);

function tokenizeLine(line: string): { text: string; type: string }[] {
  const tokens: { text: string; type: string }[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    if (line[i] === '{') {
      const end = line.indexOf('}', i);
      if (end >= 0) {
        tokens.push({ text: line.slice(i, end + 1), type: "comment" });
        i = end + 1;
        continue;
      }
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    if (line[i] === '(' && line[i + 1] === '*') {
      const end = line.indexOf('*)', i);
      if (end >= 0) {
        tokens.push({ text: line.slice(i, end + 2), type: "comment" });
        i = end + 2;
        continue;
      }
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    if (line[i] === "'") {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "'") {
          if (line[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      tokens.push({ text: line.slice(i, j + 1), type: "string" });
      i = j + 1;
      continue;
    }

    if (line[i] === '#') {
      let j = i + 1;
      while (j < line.length && /\d/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    if (/\d/.test(line[i])) {
      let j = i;
      if (line[i] === '$') {
        j++;
        while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
      } else {
        while (j < line.length && /[\d.]/.test(line[j])) j++;
        if (j < line.length && /[eE]/.test(line[j])) {
          j++;
          if (j < line.length && /[+-]/.test(line[j])) j++;
          while (j < line.length && /\d/.test(line[j])) j++;
        }
      }
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    if (line[i] === '$' && i + 1 < line.length && /[0-9a-fA-F]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const lower = word.toLowerCase();
      if (DELPHI_KEYWORDS.has(lower)) {
        tokens.push({ text: word, type: "keyword" });
      } else if (DELPHI_TYPES.has(lower)) {
        tokens.push({ text: word, type: "type" });
      } else if (word[0] === 'T' && word.length > 1 && word[1] === word[1].toUpperCase()) {
        tokens.push({ text: word, type: "type" });
      } else {
        tokens.push({ text: word, type: "identifier" });
      }
      i = j;
      continue;
    }

    if (/[()[\]{};:,.=<>+\-*/@^]/.test(line[i])) {
      tokens.push({ text: line[i], type: "punctuation" });
      i++;
      continue;
    }

    tokens.push({ text: line[i], type: "plain" });
    i++;
  }

  return tokens;
}

const TOKEN_CLASSES: Record<string, string> = {
  keyword: "text-purple-600 dark:text-purple-400 font-semibold",
  type: "text-teal-600 dark:text-teal-400",
  string: "text-green-700 dark:text-green-400",
  comment: "text-gray-400 dark:text-gray-500 italic",
  number: "text-blue-600 dark:text-blue-400",
  punctuation: "text-gray-600 dark:text-gray-400",
  identifier: "text-gray-800 dark:text-gray-200",
  plain: "text-gray-800 dark:text-gray-200",
};

function SourceCodeView({ source, filePath }: { source: string; filePath: string }) {
  const [copied, setCopied] = useState(false);
  const lines = source.split("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineDigits = String(lines.length).length;

  return (
    <div className="border border-border rounded-lg overflow-hidden" data-testid="source-code-view">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="w-3.5 h-3.5" />
          <span className="font-medium text-foreground">{filePath.split("/").pop()}</span>
          <span>{lines.length} lines</span>
          <span>{(new Blob([source]).size / 1024).toFixed(1)} KB</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleCopy}
          data-testid="button-copy-source"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="source-code-table">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className="hover:bg-primary/5 group"
                  data-testid={`source-line-${i + 1}`}
                >
                  <td
                    className="select-none text-right pr-4 pl-4 py-0 text-xs text-muted-foreground/50 group-hover:text-muted-foreground border-r border-border/50 align-top"
                    style={{ minWidth: `${lineDigits + 2}ch` }}
                    data-testid={`line-number-${i + 1}`}
                  >
                    <span className="leading-5">{i + 1}</span>
                  </td>
                  <td className="pl-4 pr-4 py-0 font-mono text-xs whitespace-pre align-top">
                    <span className="leading-5">
                      {tokenizeLine(line).map((tok, j) => (
                        <span key={j} className={TOKEN_CLASSES[tok.type] || ""}>{tok.text}</span>
                      ))}
                      {line.length === 0 && "\u00A0"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  );
}

function ParsedStructureView({ ast }: { ast: Record<string, any> }) {
  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-5 p-4">
        {ast.uses_interface?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Interface Uses</h4>
            <div className="flex flex-wrap gap-1.5">
              {ast.uses_interface.map((u: string) => (
                <span key={u} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {u}
                </span>
              ))}
            </div>
          </section>
        )}

        {ast.uses_implementation?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Implementation Uses</h4>
            <div className="flex flex-wrap gap-1.5">
              {ast.uses_implementation.map((u: string) => (
                <span key={u} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  {u}
                </span>
              ))}
            </div>
          </section>
        )}

        {ast.classes?.map((cls: any) => (
          <section key={cls.name} className="border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Box className="w-4 h-4 text-emerald-500" />
              <h4 className="text-sm font-semibold">{cls.name}</h4>
              {cls.parent && (
                <span className="text-xs text-muted-foreground">extends {cls.parent}</span>
              )}
            </div>

            {cls.fields?.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Fields</p>
                <div className="space-y-0.5">
                  {cls.fields.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <Hash className="w-3 h-3 text-muted-foreground" />
                      <span>{f.names?.join(", ")}</span>
                      {f.type && <span className="text-muted-foreground">: {f.type}</span>}
                      {f.visibility && (
                        <span className="text-[10px] text-muted-foreground/60">[{f.visibility}]</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cls.methods?.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Methods</p>
                <div className="space-y-0.5">
                  {cls.methods.map((m: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <FunctionSquare className="w-3 h-3 text-blue-500" />
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground">({m.params?.map((p: any) => `${p.name}: ${p.type || '?'}`).join(", ")})</span>
                      {m.return_type && <span className="text-muted-foreground">: {m.return_type}</span>}
                      {m.visibility && (
                        <span className="text-[10px] text-muted-foreground/60">[{m.visibility}]</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cls.properties?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Properties</p>
                <div className="space-y-0.5">
                  {cls.properties.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <Braces className="w-3 h-3 text-amber-500" />
                      <span>{p.name}</span>
                      {p.type && <span className="text-muted-foreground">: {p.type}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}

        {ast.records?.map((rec: any) => (
          <section key={rec.name} className="border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Braces className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-semibold">{rec.name}</h4>
              <span className="text-xs text-muted-foreground">record</span>
            </div>
            {rec.fields?.map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5 ml-2">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span>{f.names?.join(", ")}</span>
                {f.type && <span className="text-muted-foreground">: {f.type}</span>}
              </div>
            ))}
          </section>
        ))}

        {ast.interfaces_decl?.map((iface: any) => (
          <section key={iface.name} className="border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Box className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-semibold">{iface.name}</h4>
              <span className="text-xs text-muted-foreground">interface</span>
              {iface.guid && (
                <span className="text-[10px] font-mono text-muted-foreground/60">{iface.guid}</span>
              )}
            </div>
            {iface.methods?.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5 ml-2">
                <FunctionSquare className="w-3 h-3 text-blue-500" />
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">({m.params?.map((p: any) => `${p.name}: ${p.type || '?'}`).join(", ")})</span>
                {m.return_type && <span className="text-muted-foreground">: {m.return_type}</span>}
              </div>
            ))}
          </section>
        ))}

        {ast.procedures?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Standalone Procedures</h4>
            {ast.procedures.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1">
                <FunctionSquare className="w-3 h-3 text-blue-500" />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">({p.params?.map((param: any) => `${param.name}: ${param.type || '?'}`).join(", ")})</span>
              </div>
            ))}
          </section>
        )}

        {ast.functions?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Standalone Functions</h4>
            {ast.functions.map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1">
                <FunctionSquare className="w-3 h-3 text-emerald-500" />
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground">({f.params?.map((param: any) => `${param.name}: ${param.type || '?'}`).join(", ")})</span>
                {f.return_type && <span className="text-muted-foreground">: {f.return_type}</span>}
              </div>
            ))}
          </section>
        )}

        {ast.constants?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Constants</h4>
            {ast.constants.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                {c.value && <span className="text-muted-foreground">= {c.value}</span>}
              </div>
            ))}
          </section>
        )}

        {ast.types?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Type Definitions</h4>
            {ast.types.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <Braces className="w-3 h-3 text-teal-500" />
                <span className="font-medium">{t.name}</span>
                {t.base_type && <span className="text-muted-foreground">= {t.base_type}</span>}
              </div>
            ))}
          </section>
        )}

        {ast.variables?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Variables</h4>
            {ast.variables.map((v: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span>{v.names?.join(", ") || v.name}</span>
                {v.type && <span className="text-muted-foreground">: {v.type}</span>}
              </div>
            ))}
          </section>
        )}

        {ast.directives?.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Compiler Directives</h4>
            <div className="flex flex-wrap gap-1.5">
              {ast.directives.map((d: string, i: number) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono">
                  {d}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

export function CodeBrowser({ projectId, files }: Props) {
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<ParsedFile | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"code" | "structure">("code");

  const { data: fileDetail } = useQuery<ParsedFile>({
    queryKey: ["/api/projects/" + projectId + "/files/" + selectedFile?.id],
    enabled: !!selectedFile,
  });

  const { data: sourceData } = useQuery<{ source: string | null; filePath: string }>({
    queryKey: ["/api/projects", projectId, "files", selectedFile?.id, "source"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files/${selectedFile!.id}/source`);
      if (!res.ok) throw new Error("Failed to fetch source");
      return res.json();
    },
    enabled: !!selectedFile,
  });

  const tree = useMemo(() => buildFileTree(files), [files]);
  const filteredFiles = search
    ? files.filter(f => f.filePath.toLowerCase().includes(search.toLowerCase()) || f.unitName?.toLowerCase().includes(search.toLowerCase()))
    : [];

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const ast = (fileDetail?.parsedAst as Record<string, any>) || null;
  const hasAst = ast && Object.keys(ast).length > 0;

  const breadcrumbs = selectedFile?.filePath.split("/") || [];

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <Card className="border-card-border sticky top-24">
          <CardHeader className="pb-2 pt-4 px-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="input-search-files"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {search ? (
                <div className="p-2 space-y-0.5">
                  {filteredFiles.map(f => (
                    <button
                      key={f.id}
                      onClick={() => { setSelectedFile(f); setSearch(""); }}
                      data-testid={`button-file-${f.id}`}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors ${
                        selectedFile?.id === f.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{f.filePath}</span>
                    </button>
                  ))}
                  {filteredFiles.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">No files found</p>
                  )}
                </div>
              ) : (
                <div className="p-2">
                  <FileTreeView
                    node={tree}
                    depth={0}
                    expanded={expandedDirs}
                    onToggle={toggleDir}
                    selectedId={selectedFile?.id}
                    onSelect={setSelectedFile}
                  />
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="col-span-9">
        {selectedFile ? (
          <Card className="border-card-border" data-testid="card-file-detail">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5" data-testid="breadcrumb-path">
                    {breadcrumbs.map((part, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-muted-foreground/40">/</span>}
                        <span className={i === breadcrumbs.length - 1 ? "text-foreground font-medium" : "hover:text-primary cursor-pointer"}>
                          {part}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">{ast?.unit_name || selectedFile.filePath.split("/").pop()}</CardTitle>
                    </div>
                    {ast?.unit_type && <Badge variant="outline" className="text-[10px]">{ast.unit_type}</Badge>}
                    <span className="text-xs text-muted-foreground">{selectedFile.lineCount} lines</span>
                    {ast?.classes?.length > 0 && (
                      <span className="text-xs text-muted-foreground">{ast.classes.length} class{ast.classes.length > 1 ? "es" : ""}</span>
                    )}
                  </div>
                </div>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "code" | "structure")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="code" className="text-xs gap-1.5 h-7 px-3" data-testid="tab-code-view">
                      <Code2 className="w-3 h-3" />
                      Code
                    </TabsTrigger>
                    <TabsTrigger value="structure" className="text-xs gap-1.5 h-7 px-3" data-testid="tab-structure-view">
                      <Eye className="w-3 h-3" />
                      Structure
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {viewMode === "code" ? (
                sourceData?.source ? (
                  <SourceCodeView source={sourceData.source} filePath={selectedFile.filePath} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FileCode2 className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">Source file not available on disk</p>
                    <p className="text-xs mt-1">Switch to Structure view to see the parsed AST</p>
                  </div>
                )
              ) : hasAst ? (
                <ParsedStructureView ast={ast} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No parsed structure available</p>
                  <p className="text-xs mt-1">Switch to Code view to see the source</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <FileCode2 className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Select a file to view its source code</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Browse the file tree or use search</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function FileTreeView({
  node, depth, expanded, onToggle, selectedId, onSelect
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selectedId?: string;
  onSelect: (file: ParsedFile) => void;
}) {
  if (depth === 0) {
    return (
      <>
        {node.children.map(child => (
          <FileTreeView
            key={child.path}
            node={child}
            depth={1}
            expanded={expanded}
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  const isExpanded = expanded.has(node.path);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-muted text-muted-foreground transition-colors"
          style={{ paddingLeft: `${depth * 12}px` }}
          data-testid={`button-dir-${node.path}`}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => (
          <FileTreeView
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => node.file && onSelect(node.file)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors ${
        selectedId === node.file?.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
      }`}
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
      data-testid={`button-file-tree-${node.file?.id}`}
    >
      <FileCode2 className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
