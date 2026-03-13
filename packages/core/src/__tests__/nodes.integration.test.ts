/**
 * Layer 2: Node Integration Tests
 * ================================
 * Tests each node function's state transformation with mocked dependencies.
 * Verifies: correct state output, phase naming, error handling paths.
 *
 * All external dependencies (crews, LLM, tools, integrations) are mocked
 * so tests run fast and don't require API keys.
 */

import { describe, it, expect, vi } from "vitest";
import type { AgentState } from "../types/index.js";

// ── Mock all external dependencies BEFORE importing nodes ──────────

vi.mock("../crews/index.js", () => ({
  ResearchCrew: class {
    run = vi.fn().mockResolvedValue({
      researchData: { qualitative: "mock research" },
      researchSummary: "NVIDIA is a leading AI chip company with strong revenue growth.",
      sources: ["https://example.com"],
    });
  },
  AnalysisCrew: class {
    run = vi.fn().mockResolvedValue({
      financialAnalysis: "P/E ratio of 65, revenue $79B TTM",
      marketAnalysis: "Dominant in AI GPU market, 80%+ share",
      techAnalysis: "CUDA ecosystem creates strong moat",
    });
  },
  RiskCrew: class {
    run = vi.fn().mockResolvedValue({
      riskAssessment: "Key risks: concentration in AI, geopolitical tensions",
      riskScore: 6.5,
    });
  },
  DeliveryCrew: class {
    run = vi.fn().mockResolvedValue({
      deliveryStatus: "completed",
      notionSaved: false,
      emailSent: false,
      meetingScheduled: false,
    });
  },
}));

vi.mock("../agents/reportWriter.js", () => ({
  ReportWriterAgent: class {
    generate = vi.fn().mockResolvedValue("# Investment Report: NVIDIA\n**Report Date:** 2025-01-15\n\nMock report content.");
    revise = vi.fn().mockResolvedValue("# Revised Report: NVIDIA\n**Report Date:** 2025-01-15\n\nRevised content.");
    translate = vi.fn().mockResolvedValue("# 投资报告：NVIDIA");
  },
  fixReportDate: vi.fn((report: string) => report),
}));

vi.mock("../skills/dynamicPlanner.js", () => ({
  DynamicPlanner: class {
    createInitialPlan = vi.fn().mockResolvedValue({
      company: "NVIDIA",
      query: "test",
      tasks: [
        { type: "research", description: "Research", priority: "critical", reasoning: "", status: "pending" },
        { type: "financial_analysis", description: "Finance", priority: "high", reasoning: "", status: "pending" },
      ],
      version: 1,
      adaptations: [],
    });
    adaptPlan = vi.fn().mockImplementation((plan: any) => ({ ...plan }));
  },
}));

vi.mock("../skills/reflexion.js", () => ({
  ReflexionEngine: class {
    evaluateAndReflect = vi.fn().mockResolvedValue({
      score: 7.5,
      evaluation: "Good quality report",
      reflection: "Well structured analysis",
      actionItems: ["Add more competitor data"],
      shouldRetry: false,
      pastReflections: "Attempt 1: score 7.5",
    });
  },
  ReflexionMemory: class {
    add = vi.fn();
    formatForPrompt = vi.fn().mockReturnValue("No previous reflections.");
    getBestScore = vi.fn().mockReturnValue(0);
  },
}));

vi.mock("../skills/processReward.js", () => ({
  ProcessRewardModel: class {
    evaluateStep = vi.fn().mockResolvedValue({
      stepName: "research",
      score: 7.0,
      dimensions: {},
      issues: [],
      isBlocking: false,
      recommendation: "proceed",
      details: "",
    });
    getSummary = vi.fn().mockReturnValue("=== Pipeline Summary ===\nAll steps passed.");
    hasBlockingFailure = vi.fn().mockReturnValue(false);
    getWeakestStep = vi.fn().mockReturnValue("research");
  },
}));

vi.mock("../tools/mcpTools.js", () => ({
  notionSearchPastAnalyses: { invoke: vi.fn().mockResolvedValue("Previous analysis from 2024-Q3.") },
  getMcpResearchTools: vi.fn().mockReturnValue([]),
  getMcpDeliveryTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../tools/financeTools.js", () => ({
  getStockInfo: { invoke: vi.fn().mockResolvedValue(JSON.stringify({ Company: "NVIDIA", "Current Price": "125" })) },
  getFinanceTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../tools/searchTools.js", () => ({
  getSearchTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../integrations/index.js", () => ({
  isNotionConfigured: vi.fn().mockReturnValue(false),
  saveReportToNotion: vi.fn(),
  isEmailConfigured: vi.fn().mockReturnValue(false),
  sendReportEmail: vi.fn(),
}));

// Now import nodes (they'll use mocked deps)
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
} from "../graph/nodes.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    company: "NVIDIA",
    query: "Full investment analysis",
    mode: "full",
    executionPlan: "",
    historicalContext: "",
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
    reflexionMemory: "",
    stepEvaluations: [],
    deliveryStatus: "",
    qualityScore: 0,
    qualityFeedback: "",
    humanFeedback: "",
    iterationCount: 0,
    researchRetries: 0,
    analysisRetries: 0,
    costReport: "",
    errors: [],
    logs: [],
    currentPhase: "initialized",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Planning Node
// ═══════════════════════════════════════════════════════════════

