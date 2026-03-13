/**
 * Layer 3: Graph Integration Tests
 * ==================================
 * Tests the ACTUAL LangGraph state machine with lightweight stub nodes.
 * Verifies: correct node traversal order, conditional routing, retry loops,
 * mode-based branching, and reflexion quality loop.
 *
 * Approach: build a real StateGraph using AgentStateAnnotation, but replace
 * real node functions with stubs that only set the state fields that
 * routing functions inspect. This tests the graph WIRING, not the node logic.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentStateAnnotation, type AgentState } from "../types/index.js";
import { WorkflowConfig } from "../config.js";
import {
  routeAfterResearch,
  shouldSkipRisk,
  routeAfterReflexion,
} from "../graph/workflow.js";

// ── Stub node factories ────────────────────────────────────────

/** Track which nodes were visited during graph execution */
type VisitLog = string[];

function makeStubNodes(scenario: {
  researchBlocked?: boolean;
  researchBlockedUntilRetry?: number; // block for N retries, then succeed
  reflexionScores?: number[]; // scores for each reflexion iteration
  mode?: "quick" | "full";
}) {
  const visited: VisitLog = [];
  let researchCallCount = 0;
  let reflexionCallCount = 0;

  const stubNode = (name: string, stateUpdates: (state: AgentState) => Partial<AgentState>) => {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
      visited.push(name);
      return stateUpdates(state);
    };
  };

  const nodes = {
    planning: stubNode("planning", () => ({
      executionPlan: "{}",
      currentPhase: "planned",
      logs: ["Planning done"],
    })),

    notionContext: stubNode("notionContext", () => ({
      historicalContext: "No history.",
      logs: ["Context loaded"],
    })),

    research: stubNode("research", (state) => {
      researchCallCount++;
      const blockUntil = scenario.researchBlockedUntilRetry ?? 0;

      if (scenario.researchBlocked && blockUntil === 0) {
        // Always blocked
        return {
          researchSummary: "Blocked",
          currentPhase: "research_blocked",
          researchRetries: (state.researchRetries ?? 0) + 1,
          logs: [`Research blocked (attempt ${researchCallCount})`],
        };
      }

      if (blockUntil > 0 && researchCallCount <= blockUntil) {
        // Blocked for first N attempts
        return {
          researchSummary: "Blocked",
          currentPhase: "research_blocked",
          researchRetries: (state.researchRetries ?? 0) + 1,
          logs: [`Research blocked (attempt ${researchCallCount})`],
        };
      }

      return {
        researchSummary: "NVIDIA is a leading AI company.",
        researchData: { qualitative: "data" },
        currentPhase: "research_complete",
        logs: ["Research complete"],
      };
    }),

    analysis: stubNode("analysis", () => ({
      financialAnalysis: "P/E 65",
      marketAnalysis: "Market leader",
      techAnalysis: "CUDA moat",
      currentPhase: "analysis_complete",
      logs: ["Analysis complete"],
    })),

    risk: stubNode("risk", () => ({
      riskAssessment: "Moderate risk",
      riskScore: 6,
      currentPhase: "risk_complete",
      logs: ["Risk complete"],
    })),

    report: stubNode("report", () => ({
      draftReport: "# Investment Report\n\nContent.",
      currentPhase: "report_generated",
      logs: ["Report generated"],
    })),

    reflexion: stubNode("reflexion", (state) => {
      const scores = scenario.reflexionScores ?? [8.0]; // default: pass
      const iteration = state.iterationCount ?? 0;
      const score = scores[Math.min(reflexionCallCount, scores.length - 1)];
      reflexionCallCount++;

      return {
        qualityScore: score,
        iterationCount: iteration + 1,
        currentPhase: "reflexion_complete",
        logs: [`Reflexion: score=${score}`],
      };
    }),

    delivery: stubNode("delivery", () => ({
      deliveryStatus: "notion=false, email=false",
      currentPhase: "delivered",
      logs: ["Delivery complete"],
    })),

    finalize: stubNode("finalize", (state) => ({
      finalReport: state.draftReport ?? "No report.",
      currentPhase: "completed",
      logs: ["Finalized"],
    })),
  };

  return { nodes, visited };
}

/** Build graph with stub nodes and execute */
async function runGraphWithStubs(
  stubs: ReturnType<typeof makeStubNodes>,
  overrides: Partial<AgentState> = {}
): Promise<{ finalState: AgentState; visited: VisitLog }> {
  const { nodes, visited } = stubs;

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode("planning", nodes.planning)
    .addNode("notionContext", nodes.notionContext)
    .addNode("research", nodes.research)
    .addNode("analysis", nodes.analysis)
    .addNode("risk", nodes.risk)
    .addNode("report", nodes.report)
    .addNode("reflexion", nodes.reflexion)
    .addNode("delivery", nodes.delivery)
    .addNode("finalize", nodes.finalize)
    .addEdge(START, "planning")
    .addEdge("planning", "notionContext")
    .addEdge("notionContext", "research")
    .addConditionalEdges("research", routeAfterResearch, {
      analysis: "analysis",
      research: "research",
      report: "report",
    })
    .addConditionalEdges("analysis", shouldSkipRisk, {
      risk: "risk",
      report: "report",
    })
    .addEdge("risk", "report")
    .addEdge("report", "reflexion")
    .addConditionalEdges("reflexion", routeAfterReflexion, {
      report: "report",
      delivery: "delivery",
    })
    .addEdge("delivery", "finalize")
    .addEdge("finalize", END);

  const checkpointer = new MemorySaver();
  const workflow = graph.compile({ checkpointer });

  const initialState: Partial<AgentState> = {
    company: "NVIDIA",
    query: "Full analysis",
    mode: "full",
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
    ...overrides,
  };

  const config = {
    configurable: { thread_id: `test-${randomUUID().slice(0, 8)}` },
  };

  const finalState = (await workflow.invoke(initialState, config)) as AgentState;
  return { finalState, visited };
}

