/**
 * LangGraph.js Workflow Builder
 * ===============================
 * Constructs the state machine that orchestrates all crews, agents, and skills.
 *
 * Architecture upgrades:
 *   - Error-aware routing: research/analysis failures trigger retries or degradation
 *   - PRM-based conditional edges: route based on step evaluation scores
 *   - Thread ID uses UUID to prevent concurrent state collision
 *
 * Graph:
 *   START → planning → notionContext → research →
 *   [error check] → analysis → [mode check] →
 *   [risk or report] → report → reflexion →
 *   [retry or delivery] → delivery → finalize → END
 */

import { randomUUID } from "crypto";
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentStateAnnotation, type AgentState, type PipelineEvent, type StepEvaluation } from "../types/index.js";
import { WorkflowConfig } from "../config.js";
import { globalCostTracker } from "../skills/costTracker.js";
import {
  planningNode,
  notionContextNode,
  researchNode,
  analysisNode,
  riskNode,
  reportNode,
  reflexionNode,
  deliveryNode,
  finalizeNode,
} from "./nodes.js";

// ═══════════════════════════════════════════════════════════════
// Conditional Edge Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Route after research based on PRM evaluation and error state.
 * - Blocked + retries available → retry research
 * - Blocked + max retries → degrade to report (partial data)
 * - OK → proceed to analysis
 */
export function routeAfterResearch(state: AgentState): "analysis" | "research" | "report" {
  if (state.currentPhase === "research_blocked") {
    const retries = state.researchRetries ?? 0;
    if (retries < 2) return "research"; // retry
    return "report"; // degrade: skip analysis, generate partial report
  }
  return "analysis";
}

/**
 * Route after analysis based on mode.
 * Quick mode skips risk assessment.
 */
export function shouldSkipRisk(state: AgentState): "risk" | "report" {
  return state.mode === "quick" ? "report" : "risk";
}

/**
 * Route after reflexion based on quality score and iteration count.
 */
export function routeAfterReflexion(state: AgentState): "report" | "delivery" {
  const score = state.qualityScore ?? 0;
  const iterations = state.iterationCount ?? 0;

  if (score >= WorkflowConfig.qualityThreshold) return "delivery";
  if (iterations < WorkflowConfig.maxIterations) return "report";
  return "delivery"; // Max iterations → ship it
}

// ═══════════════════════════════════════════════════════════════
// Build Workflow
// ═══════════════════════════════════════════════════════════════

