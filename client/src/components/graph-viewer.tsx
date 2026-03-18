import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Network, ZoomIn, ZoomOut, Search, Filter, Maximize2, X, RotateCcw
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
}

const NODE_COLORS: Record<string, string> = {
  unit: "#3b82f6",
  program: "#8b5cf6",
  library: "#6366f1",
  class: "#10b981",
  interface: "#f59e0b",
  record: "#ef4444",
  procedure: "#06b6d4",
  function: "#14b8a6",
  field: "#94a3b8",
  property: "#f97316",
  constant: "#6b7280",
  variable: "#78716c",
  unknown: "#9ca3af",
};

interface Props {
  projectId: string;
}

function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasWidth: number,
  canvasHeight: number
) {
  const simNodesRef = useRef<SimNode[]>([]);
  const runningRef = useRef(true);
  const alphaRef = useRef(1);
  const frameRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const nodeMap = new Map<string, SimNode>();
    const existing = new Map(simNodesRef.current.map(n => [n.id, n]));

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    const simNodes: SimNode[] = nodes.map((n, i) => {
      const prev = existing.get(n.id);
      if (prev) {
        prev.label = n.label;
        prev.type = n.type;
        return prev;
      }
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      const r = 100 + Math.random() * 200;
      return {
        ...n,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
      };
    });

    simNodes.forEach(n => nodeMap.set(n.id, n));
    simNodesRef.current = simNodes;
    alphaRef.current = 1;
    runningRef.current = true;

    const edgeIndex = edges.map(e => ({
      source: nodeMap.get(e.source),
      target: nodeMap.get(e.target),
      label: e.label,
    })).filter(e => e.source && e.target) as {
      source: SimNode;
      target: SimNode;
      label: string;
    }[];

    let frame = 0;
    let idleFrames = 0;
    const simulate = () => {
      if (alphaRef.current < 0.005 && !runningRef.current) {
        idleFrames++;
        if (idleFrames > 60) return;
        frameRef.current = requestAnimationFrame(simulate);
        return;
      }
      if (alphaRef.current < 0.005) {
        runningRef.current = false;
        idleFrames = 0;
        frameRef.current = requestAnimationFrame(simulate);
        return;
      }
      idleFrames = 0;

      const alpha = alphaRef.current;
      const decay = 0.992;
      alphaRef.current = Math.max(alpha * decay, 0.001);

      const sNodes = simNodesRef.current;
      const repulsion = 800;
      const attraction = 0.005;
      const centerStrength = 0.01;
      const damping = 0.85;

      const maxPairwise = 500;
      if (sNodes.length <= maxPairwise) {
        for (let i = 0; i < sNodes.length; i++) {
          const a = sNodes[i];
          if (a.fx !== null) continue;
          for (let j = i + 1; j < sNodes.length; j++) {
            const b = sNodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (repulsion * alpha) / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            if (b.fx === null) {
              b.vx -= fx;
              b.vy -= fy;
            }
          }
        }
      } else {
        const cellSize = 80;
        const grid = new Map<string, SimNode[]>();
        for (const node of sNodes) {
          const gx = Math.floor(node.x / cellSize);
          const gy = Math.floor(node.y / cellSize);
          const key = `${gx},${gy}`;
          const arr = grid.get(key);
          if (arr) arr.push(node);
          else grid.set(key, [node]);
        }
        for (const node of sNodes) {
          if (node.fx !== null) continue;
          const gx = Math.floor(node.x / cellSize);
          const gy = Math.floor(node.y / cellSize);
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const neighbors = grid.get(`${gx + dx},${gy + dy}`);
              if (!neighbors) continue;
              for (const other of neighbors) {
                if (other === node) continue;
                let ddx = node.x - other.x;
                let ddy = node.y - other.y;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                if (dist > cellSize * 3) continue;
                const force = (repulsion * alpha) / (dist * dist);
                node.vx += (ddx / dist) * force;
                node.vy += (ddy / dist) * force;
              }
            }
          }
        }
      }

      for (const edge of edgeIndex) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = 120;
        const force = (dist - idealDist) * attraction * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (edge.source.fx === null) {
          edge.source.vx += fx;
          edge.source.vy += fy;
        }
        if (edge.target.fx === null) {
          edge.target.vx -= fx;
          edge.target.vy -= fy;
        }
      }

      for (const node of sNodes) {
        if (node.fx !== null) {
          node.x = node.fx;
          node.y = node.fy!;
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx += (cx - node.x) * centerStrength * alpha;
        node.vy += (cy - node.y) * centerStrength * alpha;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
      }

      frame++;
      if (frame % 2 === 0) {
        setTick(t => t + 1);
      }
      frameRef.current = requestAnimationFrame(simulate);
    };

    frameRef.current = requestAnimationFrame(simulate);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [nodes, edges, canvasWidth, canvasHeight]);

  return {
    simNodes: simNodesRef.current,
    running: runningRef,
    alpha: alphaRef,
    tick,
    reheat: () => { alphaRef.current = 1; runningRef.current = true; },
    pause: () => { runningRef.current = false; },
    resume: () => { runningRef.current = true; alphaRef.current = Math.max(alphaRef.current, 0.3); },
  };
}

