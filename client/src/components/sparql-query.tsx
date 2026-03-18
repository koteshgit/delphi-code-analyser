import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Play, Database, Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { RdfTriple } from "@shared/schema";

interface Props {
  projectId: string;
}

interface QueryResult {
  triples: RdfTriple[];
  count: number;
}

export function SparqlQuery({ projectId }: Props) {
  const [subject, setSubject] = useState("");
  const [predicate, setPredicate] = useState("");
  const [object, setObject] = useState("");
  const { toast } = useToast();

  const { data: tripleStats } = useQuery<{ triples: RdfTriple[]; total: number }>({
    queryKey: ["/api/projects/" + projectId + "/triples?limit=0"],
  });

  const queryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/sparql`, {
        subject: subject || undefined,
        predicate: predicate || undefined,
        object: object || undefined,
      });
      return res.json() as Promise<QueryResult>;
    },
  });

  const results = queryMutation.data;

  const presets = [
    { label: "All Classes", s: "", p: "rdf:type", o: "code:class" },
    { label: "All Dependencies", s: "", p: "dep:uses", o: "" },
    { label: "Inheritance", s: "", p: "code:extends", o: "" },
    { label: "Interfaces", s: "", p: "rdf:type", o: "code:interface" },
    { label: "All Methods", s: "", p: "code:hasMethod", o: "" },
    { label: "Properties", s: "", p: "code:hasProperty", o: "" },
    { label: "Units", s: "", p: "rdf:type", o: "code:unit" },
    { label: "Fields", s: "", p: "code:hasField", o: "" },
  ];

  const handlePreset = (preset: typeof presets[0]) => {
    setSubject(preset.s);
    setPredicate(preset.p);
    setObject(preset.o);
  };

  const copyResults = () => {
    if (!results) return;
    const text = results.triples.map(t => `${t.subject}\t${t.predicate}\t${t.object}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const downloadResults = () => {
    if (!results) return;
    const headers = "subject\tpredicate\tobject\n";
    const rows = results.triples.map(t => `${t.subject}\t${t.predicate}\t${t.object}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "triples.tsv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-4">
        <Card className="border-card-border sticky top-24">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Triple Pattern Query
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Query RDF triples using subject-predicate-object patterns. Leave fields empty for wildcard matching.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="e.g., delphi:TMyClass"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 h-8 text-xs font-mono"
                data-testid="input-sparql-subject"
              />
            </div>
            <div>
              <Label className="text-xs">Predicate</Label>
              <Input
                placeholder="e.g., rdf:type, code:extends"
                value={predicate}
                onChange={(e) => setPredicate(e.target.value)}
                className="mt-1 h-8 text-xs font-mono"
                data-testid="input-sparql-predicate"
              />
            </div>
            <div>
              <Label className="text-xs">Object</Label>
              <Input
                placeholder="e.g., code:class"
                value={object}
                onChange={(e) => setObject(e.target.value)}
                className="mt-1 h-8 text-xs font-mono"
                data-testid="input-sparql-object"
              />
            </div>

            <Button
              onClick={() => queryMutation.mutate()}
              disabled={queryMutation.isPending}
              className="w-full gap-2 mt-2"
              data-testid="button-run-query"
            >
              <Play className="w-3.5 h-3.5" />
              Run Query
            </Button>

            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick Queries</p>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    data-testid={`button-preset-${preset.label.toLowerCase().replace(/\s/g, '-')}`}
                    className="text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {tripleStats && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="w-3.5 h-3.5" />
                  <span>{tripleStats.total?.toLocaleString() || 0} total triples in store</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="col-span-8">
        <Card className="border-card-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Results
              {results && (
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {results.count} triples found
                </span>
              )}
            </CardTitle>
            {results && results.count > 0 && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={copyResults} data-testid="button-copy-results">
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={downloadResults} data-testid="button-download-results">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {queryMutation.isPending ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-muted-foreground">Running query...</p>
              </div>
            ) : results ? (
              results.count > 0 ? (
                <ScrollArea className="h-[500px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Subject</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Predicate</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Object</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.triples.map((triple, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-1.5 font-mono text-blue-600 dark:text-blue-400">{triple.subject}</td>
                          <td className="px-4 py-1.5 font-mono text-emerald-600 dark:text-emerald-400">{triple.predicate}</td>
                          <td className="px-4 py-1.5 font-mono">{triple.object}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <Search className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No triples match your query</p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <Database className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Run a query to see results</p>
                <p className="text-xs text-muted-foreground mt-1">Use the quick queries on the left, or enter your own pattern</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
