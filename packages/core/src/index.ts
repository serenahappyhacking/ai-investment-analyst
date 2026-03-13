/**
 * @repo/core — AI Investment Analysis Engine
 * ============================================
 * Barrel export for the analysis engine.
 * Used by apps/cli (CLI tool) and apps/web (Next.js dashboard).
 */

// ── Engine entry point ────────────────────────────────────────
export { runAnalysis, type AnalysisParams, type AnalysisResult } from "./engine.js";

// ── Config ────────────────────────────────────────────────────
export { LLMConfig, WorkflowConfig, AGENT_ROLES, WATCHLIST, getTodayString } from "./config.js";
export type { AgentRole } from "./config.js";

// ── Graph / Workflow ──────────────────────────────────────────
export { buildWorkflow, runWorkflow } from "./graph/workflow.js";

// ── Types ─────────────────────────────────────────────────────
export { AgentStateAnnotation } from "./types/index.js";
export type { AgentState, StepEvaluation, ReflectionEntry, PlannedTask, TaskType, LLMCallRecord, CostReport } from "./types/index.js";

// ── Tools ─────────────────────────────────────────────────────
export { getSearchTools } from "./tools/searchTools.js";
export { getFinanceTools, getStockInfo } from "./tools/financeTools.js";
export { getAllMcpTools } from "./tools/mcpTools.js";

// ── Integrations ──────────────────────────────────────────────
export { isNotionConfigured, saveReportToNotion } from "./integrations/notionClient.js";
export { isEmailConfigured, sendReportEmail } from "./integrations/emailClient.js";

// ── Agents ────────────────────────────────────────────────────
export { ReportWriterAgent } from "./agents/reportWriter.js";
export { buildReactAgent, runReactAgent } from "./agents/reactAgent.js";

// ── Skills ────────────────────────────────────────────────────
export { ProcessRewardModel } from "./skills/processReward.js";
export { CostTracker } from "./skills/costTracker.js";
