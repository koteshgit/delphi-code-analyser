import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, GitFork, Layers, Brain, Workflow, Database as DbIcon,
  Download, FileJson, FileCode2, Share2, Activity, Gauge,
  ArrowRightLeft, LayoutGrid, Link2, BoxSelect, FileText, FileDown,
  Globe, Trash2, Network, BarChart3
} from "lucide-react";
import type { AnalysisResult } from "@shared/schema";
import { useState } from "react";
import { DiagramBlock, DiagramFilterToggle, type DiagramFilter } from "./diagram-renderer";

const RESULT_ICONS: Record<string, any> = {
  architecture: Building2,
  dependencies: GitFork,
  class_hierarchy: Layers,
  complexity: Brain,
  patterns: Brain,
  bpmn: Workflow,
  entity_flow: DbIcon,
  data_flow: DbIcon,
  control_flow: Activity,
  summary: Gauge,
  sequence_diagrams: ArrowRightLeft,
  mvc_layers: LayoutGrid,
  class_interactions: Link2,
  class_diagrams: BoxSelect,
  api_soa_contracts: Globe,
  dead_code: Trash2,
  call_graph: Network,
  metrics: BarChart3,
};

const RESULT_COLORS: Record<string, string> = {
  architecture: "text-blue-500",
  dependencies: "text-violet-500",
  class_hierarchy: "text-emerald-500",
  complexity: "text-amber-500",
  patterns: "text-rose-500",
  api_soa_contracts: "text-pink-500",
  bpmn: "text-cyan-500",
  entity_flow: "text-indigo-500",
  data_flow: "text-indigo-500",
  control_flow: "text-orange-500",
  summary: "text-slate-500",
  sequence_diagrams: "text-teal-500",
  mvc_layers: "text-sky-500",
  class_interactions: "text-fuchsia-500",
  class_diagrams: "text-lime-600",
  dead_code: "text-red-500",
  call_graph: "text-cyan-500",
  metrics: "text-yellow-500",
};

const EXPORT_FORMATS = [
  { key: "json", label: "JSON", icon: FileJson, description: "Full analysis data" },
  { key: "graphml", label: "GraphML", icon: Share2, description: "For Gephi/yEd" },
  { key: "dot", label: "DOT", icon: FileCode2, description: "For Graphviz" },
  { key: "turtle", label: "RDF/Turtle", icon: DbIcon, description: "RDF triples" },
];

interface Props {
  results: AnalysisResult[];
  projectId?: string;
}

const DIAGRAM_RESULT_TYPES = new Set([
  "sequence_diagrams", "mvc_layers", "class_interactions", "class_diagrams", "call_graph"
]);

