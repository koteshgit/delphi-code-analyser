import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Plus, FolderCode, GitBranch, FileCode2, Triangle, Trash2,
  ChevronRight, Database, Activity, Clock, Settings
} from "lucide-react";
import type { Project } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { NewProjectDialog } from "@/components/new-project-dialog";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    cloning: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    cloned: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    uploaded: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    analyzing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <span
      data-testid={`badge-status-${status}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[status] || variants.pending}`}
    >
      {status === "analyzing" && <Activity className="w-3 h-3 mr-1 animate-pulse" />}
      {status}
    </span>
  );
}

export default function Dashboard() {
  const [showNew, setShowNew] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Triangle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-app-title">Delphi Legacy Code Analyser</h1>
              <p className="text-xs text-muted-foreground">Semantic code analysis & knowledge graph</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-settings" title="Settings">
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
            <Button onClick={() => setShowNew(true)} data-testid="button-new-project" className="gap-2">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Projects</h2>
          <p className="text-muted-foreground">Analyze Delphi legacy codebases with semantic graph extraction</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-card-border">
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                data-testid={`card-project-${project.id}`}
                className="border-card-border group cursor-pointer hover-elevate transition-all duration-200"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        {project.sourceType === "github" ? (
                          <GitBranch className="w-4 h-4 text-primary" />
                        ) : (
                          <FolderCode className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <CardTitle className="text-base truncate">{project.name}</CardTitle>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  {project.sourceUrl && (
                    <p className="text-xs text-muted-foreground truncate mb-3">{project.sourceUrl}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileCode2 className="w-3.5 h-3.5" />
                      {project.totalFiles || 0} files
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      {project.tripleCount || 0} triples
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-delete-${project.id}`}
                          className="text-muted-foreground hover:text-destructive h-7 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{project.name}" and all analysis data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(project.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      View details <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FolderCode className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1" data-testid="text-empty-state">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                Create your first project by cloning a Delphi repository or uploading a zip file
              </p>
              <Button onClick={() => setShowNew(true)} data-testid="button-create-first" className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <NewProjectDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}
