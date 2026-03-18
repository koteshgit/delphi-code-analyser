import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Triangle, ArrowLeft, Key, Save, TestTube, Trash2, Plus, Cpu,
  SlidersHorizontal, Zap, Eye, EyeOff, Check, X, Loader2
} from "lucide-react";
import { SiAnthropic, SiOpenai, SiGoogle, SiMeta, SiHuggingface, SiAmazon } from "react-icons/si";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { LlmSetting } from "@shared/schema";

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: SiAnthropic,
    color: "text-[#d97706]",
    bgColor: "bg-[#d97706]/10",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-sonnet-20240620",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-haiku-20240307",
    ],
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-api03-...",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: SiOpenai,
    color: "text-[#10a37f]",
    bgColor: "bg-[#10a37f]/10",
    models: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "o3",
      "o3-mini",
      "o1",
      "o1-pro",
      "o1-mini",
      "o1-preview",
      "gpt-3.5-turbo",
    ],
    keyPrefix: "sk-",
    keyPlaceholder: "sk-proj-...",
  },
  {
    id: "google",
    name: "Google Gemini",
    icon: SiGoogle,
    color: "text-[#4285f4]",
    bgColor: "bg-[#4285f4]/10",
    models: [
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-flash-preview-04-17",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-pro",
    ],
    keyPrefix: "AI",
    keyPlaceholder: "AIza...",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    icon: Cpu,
    color: "text-[#f97316]",
    bgColor: "bg-[#f97316]/10",
    models: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "codestral-latest",
      "open-mistral-nemo",
      "open-mixtral-8x22b",
      "open-mixtral-8x7b",
      "mistral-embed",
    ],
    keyPrefix: "",
    keyPlaceholder: "API key from console.mistral.ai",
  },
  {
    id: "meta",
    name: "Meta Llama",
    icon: SiMeta,
    color: "text-[#0668E1]",
    bgColor: "bg-[#0668E1]/10",
    models: [
      "llama-4-scout-17b-16e",
      "llama-4-maverick-17b-128e",
      "llama-3.3-70b-instruct",
      "llama-3.1-405b-instruct",
      "llama-3.1-70b-instruct",
      "llama-3.1-8b-instruct",
      "llama-3-70b-instruct",
      "llama-3-8b-instruct",
      "codellama-70b-instruct",
      "codellama-34b-instruct",
    ],
    keyPrefix: "",
    keyPlaceholder: "API key (via Groq, Together, Fireworks, etc.)",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: Cpu,
    color: "text-[#4d6bfe]",
    bgColor: "bg-[#4d6bfe]/10",
    models: [
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-coder",
    ],
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    icon: Cpu,
    color: "text-[#1d9bf0]",
    bgColor: "bg-[#1d9bf0]/10",
    models: [
      "grok-3",
      "grok-3-mini",
      "grok-2",
      "grok-2-mini",
      "grok-beta",
    ],
    keyPrefix: "xai-",
    keyPlaceholder: "xai-...",
  },
  {
    id: "cohere",
    name: "Cohere",
    icon: Cpu,
    color: "text-[#39594d]",
    bgColor: "bg-[#39594d]/10",
    models: [
      "command-r-plus",
      "command-r",
      "command-a-03-2025",
      "command-light",
      "command-nightly",
    ],
    keyPrefix: "",
    keyPlaceholder: "API key from dashboard.cohere.com",
  },
  {
    id: "groq",
    name: "Groq",
    icon: Zap,
    color: "text-[#f55036]",
    bgColor: "bg-[#f55036]/10",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-3-70b-8192",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "qwen-qwq-32b",
      "deepseek-r1-distill-llama-70b",
    ],
    keyPrefix: "gsk_",
    keyPlaceholder: "gsk_...",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: Cpu,
    color: "text-[#20808d]",
    bgColor: "bg-[#20808d]/10",
    models: [
      "sonar-pro",
      "sonar",
      "sonar-deep-research",
      "sonar-reasoning-pro",
      "sonar-reasoning",
    ],
    keyPrefix: "pplx-",
    keyPlaceholder: "pplx-...",
  },
  {
    id: "together",
    name: "Together AI",
    icon: Cpu,
    color: "text-[#6366f1]",
    bgColor: "bg-[#6366f1]/10",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3",
      "mistralai/Mixtral-8x22B-Instruct-v0.1",
      "databricks/dbrx-instruct",
    ],
    keyPrefix: "",
    keyPlaceholder: "API key from api.together.xyz",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    icon: Zap,
    color: "text-[#e25822]",
    bgColor: "bg-[#e25822]/10",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/llama-v3p1-405b-instruct",
      "accounts/fireworks/models/mixtral-8x22b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
      "accounts/fireworks/models/deepseek-v3",
      "accounts/fireworks/models/deepseek-r1",
    ],
    keyPrefix: "",
    keyPlaceholder: "API key from fireworks.ai",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    icon: SiHuggingface,
    color: "text-[#ffbd45]",
    bgColor: "bg-[#ffbd45]/10",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "microsoft/Phi-3-mini-4k-instruct",
      "google/gemma-2-27b-it",
      "Qwen/Qwen2.5-72B-Instruct",
      "bigcode/starcoder2-15b",
    ],
    keyPrefix: "hf_",
    keyPlaceholder: "hf_...",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    icon: SiOpenai,
    color: "text-[#0078d4]",
    bgColor: "bg-[#0078d4]/10",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-35-turbo",
      "o1-preview",
      "o1-mini",
    ],
    keyPrefix: "",
    keyPlaceholder: "Azure API key",
  },
  {
    id: "aws-bedrock",
    name: "AWS Bedrock",
    icon: SiAmazon,
    color: "text-[#ff9900]",
    bgColor: "bg-[#ff9900]/10",
    models: [
      "anthropic.claude-sonnet-4-20250514-v1:0",
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "anthropic.claude-3-5-haiku-20241022-v1:0",
      "anthropic.claude-3-opus-20240229-v1:0",
      "meta.llama3-1-405b-instruct-v1:0",
      "meta.llama3-1-70b-instruct-v1:0",
      "mistral.mistral-large-2407-v1:0",
      "amazon.nova-pro-v1:0",
      "amazon.nova-lite-v1:0",
      "amazon.nova-micro-v1:0",
      "cohere.command-r-plus-v1:0",
    ],
    keyPrefix: "",
    keyPlaceholder: "AWS Access Key ID",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: Cpu,
    color: "text-[#6c5ce7]",
    bgColor: "bg-[#6c5ce7]/10",
    models: [
      "anthropic/claude-sonnet-4",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "openai/o3-mini",
      "google/gemini-2.5-pro-preview",
      "google/gemini-2.0-flash",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-chat",
      "mistralai/mistral-large",
      "qwen/qwen-2.5-72b-instruct",
    ],
    keyPrefix: "sk-or-",
    keyPlaceholder: "sk-or-...",
  },
  {
    id: "custom",
    name: "Custom / Local",
    icon: Cpu,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    models: [],
    keyPrefix: "",
    keyPlaceholder: "API key or leave blank for local",
  },
];