export function AnalysisResultsView({ results, projectId }: Props) {
  const displayResults = results.filter(r =>
    !r.resultType.startsWith("export_") && r.resultType !== "summary"
  );
  const hasExports = results.some(r => r.resultType.startsWith("export_"));
  const [active, setActive] = useState(displayResults[0]?.resultType || "architecture");
  const [diagramFilter, setDiagramFilter] = useState<DiagramFilter>("both");
  const isDiagramResult = DIAGRAM_RESULT_TYPES.has(active);

  if (displayResults.length === 0) {
    return (
      <Card className="border-card-border">
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">No analysis results yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {projectId && (
        <Card className="border-card-border">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Export Downloads</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {EXPORT_FORMATS.map(({ key, label, icon: Icon, description }) => {
                const available = results.some(r => r.resultType === `export_${key}`);
                return (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    disabled={!available}
                    className="gap-2"
                    data-testid={`button-export-${key}`}
                    onClick={() => {
                      if (available) {
                        window.open(`/api/projects/${projectId}/export/${key}`, "_blank");
                      }
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">({description})</span>
                  </Button>
                );
              })}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground mb-2">Full Analysis Report</p>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  data-testid="button-report-pdf"
                  onClick={() => window.open(`/api/projects/${projectId}/report/pdf`, "_blank")}
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  data-testid="button-report-docx"
                  onClick={() => window.open(`/api/projects/${projectId}/report/docx`, "_blank")}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Download DOCX</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {displayResults.length > 0 && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3">
            <Card className="border-card-border sticky top-24">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Analysis Results</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <nav className="space-y-0.5">
                  {displayResults.map((result) => {
                    const Icon = RESULT_ICONS[result.resultType] || Brain;
                    const color = RESULT_COLORS[result.resultType] || "text-muted-foreground";
                    const isActive = active === result.resultType;
                    return (
                      <button
                        key={result.id}
                        onClick={() => setActive(result.resultType)}
                        data-testid={`button-result-${result.resultType}`}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : color}`} />
                        <span className="truncate">{result.title}</span>
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-9">
            {displayResults.filter(r => r.resultType === active).map((result) => (
              <Card key={result.id} className="border-card-border" data-testid={`card-result-${result.resultType}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = RESULT_ICONS[result.resultType] || Brain;
                        const color = RESULT_COLORS[result.resultType] || "text-muted-foreground";
                        return <Icon className={`w-5 h-5 ${color}`} />;
                      })()}
                      <CardTitle className="text-lg">{result.title}</CardTitle>
                    </div>
                    {isDiagramResult && (
                      <DiagramFilterToggle filter={diagramFilter} onChange={setDiagramFilter} />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="prose prose-sm dark:prose-invert max-w-none pr-4">
                      <MarkdownContent
                        content={result.content || ""}
                        diagramFilter={isDiagramResult ? diagramFilter : "both"}
                      />
                    </div>

                    {result.metadata && typeof result.metadata === 'object' ? (
                      <MetadataCards metadata={result.metadata as Record<string, any>} resultType={result.resultType} />
                    ) : null}
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ content, diagramFilter = "both" }: { content: string; diagramFilter?: DiagramFilter }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeBlockLang = "";
  let diagramCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        const codeText = codeLines.join("\n");
        if (codeBlockLang === "plantuml" || codeBlockLang === "mermaid") {
          const shouldShow =
            diagramFilter === "both" ||
            (diagramFilter === "plantuml" && codeBlockLang === "plantuml") ||
            (diagramFilter === "mermaid" && codeBlockLang === "mermaid");
          if (shouldShow) {
            const idx = diagramCounter++;
            elements.push(
              <DiagramBlock key={`diagram-${i}`} type={codeBlockLang} code={codeText} index={idx} />
            );
          }
          codeLines = [];
          inCodeBlock = false;
          codeBlockLang = "";
          continue;
        } else {
          elements.push(
            <pre key={i} className="bg-muted/50 rounded-md p-3 text-xs overflow-x-auto mb-3">
              <code>{codeText}</code>
            </pre>
          );
        }
        codeLines = [];
        inCodeBlock = false;
        codeBlockLang = "";
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim().toLowerCase();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    if (inTable && tableRows.length > 0) {
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {tableRows[0].map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-xs">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-4 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold mt-5 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("- **")) {
      const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1 text-sm mb-1 ml-2">
            <span className="font-medium">{match[1]}:</span>
            <span className="text-muted-foreground">{match[2]}</span>
          </div>
        );
      } else {
        elements.push(<li key={i} className="text-sm mb-0.5 ml-4">{line.slice(2)}</li>);
      }
    } else if (line.startsWith("  - ")) {
      elements.push(<li key={i} className="text-sm mb-0.5 ml-8 text-muted-foreground">{line.slice(4)}</li>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={i} className="text-sm mb-0.5 ml-4">{line.slice(2)}</li>);
    } else if (line.trim() === "") {
      continue;
    } else {
      elements.push(<p key={i} className="text-sm mb-2">{line}</p>);
    }
  }

  if (inTable && tableRows.length > 0) {
    elements.push(
      <div key="final-table" className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {tableRows[0].map((h, j) => (
                <th key={j} className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(1).map((row, ri) => (
              <tr key={ri} className="border-b border-border/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-xs">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <>{elements}</>;
}

function MetadataCards({ metadata, resultType }: { metadata: Record<string, any>; resultType: string }) {
  if (resultType === "api_soa_contracts" && metadata.total_services != null) {
    const protocols = (metadata.protocols as string[]) || [];
    const frameworks = (metadata.frameworks as string[]) || [];
    if (metadata.total_services === 0 && protocols.length === 0) return null;

    return (
      <div className="mt-4 pt-4 border-t border-border" data-testid="api-soa-summary">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Service Overview</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metadata.total_services > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <div className="text-lg font-semibold" data-testid="text-total-services">{metadata.total_services}</div>
              <div className="text-xs text-muted-foreground">Service Endpoints</div>
            </div>
          )}
          {(metadata.rest_endpoints?.length || 0) > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <div className="text-lg font-semibold text-blue-500" data-testid="text-rest-count">{metadata.rest_endpoints.length}</div>
              <div className="text-xs text-muted-foreground">REST Controllers</div>
            </div>
          )}
          {(metadata.soap_services?.length || 0) > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <div className="text-lg font-semibold text-amber-500" data-testid="text-soap-count">{metadata.soap_services.length}</div>
              <div className="text-xs text-muted-foreground">SOAP Services</div>
            </div>
          )}
          {(metadata.datasnap_services?.length || 0) > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <div className="text-lg font-semibold text-emerald-500" data-testid="text-datasnap-count">{metadata.datasnap_services.length}</div>
              <div className="text-xs text-muted-foreground">DataSnap Services</div>
            </div>
          )}
        </div>
        {(protocols.length > 0 || frameworks.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {protocols.map((p: string) => (
              <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-500 border border-pink-500/20" data-testid={`badge-protocol-${p}`}>{p}</span>
            ))}
            {frameworks.map((f: string) => (
              <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20" data-testid={`badge-framework-${f}`}>{f}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (resultType === "dead_code" && metadata.total_dead != null) {
    return (
      <div className="mt-4 pt-4 border-t border-border" data-testid="dead-code-summary">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Dead Code Summary</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold" data-testid="text-total-defined">{metadata.total_defined}</div>
            <div className="text-xs text-muted-foreground">Total Elements</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-red-500" data-testid="text-total-dead">{metadata.total_dead}</div>
            <div className="text-xs text-muted-foreground">Potentially Dead</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-amber-500" data-testid="text-dead-pct">{metadata.dead_percentage}%</div>
            <div className="text-xs text-muted-foreground">Dead Code %</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-orange-500" data-testid="text-unreferenced-units">{(metadata.unreferenced_units || []).length}</div>
            <div className="text-xs text-muted-foreground">Orphan Units</div>
          </div>
        </div>
      </div>
    );
  }

  if (resultType === "call_graph" && metadata.total_edges != null) {
    return (
      <div className="mt-4 pt-4 border-t border-border" data-testid="call-graph-summary">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Call Graph Summary</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold" data-testid="text-total-edges">{metadata.total_edges}</div>
            <div className="text-xs text-muted-foreground">Call Edges</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-cyan-500" data-testid="text-unique-callers">{metadata.unique_callers}</div>
            <div className="text-xs text-muted-foreground">Callers</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-blue-500" data-testid="text-unique-callees">{metadata.unique_callees}</div>
            <div className="text-xs text-muted-foreground">Callees</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-green-500" data-testid="text-entry-points">{(metadata.entry_points || []).length}</div>
            <div className="text-xs text-muted-foreground">Entry Points</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-violet-500" data-testid="text-hub-nodes">{(metadata.hub_nodes || []).length}</div>
            <div className="text-xs text-muted-foreground">Hub Nodes</div>
          </div>
        </div>
      </div>
    );
  }

  if (resultType === "metrics" && metadata.total_files != null) {
    return (
      <div className="mt-4 pt-4 border-t border-border" data-testid="metrics-summary">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Key Metrics</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold" data-testid="text-metric-files">{metadata.total_files}</div>
            <div className="text-xs text-muted-foreground">Source Files</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-yellow-500" data-testid="text-metric-lines">{(metadata.total_lines || 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Lines of Code</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-blue-500" data-testid="text-metric-classes">{metadata.total_classes}</div>
            <div className="text-xs text-muted-foreground">Classes</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-lg font-semibold text-emerald-500" data-testid="text-metric-methods">{metadata.total_methods}</div>
            <div className="text-xs text-muted-foreground">Methods</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-sm font-semibold text-violet-500" data-testid="text-metric-instability">{metadata.avg_instability}</div>
            <div className="text-xs text-muted-foreground">Avg Instability</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-sm font-semibold text-amber-500" data-testid="text-metric-dit">{metadata.max_dit}</div>
            <div className="text-xs text-muted-foreground">Max Inheritance Depth</div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-sm font-semibold text-rose-500" data-testid="text-metric-coupling">{metadata.avg_efferent_coupling}</div>
            <div className="text-xs text-muted-foreground">Avg Efferent Coupling</div>
          </div>
        </div>
      </div>
    );
  }

  if (resultType === "architecture" && metadata.layers) {
    const layers = metadata.layers as Record<string, string[]>;
    const totalUnits = Object.values(layers).reduce((acc, arr) => acc + arr.length, 0);
    if (totalUnits === 0) return null;

    return (
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Layer Distribution</h4>
        <div className="flex gap-1 h-6 rounded-md overflow-hidden">
          {Object.entries(layers).map(([layer, units]) => {
            if (units.length === 0) return null;
            const pct = (units.length / totalUnits * 100);
            const colors: Record<string, string> = {
              presentation: "bg-blue-500",
              business: "bg-emerald-500",
              data: "bg-violet-500",
              utility: "bg-muted-foreground",
            };
            return (
              <div
                key={layer}
                className={`${colors[layer] || "bg-muted"} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${layer}: ${units.length} units (${pct.toFixed(0)}%)`}
              />
            );
          })}
        </div>
        <div className="flex gap-4 mt-2">
          {Object.entries(layers).map(([layer, units]) => {
            if (units.length === 0) return null;
            const colors: Record<string, string> = {
              presentation: "bg-blue-500",
              business: "bg-emerald-500",
              data: "bg-violet-500",
              utility: "bg-muted-foreground",
            };
            return (
              <div key={layer} className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full ${colors[layer]}`} />
                <span className="text-muted-foreground capitalize">{layer} ({units.length})</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