export function buildWorkflow() {
  const graph = new StateGraph(AgentStateAnnotation)
    // ── Add Nodes ──────────────────────────────────────────
    .addNode("planning", planningNode)
    .addNode("notionContext", notionContextNode)
    .addNode("research", researchNode)
    .addNode("analysis", analysisNode)
    .addNode("risk", riskNode)
    .addNode("report", reportNode)
    .addNode("reflexion", reflexionNode)
    .addNode("delivery", deliveryNode)
    .addNode("finalize", finalizeNode)

    // ── Define Edges ───────────────────────────────────────
    .addEdge(START, "planning")
    .addEdge("planning", "notionContext")
    .addEdge("notionContext", "research")

    // Research → [error-aware routing]
    .addConditionalEdges("research", routeAfterResearch, {
      analysis: "analysis",
      research: "research",   // retry
      report: "report",       // degrade: skip analysis
    })

    // Analysis → Risk or Report (conditional on mode)
    .addConditionalEdges("analysis", shouldSkipRisk, {
      risk: "risk",
      report: "report",
    })
    .addEdge("risk", "report")

    // Report → Reflexion
    .addEdge("report", "reflexion")

    // Reflexion → Retry or Delivery
    .addConditionalEdges("reflexion", routeAfterReflexion, {
      report: "report",
      delivery: "delivery",
    })

    // Delivery → Finalize → END
    .addEdge("delivery", "finalize")
    .addEdge("finalize", END);

  // ── Compile with checkpointer ──────────────────────────
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// ═══════════════════════════════════════════════════════════════
// Run Workflow (with streaming)
// ═══════════════════════════════════════════════════════════════

export async function runWorkflow(params: {
  company: string;
  query?: string;
  mode?: "quick" | "full";
  stream?: boolean;
  onEvent?: (event: PipelineEvent) => void;
}): Promise<AgentState> {
  const { company, query, mode = "full", stream = true, onEvent } = params;

  const workflow = buildWorkflow();
  const pipelineStart = Date.now();

  const initialState: Partial<AgentState> = {
    company,
    query: query ?? `Comprehensive investment analysis of ${company}`,
    mode,
    researchData: {},
    researchSources: [],
    researchSummary: "",
    financialAnalysis: "",
    marketAnalysis: "",
    techAnalysis: "",
    riskAssessment: "",
    riskScore: 0,
    draftReport: "",
    finalReport: "",
    qualityScore: 0,
    qualityFeedback: "",
    humanFeedback: "",
    iterationCount: 0,
    researchRetries: 0,
    analysisRetries: 0,
    errors: [],
    logs: [],
    currentPhase: "initialized",
  };

  // UUID-based thread ID prevents concurrent state collision
  const config = {
    configurable: {
      thread_id: `analysis-${company.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
  };

  const emit = (event: PipelineEvent) => {
    if (onEvent) onEvent(event);
  };

  const ts = () => new Date().toISOString();

  if (stream) {
    let finalState: AgentState | undefined;
    let lastPhase = "initialized";

    for await (const event of await workflow.stream(initialState, config)) {
      for (const [nodeName, nodeOutput] of Object.entries(event)) {
        const nodeStart = Date.now();
        emit({ type: "node_start", node: nodeName, timestamp: ts() });

        const output = nodeOutput as Partial<AgentState>;

        // Emit logs
        const logs = output.logs ?? [];
        for (const log of logs) {
          console.log(`  ${log}`);
          emit({ type: "log", node: nodeName, message: log, timestamp: ts() });
        }

        // Emit phase change
        if (output.currentPhase && output.currentPhase !== lastPhase) {
          lastPhase = output.currentPhase;
          console.log(`  📍 Phase: ${output.currentPhase}`);
          emit({ type: "phase_change", phase: output.currentPhase, timestamp: ts() });
        }

        // Emit PRM scores from stepEvaluations
        if (output.stepEvaluations) {
          for (const evalStr of output.stepEvaluations) {
            try {
              const evaluation = JSON.parse(evalStr) as StepEvaluation;
              emit({
                type: "prm_score",
                node: evaluation.stepName ?? nodeName,
                score: evaluation.score,
                dimensions: evaluation.dimensions ?? {},
                recommendation: evaluation.recommendation ?? "proceed",
                timestamp: ts(),
              });
            } catch {
              // Non-JSON evaluation string, skip
            }
          }
        }

        // Emit reflexion data
        if (nodeName === "reflexion" && output.qualityScore != null) {
          emit({
            type: "reflexion",
            score: output.qualityScore,
            shouldRetry: output.qualityScore < WorkflowConfig.qualityThreshold
              && (output.iterationCount ?? 0) < WorkflowConfig.maxIterations,
            actionItems: output.qualityFeedback ? [output.qualityFeedback] : [],
            attempt: output.iterationCount ?? 1,
            timestamp: ts(),
          });
        }

        // Emit errors
        if (output.errors) {
          for (const err of output.errors) {
            emit({ type: "error", node: nodeName, message: err, timestamp: ts() });
          }
        }

        emit({ type: "node_end", node: nodeName, timestamp: ts(), durationMs: Date.now() - nodeStart });
      }
      finalState = Object.values(event)[0] as AgentState;
    }

    // Emit live cost data from global tracker
    emit({
      type: "cost_update",
      totalCost: globalCostTracker.totalCost,
      totalTokens: globalCostTracker.totalTokens,
      byAgent: globalCostTracker.getAgentCostMap(),
      timestamp: ts(),
    });

    // Emit pipeline complete
    emit({
      type: "pipeline_complete",
      qualityScore: finalState?.qualityScore ?? 0,
      riskScore: finalState?.riskScore ?? 0,
      durationMs: Date.now() - pipelineStart,
      timestamp: ts(),
    });

    return finalState!;
  } else {
    return (await workflow.invoke(initialState, config)) as AgentState;
  }
}
