import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitBranch, Upload, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("github");
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", {
        name: name || (url ? url.split("/").pop() : "Unnamed Project"),
        sourceType: tab,
        sourceUrl: tab === "github" ? url : null,
      });
      return res.json();
    },
    onSuccess: async (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });

      if (tab === "github" && url) {
        try {
          await apiRequest("POST", `/api/projects/${project.id}/clone`, { sourceUrl: url });
          toast({ title: "Repository cloned successfully" });
        } catch (e: any) {
          toast({ title: "Clone failed", description: e.message, variant: "destructive" });
        }
      } else if (tab === "upload" && file) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch(`/api/projects/${project.id}/upload`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error("Upload failed");
          toast({ title: "File uploaded successfully" });
        } catch (e: any) {
          toast({ title: "Upload failed", description: e.message, variant: "destructive" });
        }
      }

      onOpenChange(false);
      setName("");
      setUrl("");
      setFile(null);
      navigate(`/project/${project.id}`);
    },
    onError: (e: any) => {
      toast({ title: "Failed to create project", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Analysis Project</DialogTitle>
          <DialogDescription>
            Import a Delphi codebase from a Git repository or upload a zip file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              data-testid="input-project-name"
              placeholder="My Delphi Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="github" className="flex-1 gap-2" data-testid="tab-github">
                <GitBranch className="w-4 h-4" />
                Git Repository
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1 gap-2" data-testid="tab-upload">
                <Upload className="w-4 h-4" />
                Upload Zip
              </TabsTrigger>
            </TabsList>

            <TabsContent value="github" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="repo-url">Repository URL</Label>
                <Input
                  id="repo-url"
                  data-testid="input-repo-url"
                  placeholder="https://github.com/user/repo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Supports GitHub, GitLab, and other public Git repositories
                </p>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="zip-file">Zip File</Label>
                <div className="mt-1.5">
                  <label
                    htmlFor="zip-file"
                    className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    {file ? (
                      <div className="text-center">
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Click to select a zip file</p>
                      </div>
                    )}
                  </label>
                  <input
                    id="zip-file"
                    data-testid="input-zip-file"
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || (!url && !file && tab !== "upload")}
            className="w-full mt-4 gap-2"
            data-testid="button-create-project"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
