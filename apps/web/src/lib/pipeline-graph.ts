/**
 * Pipeline DAG topology — mirrors the LangGraph workflow in packages/core.
 * Used by PipelineDAG component for visualization.
 */

export interface PipelineNode {
  id: string;
  label: string;
  labelZh: string;
  description: string;
  /** Column position (0-based) */
  col: number;
  /** Row position (0 = main flow, 1 = branch) */
  row: number;
}

export interface PipelineEdge {
  from: string;
  to: string;
  /** Label for conditional edges */
  condition?: string;
  conditionZh?: string;
  /** Dashed style for conditional/retry paths */
  dashed?: boolean;
}

export const PIPELINE_NODES: PipelineNode[] = [
  { id: "planning", label: "Planning", labelZh: "规划", description: "Dynamic task planning via LLM", col: 0, row: 0 },
  { id: "notionContext", label: "Context", labelZh: "上下文", description: "Fetch historical analyses from Notion", col: 1, row: 0 },
  { id: "research", label: "Research", labelZh: "研究", description: "3 agents: web researcher, data collector, synthesizer", col: 2, row: 0 },
  { id: "analysis", label: "Analysis", labelZh: "分析", description: "3 parallel analysts: financial, market, tech", col: 3, row: 0 },
  { id: "risk", label: "Risk", labelZh: "风险", description: "Multi-dimensional risk scoring", col: 4, row: 1 },
  { id: "report", label: "Report", labelZh: "报告", description: "Investment report generation (EN/ZH)", col: 5, row: 0 },
  { id: "reflexion", label: "Reflexion", labelZh: "反思", description: "Self-evaluation with quality scoring", col: 6, row: 0 },
  { id: "delivery", label: "Delivery", labelZh: "交付", description: "Save to Notion + send email", col: 7, row: 0 },
  { id: "finalize", label: "Finalize", labelZh: "完成", description: "PRM summary + cost report", col: 8, row: 0 },
];

export const PIPELINE_EDGES: PipelineEdge[] = [
  { from: "planning", to: "notionContext" },
  { from: "notionContext", to: "research" },
  { from: "research", to: "analysis" },
  { from: "research", to: "research", condition: "retry", conditionZh: "重试", dashed: true },
  { from: "research", to: "report", condition: "degrade", conditionZh: "降级", dashed: true },
  { from: "analysis", to: "risk", condition: "full", conditionZh: "完整" },
  { from: "analysis", to: "report", condition: "quick", conditionZh: "快速", dashed: true },
  { from: "risk", to: "report" },
  { from: "report", to: "reflexion" },
  { from: "reflexion", to: "delivery", condition: "pass", conditionZh: "通过" },
  { from: "reflexion", to: "report", condition: "retry", conditionZh: "重试", dashed: true },
  { from: "delivery", to: "finalize" },
];

/** Total number of unique nodes in the main pipeline flow */
export const TOTAL_NODES = PIPELINE_NODES.length;

/** Ordered list of node IDs for progress tracking (main flow) */
export const NODE_ORDER = [
  "planning", "notionContext", "research", "analysis",
  "risk", "report", "reflexion", "delivery", "finalize",
];
