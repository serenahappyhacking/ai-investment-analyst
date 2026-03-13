/**
 * Layer 6: Golden Regression Tests
 * ==================================
 * Verifies that deterministic outputs (formatting, routing decisions,
 * plan structures, PRM summaries) remain stable across refactors.
 *
 * Uses Vitest snapshots to detect unintended regressions in:
 * - Plan formatting output
 * - PRM summary format
 * - ReflexionMemory prompt format
 * - Routing decision tables
 * - State defaults and config values
 * - fixReportDate behavior
 */

import { describe, it, expect } from "vitest";
import { DynamicPlanner, type ExecutionPlan } from "../skills/dynamicPlanner.js";
import { ReflexionMemory } from "../skills/reflexion.js";
import { WorkflowConfig } from "../config.js";
import { fixReportDate } from "../agents/reportWriter.js";
import {
  routeAfterResearch,
  shouldSkipRisk,
  routeAfterReflexion,
} from "../graph/workflow.js";
import type { AgentState } from "../types/index.js";

// ═══════════════════════════════════════════════════════════════
// Plan Formatting Snapshots
// ═══════════════════════════════════════════════════════════════

describe("Golden: DynamicPlanner.formatPlan()", () => {
  const planner = new DynamicPlanner();

  it("formats a standard full plan", () => {
    const plan: ExecutionPlan = {
      company: "NVIDIA",
      query: "Full investment analysis",
      tasks: [
        { type: "research", description: "Research NVIDIA", priority: "critical", reasoning: "Foundation step", status: "completed" },
        { type: "financial_analysis", description: "Financial deep dive", priority: "critical", reasoning: "Key for valuation", status: "running" },
        { type: "market_analysis", description: "Market positioning", priority: "high", reasoning: "Competitive landscape", status: "pending" },
        { type: "risk_assessment", description: "Risk evaluation", priority: "high", reasoning: "Due diligence", status: "pending" },
        { type: "report_generation", description: "Generate final report", priority: "critical", reasoning: "Deliverable", status: "pending" },
        { type: "delivery", description: "Deliver to stakeholders", priority: "medium", reasoning: "Distribution", status: "pending" },
      ],
      version: 1,
      adaptations: [],
    };

    expect(planner.formatPlan(plan)).toMatchInlineSnapshot(`
      "=== Execution Plan v1 for NVIDIA ===

      ✅ 1. [CRITICAL] research: Research NVIDIA
           └─ Foundation step
      🔄 2. [CRITICAL] financial_analysis: Financial deep dive
           └─ Key for valuation
      ⏳ 3. [HIGH] market_analysis: Market positioning
           └─ Competitive landscape
      ⏳ 4. [HIGH] risk_assessment: Risk evaluation
           └─ Due diligence
      ⏳ 5. [CRITICAL] report_generation: Generate final report
           └─ Deliverable
      ⏳ 6. [MEDIUM] delivery: Deliver to stakeholders
           └─ Distribution"
    `);
  });

  it("formats plan with adaptations and skipped tasks", () => {
    const plan: ExecutionPlan = {
      company: "StartupX",
      query: "Quick check",
      tasks: [
        { type: "research", description: "Research StartupX", priority: "critical", reasoning: "", status: "completed" },
        { type: "financial_analysis", description: "Financial analysis", priority: "skip", reasoning: "Skipped: Pre-revenue company", status: "skipped" },
        { type: "report_generation", description: "Generate report", priority: "high", reasoning: "", status: "pending" },
      ],
      version: 2,
      adaptations: ["⏭️ Skipped financial_analysis: Pre-revenue company"],
    };

    expect(planner.formatPlan(plan)).toMatchInlineSnapshot(`
      "=== Execution Plan v2 for StartupX ===

      ✅ 1. [CRITICAL] research: Research StartupX
      ⏭️ 2. [SKIP] financial_analysis: Financial analysis
           └─ Skipped: Pre-revenue company
      ⏳ 3. [HIGH] report_generation: Generate report

      📝 Adaptations:
        ⏭️ Skipped financial_analysis: Pre-revenue company"
    `);
  });

  it("formats empty plan", () => {
    const plan: ExecutionPlan = {
      company: "Unknown",
      query: "test",
      tasks: [],
      version: 1,
      adaptations: [],
    };

    expect(planner.formatPlan(plan)).toMatchInlineSnapshot(`"=== Execution Plan v1 for Unknown ===
"`);
  });
});