function GraphCanvas({
  filteredData,
  canvasWidth,
  canvasHeight,
  zoom,
  setZoom,
  offset,
  setOffset,
  selectedNode,
  setSelectedNode,
  className,
  testIdPrefix = "",
}: {
  filteredData: { nodes: GraphNode[]; edges: GraphEdge[] };
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  offset: { x: number; y: number };
  setOffset: (o: { x: number; y: number } | ((o: { x: number; y: number }) => { x: number; y: number })) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (n: GraphNode | null) => void;
  className?: string;
  testIdPrefix?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [draggingNode, setDraggingNode] = useState<SimNode | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const sim = useForceSimulation(
    filteredData.nodes,
    filteredData.edges,
    canvasWidth,
    canvasHeight
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    const simNodes = sim.simNodes;
    const nodeMap = new Map(simNodes.map(n => [n.id, n]));

    for (const edge of filteredData.edges) {
      const from = nodeMap.get(edge.source);
      const to = nodeMap.get(edge.target);
      if (!from || !to) continue;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = "rgba(100,100,100,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      if (zoom > 1.2 && filteredData.edges.length < 300) {
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        ctx.fillStyle = "rgba(100,100,100,0.4)";
        ctx.font = "7px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(edge.label, mx, my - 3);
      }
    }

    for (const node of simNodes) {
      const color = NODE_COLORS[node.type] || NODE_COLORS.unknown;
      const isSelected = selectedNode?.id === node.id;
      const isDragged = draggingNode?.id === node.id;
      const radius = isSelected || isDragged ? 8 : 5;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected || isDragged) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const showLabels = simNodes.length < 300 ? zoom > 0.5 : zoom > 1;
      if (showLabels || isSelected) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.font = `${isSelected ? 11 : 9}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + radius + 13);
      }
    }

    ctx.restore();
  }, [filteredData, sim.tick, zoom, offset, selectedNode, draggingNode]);

  const screenToGraph = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / zoom,
      y: (clientY - rect.top - offset.y) / zoom,
    };
  }, [zoom, offset]);

  const findNodeAt = useCallback((gx: number, gy: number): SimNode | null => {
    const hitRadius = 12 / zoom;
    for (let i = sim.simNodes.length - 1; i >= 0; i--) {
      const node = sim.simNodes[i];
      const dx = node.x - gx;
      const dy = node.y - gy;
      if (Math.sqrt(dx * dx + dy * dy) < hitRadius) return node;
    }
    return null;
  }, [sim.simNodes, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const gp = screenToGraph(e.clientX, e.clientY);
    const node = findNodeAt(gp.x, gp.y);

    if (node) {
      setDraggingNode(node);
      node.fx = node.x;
      node.fy = node.y;
      setSelectedNode(node);
    } else {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offset };
    }
  }, [screenToGraph, findNodeAt, offset, setSelectedNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNode) {
      const gp = screenToGraph(e.clientX, e.clientY);
      draggingNode.fx = gp.x;
      draggingNode.fy = gp.y;
      draggingNode.x = gp.x;
      draggingNode.y = gp.y;
      sim.resume();
      return;
    }
    if (dragging) {
      setOffset({
        x: offsetStart.current.x + (e.clientX - dragStart.current.x),
        y: offsetStart.current.y + (e.clientY - dragStart.current.y),
      });
    }
  }, [dragging, draggingNode, screenToGraph, setOffset, sim]);

  const handleMouseUp = useCallback(() => {
    if (draggingNode) {
      draggingNode.fx = null;
      draggingNode.fy = null;
      setDraggingNode(null);
    }
    setDragging(false);
  }, [draggingNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z: number) => Math.min(Math.max(z + delta, 0.1), 5));
  }, [setZoom]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const gp = screenToGraph(e.clientX, e.clientY);
    const node = findNodeAt(gp.x, gp.y);
    if (node) {
      setSelectedNode(node);
    }
  }, [screenToGraph, findNodeAt, setSelectedNode]);

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        data-testid={`${testIdPrefix}canvas-graph`}
      />
    </div>
  );
}

function GraphFloatingWindow({
  filteredData,
  nodeTypes,
  filter,
  setFilter,
  search,
  setSearch,
  selectedNode,
  setSelectedNode,
  connectedEdges,
  onClose,
}: {
  filteredData: { nodes: GraphNode[]; edges: GraphEdge[] };
  nodeTypes: string[];
  filter: string;
  setFilter: (f: string) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (n: GraphNode | null) => void;
  connectedEdges: GraphEdge[];
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

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
      aria-label="Knowledge Graph Viewer"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="graph-floating-window"
    >
      <div className="bg-background border border-border rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Network className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Knowledge Graph</span>
            <span className="text-xs text-muted-foreground">
              {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search nodes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-7 text-xs w-40"
                data-testid="input-floating-graph-search"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-7 text-xs w-28" data-testid="select-floating-graph-filter">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {nodeTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-px h-5 bg-border" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setZoom(z => Math.max(z - 0.2, 0.1))}
              data-testid="button-floating-zoom-out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center"
              data-testid="text-floating-zoom-level">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setZoom(z => Math.min(z + 0.2, 5))}
              data-testid="button-floating-zoom-in">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
              data-testid="button-floating-zoom-reset">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}
              data-testid="button-close-graph-floating">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <GraphCanvas
            filteredData={filteredData}
            canvasWidth={1600}
            canvasHeight={1000}
            zoom={zoom}
            setZoom={(fn) => setZoom(prev => fn(prev))}
            offset={offset}
            setOffset={setOffset}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            className="flex-1"
            testIdPrefix="floating-"
          />

          <div className="w-56 border-l border-border bg-muted/20 flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-medium">Legend</p>
            </div>
            <ScrollArea className="flex-1 px-3 py-2">
              <div className="space-y-1">
                {Object.entries(NODE_COLORS).filter(([k]) => k !== "unknown").map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="capitalize text-muted-foreground">{type}</span>
                  </div>
                ))}
              </div>

              {selectedNode && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <p className="text-xs font-medium">Selected Node</p>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Label</p>
                    <p className="text-xs font-medium break-all">{selectedNode.label}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Type</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] }} />
                      <span className="text-xs capitalize">{selectedNode.type}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">URI</p>
                    <p className="text-[10px] font-mono text-muted-foreground break-all">{selectedNode.id}</p>
                  </div>
                  {connectedEdges.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">
                        Connections ({connectedEdges.length})
                      </p>
                      <div className="space-y-0.5">
                        {connectedEdges.map((edge, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground">
                            <span className="text-primary">{edge.label}</span>
                            {" → "}
                            <span>{edge.target === selectedNode.id ? edge.source.split(".").pop() : edge.target.split(".").pop()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
              Drag nodes to reposition · Scroll to zoom · Drag canvas to pan
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GraphViewer({ projectId }: Props) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [floatingOpen, setFloatingOpen] = useState(false);

  const { data: graphData, isLoading } = useQuery<GraphData>({
    queryKey: ["/api/projects/" + projectId + "/graph"],
  });

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    let nodes = graphData.nodes;
    let edges = graphData.edges;

    if (filter !== "all") {
      nodes = nodes.filter(n => n.type === filter);
      const nodeIds = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => nodeIds.has(e.source) || nodeIds.has(e.target));
      const edgeNodeIds = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
      nodes = graphData.nodes.filter(n => nodeIds.has(n.id) || edgeNodeIds.has(n.id));
    }

    if (search) {
      const term = search.toLowerCase();
      const matchedNodes = new Set(nodes.filter(n => n.label.toLowerCase().includes(term)).map(n => n.id));
      edges = edges.filter(e => matchedNodes.has(e.source) || matchedNodes.has(e.target));
      const connectedNodeIds = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
      nodes = nodes.filter(n => matchedNodes.has(n.id) || connectedNodeIds.has(n.id));
    }

    return { nodes, edges };
  }, [graphData, filter, search]);

  const nodeTypes = useMemo(() => {
    if (!graphData) return [];
    const types = new Set(graphData.nodes.map(n => n.type));
    return Array.from(types).sort();
  }, [graphData]);

  const connectedEdges = selectedNode
    ? filteredData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-9">
          <Card className="border-card-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                Knowledge Graph
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search nodes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs w-44"
                    data-testid="input-graph-search"
                  />
                </div>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="h-8 text-xs w-32" data-testid="select-graph-filter">
                    <Filter className="w-3 h-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {nodeTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setZoom(z => Math.min(z + 0.2, 5))}
                  data-testid="button-zoom-in">
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setZoom(z => Math.max(z - 0.2, 0.1))}
                  data-testid="button-zoom-out">
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setFloatingOpen(true)}
                  title="Open in fullscreen"
                  data-testid="button-graph-fullscreen">
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="h-[500px] flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Loading graph data...</p>
                </div>
              ) : filteredData.nodes.length === 0 ? (
                <div className="h-[500px] flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">No graph data available</p>
                </div>
              ) : (
                <GraphCanvas
                  filteredData={filteredData}
                  canvasWidth={800}
                  canvasHeight={600}
                  zoom={zoom}
                  setZoom={(fn) => setZoom(prev => fn(prev))}
                  offset={offset}
                  setOffset={setOffset}
                  selectedNode={selectedNode}
                  setSelectedNode={setSelectedNode}
                  className="h-[500px]"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-3">
          <Card className="border-card-border sticky top-24">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Legend</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-1.5">
                {Object.entries(NODE_COLORS).filter(([k]) => k !== "unknown").map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="capitalize text-muted-foreground">{type}</span>
                  </div>
                ))}
              </div>
            </CardContent>

            {selectedNode && (
              <>
                <div className="border-t border-border" />
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm">Selected Node</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4" data-testid="card-selected-node">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Label</p>
                      <p className="text-sm font-medium">{selectedNode.label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] }} />
                        <span className="text-sm capitalize">{selectedNode.type}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">URI</p>
                      <p className="text-[11px] font-mono text-muted-foreground break-all">{selectedNode.id}</p>
                    </div>
                    {connectedEdges.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Connections ({connectedEdges.length})</p>
                        <ScrollArea className="max-h-40">
                          <div className="space-y-0.5">
                            {connectedEdges.map((edge, i) => (
                              <div key={i} className="text-[11px] text-muted-foreground">
                                <span className="text-primary">{edge.label}</span>
                                {" → "}
                                <span>{edge.target === selectedNode?.id ? edge.source.split(".").pop() : edge.target.split(".").pop()}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>

      {floatingOpen && (
        <GraphFloatingWindow
          filteredData={filteredData}
          nodeTypes={nodeTypes}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          connectedEdges={connectedEdges}
          onClose={() => setFloatingOpen(false)}
        />
      )}
    </>
  );
}
