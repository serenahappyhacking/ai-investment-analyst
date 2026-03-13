/**
 * Layer 8: Cost Guard Tests
 * ===========================
 * Verifies budget enforcement, cost calculation accuracy, and optimization
 * recommendations in the CostTracker.
 *
 * These tests ensure the financial guardrails work correctly to prevent
 * runaway API costs during pipeline execution.
 */

import { describe, it, expect } from "vitest";
import { CostTracker } from "../skills/costTracker.js";
import type { LLMCallRecord } from "../types/index.js";

// ── Helper ──────────────────────────────────────────────────

function makeCall(overrides: Partial<LLMCallRecord> = {}): LLMCallRecord {
  return {
    agentName: "webResearcher",
    model: "gpt-4o",
    inputTokens: 1000,
    outputTokens: 500,
    latencyMs: 1200,
    phase: "research",
    success: true,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Cost Calculation
// ═══════════════════════════════════════════════════════════════

describe("CostTracker — cost calculation", () => {
  it("calculates cost for known model (gpt-4o)", () => {
    const tracker = new CostTracker();

    // gpt-4o: input=$2.5/1M, output=$10/1M
    // 1000 input tokens = $0.0025, 500 output tokens = $0.005
    tracker.recordCall(makeCall({
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    }));

    expect(tracker.totalCost).toBeCloseTo(0.0075, 5);
  });

  it("calculates cost for gpt-4o-mini (cheaper model)", () => {
    const tracker = new CostTracker();

    // gpt-4o-mini: input=$0.15/1M, output=$0.6/1M
    tracker.recordCall(makeCall({
      model: "gpt-4o-mini",
      inputTokens: 10000,
      outputTokens: 5000,
    }));

    // 10000/1M * 0.15 + 5000/1M * 0.6 = 0.0015 + 0.003 = 0.0045
    expect(tracker.totalCost).toBeCloseTo(0.0045, 5);
  });

  it("uses default pricing for unknown models", () => {
    const tracker = new CostTracker();

    // Unknown model: defaults to input=$5/1M, output=$15/1M
    tracker.recordCall(makeCall({
      model: "unknown-model-xyz",
      inputTokens: 1000,
      outputTokens: 500,
    }));

    // 1000/1M * 5 + 500/1M * 15 = 0.005 + 0.0075 = 0.0125
    expect(tracker.totalCost).toBeCloseTo(0.0125, 5);
  });

  it("accumulates cost across multiple calls", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ inputTokens: 1000, outputTokens: 500 }));
    tracker.recordCall(makeCall({ inputTokens: 2000, outputTokens: 1000 }));

    // Call 1: 0.0025 + 0.005 = 0.0075
    // Call 2: 0.005  + 0.01  = 0.015
    expect(tracker.totalCost).toBeCloseTo(0.0225, 5);
  });

  it("tracks total tokens correctly", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ inputTokens: 1000, outputTokens: 500 }));
    tracker.recordCall(makeCall({ inputTokens: 3000, outputTokens: 2000 }));

    expect(tracker.totalTokens).toBe(6500);
  });

  it("tracks per-agent cost", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ agentName: "researcher", inputTokens: 1000, outputTokens: 500 }));
    tracker.recordCall(makeCall({ agentName: "analyst", inputTokens: 2000, outputTokens: 1000 }));
    tracker.recordCall(makeCall({ agentName: "researcher", inputTokens: 500, outputTokens: 200 }));

    const researcherCost = tracker.getAgentCost("researcher");
    const analystCost = tracker.getAgentCost("analyst");

    // researcher: (1000+500)/1M * rates + (500+200)/1M * rates
    expect(researcherCost).toBeGreaterThan(0);
    expect(analystCost).toBeGreaterThan(0);
    expect(researcherCost + analystCost).toBeCloseTo(tracker.totalCost, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// Budget Enforcement
// ═══════════════════════════════════════════════════════════════

describe("CostTracker — budget enforcement", () => {
  it("starts with no budget exceeded", () => {
    const tracker = new CostTracker();
    expect(tracker.isBudgetExceeded()).toBe(false);
  });

  it("warns when budget utilization exceeds 80%", () => {
    // Budget: $0.01 total, warn at 80% ($0.008)
    const tracker = new CostTracker({ maxTotalCost: 0.01, warnThreshold: 0.8 });

    // gpt-4o: (1000/1M)*2.5 + (500/1M)*10 = 0.0075 = 75%
    const { warnings: w1, abort: a1 } = tracker.recordCall(makeCall({
      inputTokens: 1000,
      outputTokens: 500,
    }));
    expect(w1).toHaveLength(0);
    expect(a1).toBe(false);

    // Add another small call to push over 80%
    const { warnings: w2, abort: a2 } = tracker.recordCall(makeCall({
      inputTokens: 200,
      outputTokens: 100,
    }));
    expect(w2.length).toBeGreaterThan(0);
    expect(w2[0]).toContain("Budget");
    expect(a2).toBe(false);
  });

  it("aborts when total cost exceeds budget", () => {
    const tracker = new CostTracker({ maxTotalCost: 0.005 });

    // gpt-4o: 0.0075 > $0.005 budget
    const { warnings, abort } = tracker.recordCall(makeCall({
      inputTokens: 1000,
      outputTokens: 500,
    }));

    expect(abort).toBe(true);
    expect(warnings).toContain("🚨 BUDGET EXCEEDED");
    expect(tracker.isBudgetExceeded()).toBe(true);
  });

  it("warns when per-agent cost exceeds limit", () => {
    const tracker = new CostTracker({ maxPerAgentCost: 0.005 });

    // First call under limit
    tracker.recordCall(makeCall({
      agentName: "researcher",
      inputTokens: 500,
      outputTokens: 200,
    }));

    // Second call pushes over per-agent limit
    const { warnings } = tracker.recordCall(makeCall({
      agentName: "researcher",
      inputTokens: 1000,
      outputTokens: 500,
    }));

    expect(warnings.some((w) => w.includes("researcher") && w.includes("per-agent"))).toBe(true);
  });

  it("uses default budget values", () => {
    const tracker = new CostTracker();

    // Default: $5 total, $1 per agent, 500k tokens, 80% warn
    // Very far from exceeding
    const { warnings, abort } = tracker.recordCall(makeCall({
      inputTokens: 1000,
      outputTokens: 500,
    }));

    expect(warnings).toHaveLength(0);
    expect(abort).toBe(false);
  });

  it("allows custom budget overrides", () => {
    const tracker = new CostTracker({
      maxTotalCost: 0.001,
      maxPerAgentCost: 0.0005,
      warnThreshold: 0.5,
    });

    const { abort } = tracker.recordCall(makeCall({
      inputTokens: 1000,
      outputTokens: 500,
    }));

    expect(abort).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Report Generation
// ═══════════════════════════════════════════════════════════════

describe("CostTracker — report generation", () => {
  it("generates structured report", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ agentName: "researcher", phase: "research", inputTokens: 2000, outputTokens: 1000 }));
    tracker.recordCall(makeCall({ agentName: "analyst", phase: "analysis", inputTokens: 3000, outputTokens: 1500 }));
    tracker.recordCall(makeCall({ agentName: "writer", phase: "report", inputTokens: 1500, outputTokens: 2000 }));

    const report = tracker.generateReport();

    expect(report.totalCalls).toBe(3);
    expect(report.totalTokens).toBe(11000);
    expect(report.totalCost).toBeGreaterThan(0);

    // By agent
    expect(report.byAgent).toHaveProperty("researcher");
    expect(report.byAgent).toHaveProperty("analyst");
    expect(report.byAgent).toHaveProperty("writer");
    expect(report.byAgent["researcher"].calls).toBe(1);
    expect(report.byAgent["analyst"].calls).toBe(1);

    // By phase
    expect(report.byPhase).toHaveProperty("research");
    expect(report.byPhase).toHaveProperty("analysis");
    expect(report.byPhase).toHaveProperty("report");
  });

  it("formats report as human-readable text", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ agentName: "researcher", phase: "research" }));
    tracker.recordCall(makeCall({ agentName: "analyst", phase: "analysis" }));

    const formatted = tracker.formatReport();

    expect(formatted).toContain("Cost & Performance Report");
    expect(formatted).toContain("Total Cost:");
    expect(formatted).toContain("Total Tokens:");
    expect(formatted).toContain("Total API Calls:");
    expect(formatted).toContain("Cost by Agent");
    expect(formatted).toContain("researcher");
    expect(formatted).toContain("analyst");
  });

  it("generates empty report with no calls", () => {
    const tracker = new CostTracker();
    const report = tracker.generateReport();

    expect(report.totalCost).toBe(0);
    expect(report.totalTokens).toBe(0);
    expect(report.totalCalls).toBe(0);
    expect(Object.keys(report.byAgent)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Optimization Recommendations
// ═══════════════════════════════════════════════════════════════

describe("CostTracker — optimization recommendations", () => {
  it("recommends cheaper model when agent uses >40% of total", () => {
    const tracker = new CostTracker();

    // Make one agent dominate costs
    tracker.recordCall(makeCall({ agentName: "expensive_agent", inputTokens: 50000, outputTokens: 20000 }));
    tracker.recordCall(makeCall({ agentName: "cheap_agent", inputTokens: 1000, outputTokens: 500 }));

    const report = tracker.generateReport();

    expect(report.optimizations.some((o) => o.includes("expensive_agent") && o.includes("gpt-4o-mini"))).toBe(true);
  });

  it("recommends validation when >2 calls fail", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ success: false }));
    tracker.recordCall(makeCall({ success: false }));
    tracker.recordCall(makeCall({ success: false }));
    tracker.recordCall(makeCall({ success: true }));

    const report = tracker.generateReport();

    expect(report.optimizations.some((o) => o.includes("failed") && o.includes("validation"))).toBe(true);
  });

  it("gives no recommendations for balanced, successful usage", () => {
    const tracker = new CostTracker();

    // Three agents with roughly equal cost — none exceeds 40%
    tracker.recordCall(makeCall({ agentName: "agent1", inputTokens: 1000, outputTokens: 500 }));
    tracker.recordCall(makeCall({ agentName: "agent2", inputTokens: 1000, outputTokens: 500 }));
    tracker.recordCall(makeCall({ agentName: "agent3", inputTokens: 1000, outputTokens: 500 }));

    const report = tracker.generateReport();

    expect(report.optimizations).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe("CostTracker — edge cases", () => {
  it("handles zero tokens", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ inputTokens: 0, outputTokens: 0 }));

    expect(tracker.totalCost).toBe(0);
    expect(tracker.totalTokens).toBe(0);
  });

  it("handles very large token counts", () => {
    const tracker = new CostTracker({ maxTotalCost: 1000 });

    tracker.recordCall(makeCall({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    }));

    // gpt-4o: 1M/1M * 2.5 + 500K/1M * 10 = 2.5 + 5 = 7.5
    expect(tracker.totalCost).toBeCloseTo(7.5, 2);
  });

  it("tracks multiple models in same pipeline", () => {
    const tracker = new CostTracker();

    tracker.recordCall(makeCall({ model: "gpt-4o", agentName: "researcher" }));
    tracker.recordCall(makeCall({ model: "gpt-4o-mini", agentName: "summarizer" }));
    tracker.recordCall(makeCall({ model: "claude-sonnet-4-5", agentName: "writer" }));

    const report = tracker.generateReport();

    expect(report.totalCalls).toBe(3);
    expect(Object.keys(report.byAgent)).toHaveLength(3);
  });

  it("handles rapid sequential calls", () => {
    const tracker = new CostTracker();

    for (let i = 0; i < 100; i++) {
      tracker.recordCall(makeCall({
        agentName: `agent_${i % 5}`,
        inputTokens: 100,
        outputTokens: 50,
      }));
    }

    expect(tracker.totalTokens).toBe(100 * 150);
    const report = tracker.generateReport();
    expect(report.totalCalls).toBe(100);
    expect(Object.keys(report.byAgent)).toHaveLength(5);
  });
});