// ═══════════════════════════════════════════════════════════════
// ReflexionMemory Prompt Formatting
// ═══════════════════════════════════════════════════════════════

describe("Golden: ReflexionMemory.formatForPrompt()", () => {
  it("formats empty memory", () => {
    const memory = new ReflexionMemory();
    expect(memory.formatForPrompt()).toMatchInlineSnapshot(
      `"No previous reflections. This is the first attempt."`
    );
  });

  it("formats single reflection entry", () => {
    const memory = new ReflexionMemory();
    memory.add({
      attemptNumber: 1,
      taskDescription: "Generate NVIDIA report",
      outputSummary: "Draft report with financial analysis",
      score: 6,
      reflection: "Missing competitor comparison and price targets",
      actionItems: ["Add competitor analysis", "Include price target range"],
      timestamp: "2025-01-15T10:00:00Z",
    });

    expect(memory.formatForPrompt()).toMatchInlineSnapshot(`
      "--- Attempt #1 (Score: 6/10) ---
      Reflection: Missing competitor comparison and price targets
      Action Items:
        - Add competitor analysis
        - Include price target range"
    `);
  });

  it("formats multiple reflection entries", () => {
    const memory = new ReflexionMemory();
    memory.add({
      attemptNumber: 1,
      taskDescription: "Report",
      outputSummary: "v1",
      score: 4,
      reflection: "Lacks depth",
      actionItems: ["Add financial data"],
      timestamp: "2025-01-15T10:00:00Z",
    });
    memory.add({
      attemptNumber: 2,
      taskDescription: "Report",
      outputSummary: "v2",
      score: 7,
      reflection: "Much improved, minor issues remain",
      actionItems: ["Polish executive summary"],
      timestamp: "2025-01-15T10:05:00Z",
    });

    expect(memory.formatForPrompt()).toMatchInlineSnapshot(`
      "--- Attempt #1 (Score: 4/10) ---
      Reflection: Lacks depth
      Action Items:
        - Add financial data

      --- Attempt #2 (Score: 7/10) ---
      Reflection: Much improved, minor issues remain
      Action Items:
        - Polish executive summary"
    `);
  });
});

// ═══════════════════════════════════════════════════════════════
// Routing Decision Tables
// ═══════════════════════════════════════════════════════════════

function makeMinimalState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    company: "TEST", query: "", mode: "full", executionPlan: "",
    historicalContext: "", researchData: {}, researchSources: [],
    researchSummary: "", financialAnalysis: "", marketAnalysis: "",
    techAnalysis: "", riskAssessment: "", riskScore: 0,
    draftReport: "", finalReport: "", reflexionMemory: "",
    stepEvaluations: [], deliveryStatus: "", qualityScore: 0,
    qualityFeedback: "", humanFeedback: "", iterationCount: 0,
    researchRetries: 0, analysisRetries: 0, costReport: "",
    errors: [], logs: [], currentPhase: "initialized",
    ...overrides,
  };
}