// ═══════════════════════════════════════════════════════════════
// Test Scenarios
// ═══════════════════════════════════════════════════════════════

describe("Graph: Happy Path (full mode)", () => {
  it("traverses all nodes in correct order", async () => {
    const stubs = makeStubNodes({ reflexionScores: [8.0] });
    const { finalState, visited } = await runGraphWithStubs(stubs);

    expect(visited).toEqual([
      "planning",
      "notionContext",
      "research",
      "analysis",
      "risk",
      "report",
      "reflexion",
      "delivery",
      "finalize",
    ]);
    expect(finalState.currentPhase).toBe("completed");
    expect(finalState.finalReport).toContain("Investment Report");
  });
});

describe("Graph: Quick Mode (skip risk)", () => {
  it("skips risk node in quick mode", async () => {
    const stubs = makeStubNodes({ reflexionScores: [8.0] });
    const { visited } = await runGraphWithStubs(stubs, { mode: "quick" });

    expect(visited).toContain("analysis");
    expect(visited).not.toContain("risk");
    // After analysis, should go directly to report
    const analysisIdx = visited.indexOf("analysis");
    const reportIdx = visited.indexOf("report");
    expect(reportIdx).toBe(analysisIdx + 1);
  });
});

describe("Graph: Research Retry + Recovery", () => {
  it("retries research once then succeeds", async () => {
    const stubs = makeStubNodes({
      researchBlockedUntilRetry: 1, // blocked on 1st call, succeeds on 2nd
      reflexionScores: [8.0],
    });
    const { visited } = await runGraphWithStubs(stubs);

    // Research should appear twice (1st blocked, 2nd success)
    const researchCount = visited.filter((n) => n === "research").length;
    expect(researchCount).toBe(2);

    // Should proceed to analysis after successful retry
    expect(visited).toContain("analysis");
  });
});

describe("Graph: Research Degrade (max retries)", () => {
  it("degrades to report after 2 failed retries", async () => {
    const stubs = makeStubNodes({
      researchBlocked: true, // always blocked
      reflexionScores: [8.0],
    });
    const { visited } = await runGraphWithStubs(stubs);

    // Research called 2 times: 1st sets retries=1 (retry), 2nd sets retries=2 (degrade)
    const researchCount = visited.filter((n) => n === "research").length;
    expect(researchCount).toBe(2);

    // Should skip analysis and go directly to report
    expect(visited).not.toContain("analysis");
    expect(visited).not.toContain("risk");
    expect(visited).toContain("report");
    expect(visited).toContain("delivery");
  });
});

describe("Graph: Reflexion Loop", () => {
  it("retries report when score is below threshold", async () => {
    const stubs = makeStubNodes({
      reflexionScores: [5.0, 8.0], // fail first, pass second
    });
    const { visited } = await runGraphWithStubs(stubs);

    // Report should be called twice (initial + 1 retry after low reflexion score)
    const reportCount = visited.filter((n) => n === "report").length;
    expect(reportCount).toBe(2);

    // Reflexion should be called twice
    const reflexionCount = visited.filter((n) => n === "reflexion").length;
    expect(reflexionCount).toBe(2);

    expect(visited).toContain("delivery");
  });

  it("forces delivery after max iterations even with low score", async () => {
    const stubs = makeStubNodes({
      reflexionScores: [3.0, 3.0, 3.0, 3.0], // always low
    });
    const { visited } = await runGraphWithStubs(stubs);

    // Should hit max iterations (3) and force delivery
    const reflexionCount = visited.filter((n) => n === "reflexion").length;
    expect(reflexionCount).toBe(WorkflowConfig.maxIterations);

    expect(visited).toContain("delivery");
    expect(visited).toContain("finalize");
  });
});

describe("Graph: Combined — quick mode + reflexion retry", () => {
  it("skips risk AND retries report in quick mode", async () => {
    const stubs = makeStubNodes({
      reflexionScores: [4.0, 9.0], // retry once
    });
    const { visited } = await runGraphWithStubs(stubs, { mode: "quick" });

    // No risk
    expect(visited).not.toContain("risk");

    // Two report iterations
    const reportCount = visited.filter((n) => n === "report").length;
    expect(reportCount).toBe(2);

    expect(visited).toContain("delivery");
  });
});

describe("Graph: Combined — research retry + quick mode", () => {
  it("retries research then skips risk", async () => {
    const stubs = makeStubNodes({
      researchBlockedUntilRetry: 1,
      reflexionScores: [8.0],
    });
    const { visited } = await runGraphWithStubs(stubs, { mode: "quick" });

    // Research retried
    const researchCount = visited.filter((n) => n === "research").length;
    expect(researchCount).toBe(2);

    // Quick mode: no risk
    expect(visited).not.toContain("risk");

    expect(visited).toContain("delivery");
  });
});
