"use client";

import { useMemo } from "react";
import type { PipelineEvent } from "@repo/core";
import { PIPELINE_NODES, PIPELINE_EDGES } from "@/lib/pipeline-graph";
import { useLang } from "./providers";

type NodeStatus = "idle" | "running" | "complete" | "error" | "skipped";

interface PipelineDAGProps {
  events: PipelineEvent[];
  onNodeClick?: (nodeId: string) => void;
  selectedNode?: string | null;
}

// ── Layout constants ──────────────────────────────────────
const NODE_W = 108;
const NODE_H = 52;
const GAP_X = 36;
const GAP_Y = 28;
const PAD_X = 32;
const PAD_Y = 24;

function nodeCenter(col: number, row: number) {
  return {
    cx: PAD_X + col * (NODE_W + GAP_X) + NODE_W / 2,
    cy: PAD_Y + row * (NODE_H + GAP_Y) + NODE_H / 2,
  };
}

// ── Derive node statuses from events ──────────────────────
function deriveStatuses(events: PipelineEvent[]): Map<string, { status: NodeStatus; score?: number; durationMs?: number }> {
  const map = new Map<string, { status: NodeStatus; score?: number; durationMs?: number }>();

  for (const e of events) {
    switch (e.type) {
      case "node_start": {
        const existing = map.get(e.node);
        map.set(e.node, { ...existing, status: "running" });
        break;
      }
      case "node_end": {
        const existing = map.get(e.node);
        map.set(e.node, { ...existing, status: "complete", durationMs: e.durationMs });
        break;
      }
      case "prm_score": {
        const existing = map.get(e.node);
        if (existing) existing.score = e.score;
        else map.set(e.node, { status: "complete", score: e.score });
        break;
      }
      case "error": {
        const existing = map.get(e.node);
        if (existing) existing.status = "error";
        else map.set(e.node, { status: "error" });
        break;
      }
    }
  }
  return map;
}

