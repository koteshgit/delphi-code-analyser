import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Play, FileCode2, Database, Network, Search,
  BarChart3, GitBranch, Activity, Triangle, Clock, Loader2,
  CheckCircle2, XCircle, AlertCircle, FileText
} from "lucide-react";
import type { Project, AnalysisJob, ParsedFile, AnalysisResult } from "@shared/schema";
import { useState, useEffect } from "react";
import { GraphViewer } from "@/components/graph-viewer";
import { SparqlQuery } from "@/components/sparql-query";
import { AnalysisResultsView } from "@/components/analysis-results";
import { CodeBrowser } from "@/components/code-browser";
import { AgentPipeline } from "@/components/agent-pipeline";

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id!;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: statusData, isLoading } = useQuery<{ project: Project; job: AnalysisJob | null }>({
    queryKey: ["/api/projects/" + projectId + "/status"],
    refetchInterval: (query) => {
      const data = query.state.data as { project: Project; job: AnalysisJob | null } | undefined;
      if (data?.project?.status === "analyzing" || data?.job?.status === "running") return 2000;
      return false;
    },
  });

  const { data: files } = useQuery<ParsedFile[]>({
    queryKey: ["/api/projects/" + projectId + "/files"],
    enabled: statusData?.project?.status === "completed",
  });

  const { data: results } = useQuery<AnalysisResult[]>({
    queryKey: ["/api/projects/" + projectId + "/results"],
    enabled: statusData?.project?.status === "completed",
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/projects/${projectId}/clone`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects/" + projectId + "/status"] });
      toast({ title: "Repository cloned" });
    },
    onError: (e: any) => toast({ title: "Clone failed", description: e.message, variant: "destructive" }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/analyze`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects/" + projectId + "/status"] });
      toast({ title: "Analysis started" });
    },
    onError: (e: any) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const project = statusData?.project;
  const job = statusData?.job;
  const isAnalyzing = project?.status === "analyzing" || job?.status === "running";
  const isCompleted = project?.status === "completed";
  const canAnalyze = project?.status === "cloned" || project?.status === "uploaded" || project?.status === "completed";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-5 w-40" />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Skeleton className="h-48 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="border-card-border max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <XCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Project Not Found</h3>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2" data-testid="link-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Triangle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold" data-testid="text-project-name">{project.name}</h1>
              <p className="text-xs text-muted-foreground">{project.sourceUrl || "Local upload"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isCompleted && !isAnalyzing && project.status === "pending" && project.sourceUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cloneMutation.mutate()}
                disabled={cloneMutation.isPending}
                data-testid="button-clone"
                className="gap-2"
              >
                {cloneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                Clone Repository
              </Button>
            )}
            {canAnalyze && (
              <Button
                size="sm"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending || isAnalyzing}
                data-testid="button-analyze"
                className="gap-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isAnalyzing ? "Analyzing..." : isCompleted ? "Re-analyze" : "Start Analysis"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {job && (isAnalyzing || job.status === "completed" || job.status === "failed") && (
          <Card className="border-card-border mb-6 overflow-hidden">
            {isAnalyzing && (
              <div className="h-1 bg-primary/20">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${job.progress || 0}%` }}
                />
              </div>
            )}
            {job.status === "completed" && (
              <div className="h-1 bg-emerald-500" />
            )}
            {job.status === "failed" && (
              <div className="h-1 bg-red-500" />
            )}
            <CardContent className="pt-5 pb-4">
              <AgentPipeline projectId={projectId} job={job} />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Files", value: project.totalFiles || 0, icon: FileCode2, color: "text-blue-500" },
            { label: "Parsed", value: project.parsedFiles || 0, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "RDF Triples", value: project.tripleCount || 0, icon: Database, color: "text-violet-500" },
            { label: "Status", value: project.status, icon: Activity, color: "text-amber-500", isStatus: true },
          ].map(({ label, value, icon: Icon, color, isStatus }) => (
            <Card key={label} className="border-card-border">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                {isStatus ? (
                  <StatusIndicator status={value as string} />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums" data-testid={`text-stat-${label.toLowerCase()}`}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {isCompleted && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="gap-1.5" data-testid="tab-overview">
                <BarChart3 className="w-3.5 h-3.5" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1.5" data-testid="tab-files">
                <FileCode2 className="w-3.5 h-3.5" />
                Code Browser
              </TabsTrigger>
              <TabsTrigger value="graph" className="gap-1.5" data-testid="tab-graph">
                <Network className="w-3.5 h-3.5" />
                Knowledge Graph
              </TabsTrigger>
              <TabsTrigger value="sparql" className="gap-1.5" data-testid="tab-sparql">
                <Search className="w-3.5 h-3.5" />
                SPARQL Query
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <AnalysisResultsView results={results || []} projectId={projectId} />
            </TabsContent>

            <TabsContent value="files">
              <CodeBrowser projectId={projectId} files={files || []} />
            </TabsContent>

            <TabsContent value="graph">
              <GraphViewer projectId={projectId} />
            </TabsContent>

            <TabsContent value="sparql">
              <SparqlQuery projectId={projectId} />
            </TabsContent>
          </Tabs>
        )}

        {!isCompleted && !isAnalyzing && (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Play className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">Ready to Analyze</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                {project.status === "pending" && project.sourceUrl
                  ? "Clone the repository first, then start the analysis pipeline"
                  : canAnalyze
                    ? "Click 'Start Analysis' to run the Delphi code analysis pipeline"
                    : "Upload or clone a Delphi codebase to begin analysis"
                }
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const config: Record<string, { icon: any; color: string; text: string }> = {
    pending: { icon: Clock, color: "text-muted-foreground", text: "Pending" },
    cloning: { icon: Loader2, color: "text-blue-500", text: "Cloning" },
    cloned: { icon: CheckCircle2, color: "text-blue-500", text: "Cloned" },
    uploaded: { icon: CheckCircle2, color: "text-blue-500", text: "Uploaded" },
    analyzing: { icon: Activity, color: "text-amber-500", text: "Analyzing" },
    completed: { icon: CheckCircle2, color: "text-emerald-500", text: "Completed" },
    failed: { icon: XCircle, color: "text-red-500", text: "Failed" },
  };
  const { icon: Icon, color, text } = config[status] || config.pending;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-5 h-5 ${color} ${status === "analyzing" || status === "cloning" ? "animate-spin" : ""}`} />
      <span className="text-sm font-medium capitalize" data-testid="text-status">{text}</span>
    </div>
  );
}
