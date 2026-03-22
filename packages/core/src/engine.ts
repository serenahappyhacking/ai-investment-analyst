/**
 * Analysis Engine — Main entry point for the core package.
 * =========================================================
 * Wraps the LangGraph workflow with a clean API for consumers
 * (CLI, Web API, background jobs).
 */

import { runWorkflow } from "./graph/workflow.js";
import type { AgentState, PipelineEvent } from "./types/index.js";

export interface AnalysisParams {
  company: string;
  query?: string;
  mode?: "quick" | "full";
  stream?: boolean;
  /** Callback for real-time pipeline events (for SSE streaming, UI visualization) */
  onEvent?: (event: PipelineEvent) => void;
}

export interface AnalysisResult {
  company: string;
  reportEn: string;
  reportZh?: string;
  qualityScore: number;
  riskScore: number;
  financialData?: Record<string, unknown>;
  phases: string[];
  logs: string[];
  errors: string[];
  events: PipelineEvent[];
}

/**
 * Run a full investment analysis pipeline.
 * This is the primary API for both CLI and web consumers.
 */
export async function runAnalysis(params: AnalysisParams): Promise<AnalysisResult> {
  const { company, query, mode = "full", stream = true, onEvent } = params;

  const collectedEvents: PipelineEvent[] = [];
  const state = await runWorkflow({
    company,
    query: query ?? `Comprehensive investment analysis of ${company}`,
    mode,
    stream,
    onEvent: (event) => {
      collectedEvents.push(event);
      if (onEvent) onEvent(event);
    },
  });

  const report = state.finalReport || state.draftReport || "";

  // Generate Chinese translation
  let reportZh: string | undefined;
  try {
    const { ReportWriterAgent } = await import("./agents/reportWriter.js");
    const writer = new ReportWriterAgent();
    reportZh = await writer.translate(report);
  } catch {
    // Translation is non-fatal
  }

  return {
    company,
    reportEn: report,
    reportZh,
    qualityScore: state.qualityScore ?? 0,
    riskScore: state.riskScore ?? 0,
    financialData: state.researchData,
    phases: state.logs?.filter((l: string) => l.includes("Phase:")) ?? [],
    logs: state.logs ?? [],
    errors: state.errors ?? [],
    events: collectedEvents,
  };
}