// ── SVG edge path builder ─────────────────────────────────
function edgePath(fromCol: number, fromRow: number, toCol: number, toRow: number): string {
  const from = nodeCenter(fromCol, fromRow);
  const to = nodeCenter(toCol, toRow);

  // Self-loop (retry)
  if (fromCol === toCol && fromRow === toRow) {
    const top = from.cy - NODE_H / 2;
    return `M ${from.cx + 20} ${top} C ${from.cx + 20} ${top - 30}, ${from.cx - 20} ${top - 30}, ${from.cx - 20} ${top}`;
  }

  const x1 = from.cx + NODE_W / 2;
  const y1 = from.cy;
  const x2 = to.cx - NODE_W / 2;
  const y2 = to.cy;

  // Straight horizontal
  if (fromRow === toRow) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Curved for cross-row edges
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

// ── Status colors ─────────────────────────────────────────
function statusFill(status: NodeStatus): string {
  switch (status) {
    case "running": return "var(--primary)";
    case "complete": return "var(--success)";
    case "error": return "var(--destructive)";
    case "skipped": return "var(--muted-foreground)";
    default: return "var(--border)";
  }
}

function statusStroke(status: NodeStatus): string {
  switch (status) {
    case "running": return "var(--primary)";
    case "complete": return "var(--success)";
    case "error": return "var(--destructive)";
    default: return "var(--border)";
  }
}

function statusTextColor(status: NodeStatus): string {
  switch (status) {
    case "running": return "var(--primary-foreground)";
    case "complete": return "#ffffff";
    case "error": return "#ffffff";
    default: return "var(--foreground)";
  }
}

function scoreBadgeColor(score: number): string {
  if (score >= 7) return "var(--success)";
  if (score >= 5) return "var(--warning)";
  return "var(--destructive)";
}

// ── Node icons (simple SVG paths) ─────────────────────────
const NODE_ICONS: Record<string, string> = {
  planning: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  notionContext: "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm4 0h8M8 11h8M8 15h4",
  research: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  analysis: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  risk: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  report: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  reflexion: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  delivery: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
  finalize: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

// ── Component ─────────────────────────────────────────────
export function PipelineDAG({ events, onNodeClick, selectedNode }: PipelineDAGProps) {
  const { locale } = useLang();
  const isZh = locale === "zh";

  const statuses = useMemo(() => deriveStatuses(events), [events]);
  const nodeMap = useMemo(() => new Map(PIPELINE_NODES.map((n) => [n.id, n])), []);

  const maxCol = Math.max(...PIPELINE_NODES.map((n) => n.col));
  const maxRow = Math.max(...PIPELINE_NODES.map((n) => n.row));
  const svgW = PAD_X * 2 + (maxCol + 1) * NODE_W + maxCol * GAP_X;
  const svgH = PAD_Y * 2 + (maxRow + 1) * NODE_H + maxRow * GAP_Y;

  // Count reflexion retries for badge
  const reflexionRetries = events.filter((e) => e.type === "reflexion" && e.shouldRetry).length;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full min-w-[720px]"
        style={{ maxHeight: 180 }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 7"
            refX="9"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="var(--muted-foreground)" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 7"
            refX="9"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="var(--primary)" />
          </marker>
        </defs>

        {/* ── Edges ─────────────────────── */}
        {PIPELINE_EDGES.map((edge, i) => {
          const fromNode = nodeMap.get(edge.from)!;
          const toNode = nodeMap.get(edge.to)!;
          const d = edgePath(fromNode.col, fromNode.row, toNode.col, toNode.row);
          const fromStatus = statuses.get(edge.from)?.status ?? "idle";
          const isActive = fromStatus === "complete";

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={isActive ? "var(--primary)" : "var(--border)"}
                strokeWidth={1.5}
                strokeDasharray={edge.dashed ? "5,4" : undefined}
                markerEnd={edge.from === edge.to ? undefined : `url(#${isActive ? "arrow-active" : "arrow"})`}
                opacity={edge.dashed ? 0.5 : 0.8}
              />
              {edge.condition && edge.from !== edge.to && (
                <text
                  x={((nodeCenter(fromNode.col, fromNode.row).cx + nodeCenter(toNode.col, toNode.row).cx) / 2)}
                  y={((nodeCenter(fromNode.col, fromNode.row).cy + nodeCenter(toNode.col, toNode.row).cy) / 2) - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fill="var(--muted-foreground)"
                  opacity={0.7}
                >
                  {isZh ? edge.conditionZh : edge.condition}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Nodes ─────────────────────── */}
        {PIPELINE_NODES.map((node) => {
          const { cx, cy } = nodeCenter(node.col, node.row);
          const x = cx - NODE_W / 2;
          const y = cy - NODE_H / 2;
          const info = statuses.get(node.id);
          const status: NodeStatus = info?.status ?? "idle";
          const isSelected = selectedNode === node.id;

          return (
            <g
              key={node.id}
              onClick={() => onNodeClick?.(node.id)}
              style={{ cursor: "pointer" }}
              className={status === "running" ? "pipeline-node-active" : ""}
            >
              {/* Node background */}
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={status === "idle" ? "var(--card)" : statusFill(status)}
                stroke={isSelected ? "var(--ring)" : statusStroke(status)}
                strokeWidth={isSelected ? 2 : 1.5}
                opacity={status === "idle" ? 0.6 : 1}
              />

              {/* Pulse animation ring for running nodes */}
              {status === "running" && (
                <rect
                  x={x - 2}
                  y={y - 2}
                  width={NODE_W + 4}
                  height={NODE_H + 4}
                  rx={12}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  className="pipeline-pulse-ring"
                />
              )}

              {/* Icon */}
              <svg x={x + 8} y={cy - 8} width={16} height={16} viewBox="0 0 24 24">
                <path
                  d={NODE_ICONS[node.id] ?? ""}
                  fill="none"
                  stroke={status === "idle" ? "var(--muted-foreground)" : statusTextColor(status)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Label */}
              <text
                x={x + 28}
                y={cy + 1}
                fontSize={11}
                fontWeight={600}
                fill={status === "idle" ? "var(--muted-foreground)" : statusTextColor(status)}
                dominantBaseline="middle"
              >
                {isZh ? node.labelZh : node.label}
              </text>

              {/* PRM score badge */}
              {info?.score != null && (
                <g>
                  <rect
                    x={x + NODE_W - 32}
                    y={y - 8}
                    width={30}
                    height={16}
                    rx={8}
                    fill={scoreBadgeColor(info.score)}
                  />
                  <text
                    x={x + NODE_W - 17}
                    y={y + 1}
                    fontSize={9}
                    fontWeight={700}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {info.score.toFixed(1)}
                  </text>
                </g>
              )}

              {/* Reflexion retry badge */}
              {node.id === "reflexion" && reflexionRetries > 0 && (
                <g>
                  <circle
                    cx={x + NODE_W - 4}
                    cy={y + NODE_H - 4}
                    r={9}
                    fill="var(--warning)"
                  />
                  <text
                    x={x + NODE_W - 4}
                    y={y + NODE_H - 3}
                    fontSize={9}
                    fontWeight={700}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {reflexionRetries}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
