import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, X, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";
import pako from "pako";

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return "-";
  if (b === 1) return "_";
  return "?";
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3F;
  return encode6bit(c1 & 0x3F) + encode6bit(c2 & 0x3F) + encode6bit(c3 & 0x3F) + encode6bit(c4 & 0x3F);
}

function plantumlEncode(text: string): string {
  const data = pako.deflateRaw(new TextEncoder().encode(text), { level: 9 });
  let encoded = "";
  for (let i = 0; i < data.length; i += 3) {
    const b1 = data[i];
    const b2 = i + 1 < data.length ? data[i + 1] : 0;
    const b3 = i + 2 < data.length ? data[i + 2] : 0;
    encoded += append3bytes(b1, b2, b3);
  }
  return encoded;
}

export function PlantUmlDiagram({ code, diagramKey }: { code: string; diagramKey: string }) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const encoded = plantumlEncode(code);
    const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;

    setLoading(true);
    setError(null);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`PlantUML server returned ${res.status}`);
        const text = await res.text();
        setSvgContent(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 bg-white dark:bg-zinc-900 rounded-md border border-border" data-testid={`plantuml-loading-${diagramKey}`}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Rendering PlantUML diagram...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/30 text-sm" data-testid={`plantuml-error-${diagramKey}`}>
        PlantUML rendering failed: {error}
        <pre className="mt-2 text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-md border border-border p-4 overflow-auto"
      data-testid={`plantuml-diagram-${diagramKey}`}
      dangerouslySetInnerHTML={{ __html: svgContent || "" }}
    />
  );
}

export function MermaidDiagram({ code, diagramKey }: { code: string; diagramKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      setLoading(true);
      setError(null);
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        fontFamily: "Open Sans, sans-serif",
        suppressErrorRendering: true,
      });
      const sanitized = code
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\r\n/g, '\n');
      const uniqueId = `mermaid-${diagramKey}-${Date.now()}`;
      const { svg } = await mermaid.render(uniqueId, sanitized);
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Mermaid rendering failed");
      setLoading(false);
    }
  }, [code, diagramKey]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/30 text-sm" data-testid={`mermaid-error-${diagramKey}`}>
        Mermaid rendering failed: {error}
        <pre className="mt-2 text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="flex items-center justify-center py-8 bg-white dark:bg-zinc-900 rounded-md border border-border" data-testid={`mermaid-loading-${diagramKey}`}>
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Rendering Mermaid diagram...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="bg-white dark:bg-zinc-900 rounded-md border border-border p-4 overflow-auto"
        data-testid={`mermaid-diagram-${diagramKey}`}
        style={loading ? { display: "none" } : undefined}
      />
    </div>
  );
}

function DiagramFloatingWindow({
  type,
  code,
  onClose,
}: {
  type: "plantuml" | "mermaid";
  code: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(Math.max(z + delta, 0.25), 5));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
  }, [position]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [dragging]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${type === "plantuml" ? "PlantUML" : "Mermaid"} Diagram Viewer`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="diagram-floating-window"
    >
      <div className="bg-background border border-border rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <span className="text-sm font-medium">
            {type === "plantuml" ? "PlantUML" : "Mermaid"} Diagram Viewer
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleZoomOut}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center" data-testid="text-zoom-level">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleZoomIn}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleReset}
              data-testid="button-zoom-reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClose}
              data-testid="button-close-floating"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing bg-white dark:bg-zinc-900"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 0.1s ease",
            }}
          >
            <div className="p-8">
              {type === "plantuml" ? (
                <PlantUmlDiagram code={code} diagramKey="floating" />
              ) : (
                <MermaidDiagram code={code} diagramKey="floating" />
              )}
            </div>
          </div>
        </div>
        <div className="px-4 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground shrink-0">
          Scroll to zoom · Drag to pan · Press Escape to close
        </div>
      </div>
    </div>
  );
}

interface DiagramBlockProps {
  type: "plantuml" | "mermaid";
  code: string;
  index: number;
}

export function DiagramBlock({ type, code, index }: DiagramBlockProps) {
  const [viewMode, setViewMode] = useState<"diagram" | "source">("diagram");
  const [floatingOpen, setFloatingOpen] = useState(false);
  const label = type === "plantuml" ? "PlantUML" : "Mermaid";

  return (
    <>
      <div className="mb-4" data-testid={`diagram-block-${type}-${index}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className="flex gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setFloatingOpen(true)}
              title="Open in fullscreen viewer"
              data-testid={`button-fullscreen-${index}`}
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
            <Button
              variant={viewMode === "diagram" ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setViewMode("diagram")}
              data-testid={`button-view-diagram-${index}`}
            >
              Diagram
            </Button>
            <Button
              variant={viewMode === "source" ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setViewMode("source")}
              data-testid={`button-view-source-${index}`}
            >
              Source
            </Button>
          </div>
        </div>
        <div
          onDoubleClick={() => setFloatingOpen(true)}
          className="cursor-pointer"
          title="Double-click to open in fullscreen"
        >
          {viewMode === "diagram" ? (
            type === "plantuml" ? (
              <PlantUmlDiagram code={code} diagramKey={`${index}`} />
            ) : (
              <MermaidDiagram code={code} diagramKey={`${index}`} />
            )
          ) : (
            <pre className="bg-muted/50 rounded-md p-3 text-xs overflow-x-auto border border-border whitespace-pre-wrap">
              <code>{code}</code>
            </pre>
          )}
        </div>
      </div>
      {floatingOpen && (
        <DiagramFloatingWindow
          type={type}
          code={code}
          onClose={() => setFloatingOpen(false)}
        />
      )}
    </>
  );
}

export type DiagramFilter = "plantuml" | "mermaid" | "both";

export function DiagramFilterToggle({
  filter,
  onChange,
}: {
  filter: DiagramFilter;
  onChange: (f: DiagramFilter) => void;
}) {
  const showPlantUml = filter === "plantuml" || filter === "both";
  const showMermaid = filter === "mermaid" || filter === "both";

  const handlePlantUml = (checked: boolean) => {
    if (checked && showMermaid) onChange("both");
    else if (checked && !showMermaid) onChange("plantuml");
    else if (!checked && showMermaid) onChange("mermaid");
    else onChange("both");
  };

  const handleMermaid = (checked: boolean) => {
    if (checked && showPlantUml) onChange("both");
    else if (checked && !showPlantUml) onChange("mermaid");
    else if (!checked && showPlantUml) onChange("plantuml");
    else onChange("both");
  };

  return (
    <div className="flex items-center gap-4 px-1" data-testid="diagram-filter-toggle">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <Checkbox
          checked={showPlantUml}
          onCheckedChange={(v) => handlePlantUml(!!v)}
          data-testid="checkbox-plantuml"
        />
        <span className="text-xs font-medium">PlantUML</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <Checkbox
          checked={showMermaid}
          onCheckedChange={(v) => handleMermaid(!!v)}
          data-testid="checkbox-mermaid"
        />
        <span className="text-xs font-medium">Mermaid</span>
      </label>
    </div>
  );
}