describe("Golden: Routing decision tables", () => {
  it("routeAfterResearch — full decision table", () => {
    const cases = [
      { phase: "research_complete", retries: 0, expected: "analysis" },
      { phase: "research_complete", retries: 5, expected: "analysis" },
      { phase: "research_blocked", retries: 0, expected: "research" },
      { phase: "research_blocked", retries: 1, expected: "research" },
      { phase: "research_blocked", retries: 2, expected: "report" },
      { phase: "research_blocked", retries: 10, expected: "report" },
    ];

    const results = cases.map((c) =>
      `phase=${c.phase}, retries=${c.retries} → ${routeAfterResearch(
        makeMinimalState({ currentPhase: c.phase, researchRetries: c.retries })
      )}`
    );

    expect(results).toMatchInlineSnapshot(`
      [
        "phase=research_complete, retries=0 → analysis",
        "phase=research_complete, retries=5 → analysis",
        "phase=research_blocked, retries=0 → research",
        "phase=research_blocked, retries=1 → research",
        "phase=research_blocked, retries=2 → report",
        "phase=research_blocked, retries=10 → report",
      ]
    `);
  });

  it("shouldSkipRisk — full decision table", () => {
    const results = [
      `mode=quick → ${shouldSkipRisk(makeMinimalState({ mode: "quick" }))}`,
      `mode=full → ${shouldSkipRisk(makeMinimalState({ mode: "full" }))}`,
    ];

    expect(results).toMatchInlineSnapshot(`
      [
        "mode=quick → report",
        "mode=full → risk",
      ]
    `);
  });

  it("routeAfterReflexion — full decision table", () => {
    const cases = [
      { score: 8, iterations: 1, expected: "delivery" },
      { score: 7, iterations: 0, expected: "delivery" },
      { score: 6.9, iterations: 0, expected: "report" },
      { score: 5, iterations: 1, expected: "report" },
      { score: 5, iterations: 2, expected: "report" },
      { score: 5, iterations: 3, expected: "delivery" },
      { score: 3, iterations: 3, expected: "delivery" },
      { score: 0, iterations: 3, expected: "delivery" },
    ];

    const results = cases.map((c) =>
      `score=${c.score}, iter=${c.iterations} → ${routeAfterReflexion(
        makeMinimalState({ qualityScore: c.score, iterationCount: c.iterations })
      )}`
    );

    expect(results).toMatchInlineSnapshot(`
      [
        "score=8, iter=1 → delivery",
        "score=7, iter=0 → delivery",
        "score=6.9, iter=0 → report",
        "score=5, iter=1 → report",
        "score=5, iter=2 → report",
        "score=5, iter=3 → delivery",
        "score=3, iter=3 → delivery",
        "score=0, iter=3 → delivery",
      ]
    `);
  });
});

// ═══════════════════════════════════════════════════════════════
// Config Values Snapshot
// ═══════════════════════════════════════════════════════════════

describe("Golden: WorkflowConfig values", () => {
  it("workflow configuration is stable", () => {
    expect({
      maxIterations: WorkflowConfig.maxIterations,
      qualityThreshold: WorkflowConfig.qualityThreshold,
    }).toMatchInlineSnapshot(`
      {
        "maxIterations": 3,
        "qualityThreshold": 7,
      }
    `);
  });
});

// ═══════════════════════════════════════════════════════════════
// fixReportDate Regression
// ═══════════════════════════════════════════════════════════════

describe("Golden: fixReportDate output stability", () => {
  it("replaces date in standard format", () => {
    const input = "# Report\n**Report Date:** 2024-01-01\nContent";
    const result = fixReportDate(input);

    // Should replace the date but keep structure
    expect(result).toMatch(/\*\*Report Date:\*\* \d{4}-\d{2}-\d{2}/);
    expect(result).toContain("# Report");
    expect(result).toContain("Content");
    expect(result).not.toContain("2024-01-01");
  });

  it("replaces date in alternative format", () => {
    const input = "**Report Date**: January 15, 2025";
    const result = fixReportDate(input);

    expect(result).toMatch(/\*\*Report Date\*\*: \d{4}-\d{2}-\d{2}/);
    expect(result).not.toContain("January 15, 2025");
  });

  it("preserves report without date line", () => {
    const input = "# Report\nNo date here\nJust content";
    expect(fixReportDate(input)).toBe(input);
  });
});