describe("planningNode", () => {
  it("creates execution plan and sets phase to planned", async () => {
    const state = makeState();
    const result = await planningNode(state);

    expect(result.currentPhase).toBe("planned");
    expect(result.executionPlan).toBeDefined();
    const plan = JSON.parse(result.executionPlan!);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(result.logs?.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Notion Context Node
// ═══════════════════════════════════════════════════════════════

describe("notionContextNode", () => {
  it("loads historical context", async () => {
    const state = makeState();
    const result = await notionContextNode(state);

    expect(result.historicalContext).toContain("Previous analysis");
    expect(result.currentPhase).toBe("context_loaded");
  });
});

// ═══════════════════════════════════════════════════════════════
// Research Node
// ═══════════════════════════════════════════════════════════════

describe("researchNode", () => {
  it("produces research summary and sets phase", async () => {
    const state = makeState();
    const result = await researchNode(state);

    expect(result.researchSummary).toContain("NVIDIA");
    expect(result.currentPhase).toBe("research_complete");
    expect(result.researchRetries).toBe(0);
    expect(result.stepEvaluations?.length).toBe(1);
  });

  it("populates research data and sources", async () => {
    const state = makeState();
    const result = await researchNode(state);

    expect(result.researchData).toHaveProperty("qualitative");
    expect(result.researchSources).toEqual(["https://example.com"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Analysis Node
// ═══════════════════════════════════════════════════════════════

describe("analysisNode", () => {
  it("runs 3 analysts and sets phase", async () => {
    const state = makeState({ researchSummary: "NVIDIA research data" });
    const result = await analysisNode(state);

    expect(result.financialAnalysis).toContain("P/E");
    expect(result.marketAnalysis).toContain("GPU");
    expect(result.techAnalysis).toContain("CUDA");
    expect(result.currentPhase).toBe("analysis_complete");
    expect(result.stepEvaluations?.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Risk Node
// ═══════════════════════════════════════════════════════════════

describe("riskNode", () => {
  it("produces risk assessment with score", async () => {
    const state = makeState({
      researchSummary: "NVIDIA data",
      financialAnalysis: "P/E 65",
      marketAnalysis: "Market leader",
    });
    const result = await riskNode(state);

    expect(result.riskAssessment).toContain("risk");
    expect(result.riskScore).toBe(6.5);
    expect(result.currentPhase).toBe("risk_complete");
    expect(result.stepEvaluations?.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Report Node
// ═══════════════════════════════════════════════════════════════

describe("reportNode", () => {
  it("generates report on first iteration", async () => {
    const state = makeState({
      iterationCount: 0,
      financialAnalysis: "Financial data",
      riskScore: 6,
    });
    const result = await reportNode(state);

    expect(result.draftReport).toBeDefined();
    expect(result.draftReport!.length).toBeGreaterThan(0);
    expect(result.currentPhase).toBe("report_generated");
  });

  it("revises report on subsequent iterations", async () => {
    const state = makeState({
      iterationCount: 1,
      draftReport: "# Old Draft\n\nOld content.",
      qualityFeedback: "Add more data",
    });
    const result = await reportNode(state);

    expect(result.draftReport).toContain("Revised");
    expect(result.currentPhase).toBe("report_generated");
  });

  it("includes PRM evaluation", async () => {
    const state = makeState({ iterationCount: 0 });
    const result = await reportNode(state);

    expect(result.stepEvaluations?.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Reflexion Node
// ═══════════════════════════════════════════════════════════════

describe("reflexionNode", () => {
  it("evaluates draft and returns score", async () => {
    const state = makeState({
      draftReport: "# Investment Report\n\nContent here.",
      iterationCount: 0,
    });
    const result = await reflexionNode(state);

    expect(result.qualityScore).toBe(7.5);
    expect(result.iterationCount).toBe(1);
    expect(result.currentPhase).toBe("reflexion_complete");
    expect(result.reflexionMemory).toBeDefined();
  });

  it("returns score 0 when no draft exists", async () => {
    const state = makeState({ draftReport: "", iterationCount: 0 });
    const result = await reflexionNode(state);

    expect(result.qualityScore).toBe(0);
    expect(result.iterationCount).toBe(1);
  });

  it("increments iteration count on each call", async () => {
    const state = makeState({
      draftReport: "Some draft",
      iterationCount: 2,
    });
    const result = await reflexionNode(state);

    expect(result.iterationCount).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// Delivery Node
// ═══════════════════════════════════════════════════════════════

describe("deliveryNode", () => {
  it("skips integrations when not configured", async () => {
    const state = makeState({ draftReport: "Final report content" });
    const result = await deliveryNode(state);

    expect(result.currentPhase).toBe("delivered");
    expect(result.deliveryStatus).toContain("notion=");
    expect(result.deliveryStatus).toContain("email=");
    expect(result.logs!.length).toBeGreaterThan(0);
  });

  it("produces delivery status string", async () => {
    const state = makeState();
    const result = await deliveryNode(state);

    // Without Notion/Email configured, should show false
    expect(result.deliveryStatus).toMatch(/notion=(true|false)/);
    expect(result.deliveryStatus).toMatch(/email=(true|false)/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Finalize Node
// ═══════════════════════════════════════════════════════════════

describe("finalizeNode", () => {
  it("sets final report and completed phase", async () => {
    const state = makeState({ draftReport: "# Final Report\n\nContent." });
    const result = await finalizeNode(state);

    expect(result.finalReport).toBe("# Final Report\n\nContent.");
    expect(result.currentPhase).toBe("completed");
    expect(result.logs!.some((l: string) => l.includes("Workflow completed"))).toBe(true);
  });

  it("returns empty string when draft is empty (nullish coalescing: '' is not null)", async () => {
    const state = makeState({ draftReport: "" });
    const result = await finalizeNode(state);

    // `??` only triggers on null/undefined, not empty string
    expect(result.finalReport).toBe("");
  });

  it("includes PRM summary in logs", async () => {
    const state = makeState({ draftReport: "Some report" });
    const result = await finalizeNode(state);

    expect(result.logs!.some((l: string) => l.includes("Pipeline Quality"))).toBe(true);
  });
});