interface ProviderFormState {
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  enabled: boolean;
  showKey: boolean;
  dirty: boolean;
}

const DEFAULT_STATE: ProviderFormState = {
  apiKey: "",
  model: "",
  temperature: 70,
  topP: 90,
  topK: 40,
  maxTokens: 4096,
  enabled: false,
  showKey: false,
  dirty: false,
};

export default function Settings() {
  const { toast } = useToast();
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ProviderFormState>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery<LlmSetting[]>({
    queryKey: ["/api/settings/llm"],
  });

  const settingForProvider = useCallback((provider: string): ProviderFormState => {
    const s = settings?.find((x) => x.provider === provider);
    return {
      apiKey: s?.apiKey || "",
      model: s?.model || "",
      temperature: s?.temperature ?? 70,
      topP: s?.topP ?? 90,
      topK: s?.topK ?? 40,
      maxTokens: s?.maxTokens ?? 4096,
      enabled: s?.enabled ?? false,
      showKey: false,
      dirty: false,
    };
  }, [settings]);

  const getForm = (provider: string): ProviderFormState => {
    return forms[provider] || settingForProvider(provider);
  };

  const updateForm = (provider: string, patch: Partial<ProviderFormState>) => {
    setForms((prev) => {
      const base = prev[provider] || settingForProvider(provider);
      return { ...prev, [provider]: { ...base, ...patch, dirty: true } };
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ provider, payload }: { provider: string; payload?: Partial<ProviderFormState> }) => {
      const form = payload || forms[provider] || settingForProvider(provider);
      await apiRequest("PUT", "/api/settings/llm", {
        provider,
        apiKey: form.apiKey,
        model: form.model,
        temperature: form.temperature,
        topP: form.topP,
        topK: form.topK,
        maxTokens: form.maxTokens,
        enabled: form.enabled,
      });
    },
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/llm"] });
      setForms((prev) => {
        const updated = { ...prev };
        delete updated[provider];
        return updated;
      });
      toast({ title: "Settings saved", description: `${provider} configuration updated` });
      if (addingProvider === provider) setAddingProvider(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/settings/llm/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/llm"] });
      toast({ title: "Provider removed" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (provider: string) => {
      setTestingProvider(provider);
      const form = forms[provider] || DEFAULT_STATE;
      const res = await apiRequest("POST", "/api/settings/llm/test", {
        provider,
        apiKey: form.apiKey,
        model: form.model,
      });
      return res.json();
    },
    onSuccess: (data: { success: boolean; message: string }, provider) => {
      setTestingProvider(null);
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setTestingProvider(null);
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const configuredProviders = settings?.map((s) => s.provider) || [];
  const availableProviders = PROVIDERS.filter((p) => !configuredProviders.includes(p.id));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Triangle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-settings-title">Settings</h1>
              <p className="text-xs text-muted-foreground">LLM providers & inference parameters</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">LLM Configuration</h2>
          <p className="text-muted-foreground">
            Configure API keys and model parameters for AI-powered code analysis features
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-6 bg-muted rounded w-40" /></CardHeader>
                <CardContent><div className="h-32 bg-muted rounded" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {settings?.map((setting) => {
              const providerInfo = PROVIDERS.find((p) => p.id === setting.provider) || PROVIDERS[3];
              const Icon = providerInfo.icon;
              const currentForm = getForm(setting.provider);

              return (
                <Card key={setting.id} data-testid={`card-provider-${setting.provider}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${providerInfo.bgColor} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${providerInfo.color}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{providerInfo.name}</CardTitle>
                          <CardDescription>
                            {setting.model && <Badge variant="secondary" className="text-xs mr-2" data-testid={`badge-model-${setting.provider}`}>{setting.model}</Badge>}
                            {setting.enabled ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 text-xs" data-testid={`badge-enabled-${setting.provider}`}>Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-disabled-${setting.provider}`}>Inactive</Badge>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          data-testid={`switch-enabled-${setting.provider}`}
                          checked={currentForm.enabled}
                          onCheckedChange={(checked) => updateForm(setting.provider, { enabled: checked })}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" data-testid={`button-delete-${setting.provider}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {providerInfo.name}?</AlertDialogTitle>
                              <AlertDialogDescription>This will delete the API key and all settings for this provider.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(setting.id)} className="bg-destructive text-destructive-foreground">
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`key-${setting.provider}`} className="flex items-center gap-2">
                          <Key className="w-3.5 h-3.5" /> API Key
                        </Label>
                        <div className="relative">
                          <Input
                            id={`key-${setting.provider}`}
                            data-testid={`input-apikey-${setting.provider}`}
                            type={currentForm.showKey ? "text" : "password"}
                            value={currentForm.apiKey}
                            onChange={(e) => updateForm(setting.provider, { apiKey: e.target.value })}
                            placeholder={providerInfo.keyPlaceholder}
                            className="pr-10 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 text-muted-foreground"
                            onClick={() => updateForm(setting.provider, { showKey: !currentForm.showKey })}
                            data-testid={`button-togglekey-${setting.provider}`}
                          >
                            {currentForm.showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`model-${setting.provider}`} className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5" /> Model
                        </Label>
                        {providerInfo.models.length > 0 ? (
                          <Select
                            value={currentForm.model}
                            onValueChange={(val) => updateForm(setting.provider, { model: val })}
                          >
                            <SelectTrigger data-testid={`select-model-${setting.provider}`}>
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {providerInfo.models.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`model-${setting.provider}`}
                            data-testid={`input-model-${setting.provider}`}
                            value={currentForm.model}
                            onChange={(e) => updateForm(setting.provider, { model: e.target.value })}
                            placeholder="model-name or endpoint"
                          />
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4" /> Inference Parameters
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Temperature</Label>
                            <span className="text-sm font-mono text-muted-foreground" data-testid={`text-temp-${setting.provider}`}>
                              {(currentForm.temperature / 100).toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            data-testid={`slider-temp-${setting.provider}`}
                            value={[currentForm.temperature]}
                            onValueChange={([v]) => updateForm(setting.provider, { temperature: v })}
                            min={0}
                            max={200}
                            step={1}
                          />
                          <p className="text-xs text-muted-foreground">
                            Controls randomness. Lower = more focused, higher = more creative.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Top P (Nucleus Sampling)</Label>
                            <span className="text-sm font-mono text-muted-foreground" data-testid={`text-topp-${setting.provider}`}>
                              {(currentForm.topP / 100).toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            data-testid={`slider-topp-${setting.provider}`}
                            value={[currentForm.topP]}
                            onValueChange={([v]) => updateForm(setting.provider, { topP: v })}
                            min={0}
                            max={100}
                            step={1}
                          />
                          <p className="text-xs text-muted-foreground">
                            Cumulative probability cutoff for token selection.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Top K</Label>
                            <span className="text-sm font-mono text-muted-foreground" data-testid={`text-topk-${setting.provider}`}>
                              {currentForm.topK}
                            </span>
                          </div>
                          <Slider
                            data-testid={`slider-topk-${setting.provider}`}
                            value={[currentForm.topK]}
                            onValueChange={([v]) => updateForm(setting.provider, { topK: v })}
                            min={1}
                            max={100}
                            step={1}
                          />
                          <p className="text-xs text-muted-foreground">
                            Limits token choices to top K most probable tokens.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Max Tokens</Label>
                            <span className="text-sm font-mono text-muted-foreground" data-testid={`text-maxtokens-${setting.provider}`}>
                              {currentForm.maxTokens.toLocaleString()}
                            </span>
                          </div>
                          <Slider
                            data-testid={`slider-maxtokens-${setting.provider}`}
                            value={[currentForm.maxTokens]}
                            onValueChange={([v]) => updateForm(setting.provider, { maxTokens: v })}
                            min={256}
                            max={32768}
                            step={256}
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum number of tokens in the response.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(setting.provider)}
                        disabled={testingProvider === setting.provider || !currentForm.apiKey}
                        data-testid={`button-test-${setting.provider}`}
                        className="gap-2"
                      >
                        {testingProvider === setting.provider ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <TestTube className="w-4 h-4" />
                        )}
                        Test Connection
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate({ provider: setting.provider })}
                        disabled={saveMutation.isPending}
                        data-testid={`button-save-${setting.provider}`}
                        className="gap-2"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {addingProvider && (
              <Card data-testid="card-add-provider">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Add LLM Provider</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setAddingProvider(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {availableProviders.map((p) => {
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          data-testid={`button-select-provider-${p.id}`}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer`}
                          onClick={() => {
                            const defaultModel = p.models[0] || "";
                            const payload = { ...DEFAULT_STATE, model: defaultModel };
                            setForms((prev) => ({
                              ...prev,
                              [p.id]: { ...payload, dirty: true },
                            }));
                            saveMutation.mutate({ provider: p.id, payload });
                          }}
                        >
                          <div className={`w-10 h-10 rounded-lg ${p.bgColor} flex items-center justify-center`}>
                            <Icon className={`w-5 h-5 ${p.color}`} />
                          </div>
                          <span className="text-sm font-medium">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {!addingProvider && availableProviders.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setAddingProvider("select")}
                className="gap-2 w-full py-6 border-dashed"
                data-testid="button-add-provider"
              >
                <Plus className="w-4 h-4" />
                Add LLM Provider
              </Button>
            )}
          </>
        )}

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-medium mb-1">About LLM Integration</h4>
                <p className="text-sm text-muted-foreground">
                  LLM providers power AI-assisted features like natural language code explanations,
                  architecture recommendations, and intelligent SPARQL query generation.
                  The analysis pipeline itself is fully rule-based and does not require an LLM.
                  API keys are stored securely on the server and never sent to the browser in plain text.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
