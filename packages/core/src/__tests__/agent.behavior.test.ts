/**
 * Layer 4: Agent Behavior Tests
 * ==============================
 * Tests that crews, agents, and skills make the right calls with the right
 * arguments. Mocks LLM and tool infrastructure so tests run without API keys.
 *
 * Verifies: correct tool assignment per role, message content, parallel
 * execution patterns, structured output usage, fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (available inside vi.mock factories) ────────

const {
  buildReactAgentSpy,
  runReactAgentSpy,
  mockSearchTools,
  mockFinanceTools,
  mockMcpResearchTools,
  mockMcpDeliveryTools,
  mockLlmInvoke,
  mockWithStructuredOutput,
  mockChainInvoke,
  mockLlm,
} = vi.hoisted(() => {
  const buildReactAgentSpy = vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      messages: [{
        _getType: () => "ai",
        content: "Mock agent response.",
        tool_calls: undefined,
      }],
    }),
  });

  const runReactAgentSpy = vi.fn().mockResolvedValue("Mock agent output.");

  const mockSearchTools = [
    { name: "webSearch" },
    { name: "newsSearch" },
    { name: "competitorSearch" },
  ];
  const mockFinanceTools = [
    { name: "getStockInfo" },
    { name: "getFinancialHistory" },
  ];
  const mockMcpResearchTools = [
    { name: "notionSearchPastAnalyses" },
    { name: "gmailSearchNewsletters" },
  ];
  const mockMcpDeliveryTools = [
    { name: "notionSaveAnalysis" },
    { name: "gmailSendReport" },
    { name: "calendarScheduleReview" },
    { name: "calendarSetFollowup" },
  ];

  const mockLlmInvoke = vi.fn().mockResolvedValue({ content: "[]" });
  const mockWithStructuredOutput = vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      overallScore: 7,
      dimensions: { market: 6, operational: 5, competitive: 7, financial: 6, geopolitical: 4 },
      summary: "Moderate risk profile",
    }),
  });
  const mockChainInvoke = vi.fn().mockResolvedValue("# Mock Report\n**Report Date:** 2025-01-15");
  const mockLlm = {
    invoke: mockLlmInvoke,
    withStructuredOutput: mockWithStructuredOutput,
    pipe: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: mockChainInvoke,
      }),
    }),
  };

  return {
    buildReactAgentSpy,
    runReactAgentSpy,
    mockSearchTools,
    mockFinanceTools,
    mockMcpResearchTools,
    mockMcpDeliveryTools,
    mockLlmInvoke,
    mockWithStructuredOutput,
    mockChainInvoke,
    mockLlm,
  };
});

// ── Mock modules ──────────────────────────────────────────────

vi.mock("../agents/reactAgent.js", () => ({
  buildReactAgent: buildReactAgentSpy,
  runReactAgent: runReactAgentSpy,
}));

vi.mock("../tools/searchTools.js", () => ({
  getSearchTools: vi.fn().mockReturnValue(mockSearchTools),
}));

vi.mock("../tools/financeTools.js", () => ({
  getFinanceTools: vi.fn().mockReturnValue(mockFinanceTools),
  getStockInfo: { invoke: vi.fn().mockResolvedValue("{}") },
}));

vi.mock("../tools/mcpTools.js", () => ({
  getMcpResearchTools: vi.fn().mockReturnValue(mockMcpResearchTools),
  getMcpDeliveryTools: vi.fn().mockReturnValue(mockMcpDeliveryTools),
  notionSearchPastAnalyses: { invoke: vi.fn().mockResolvedValue("No history.") },
}));

vi.mock("../config.js", async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    createLLM: vi.fn().mockReturnValue(mockLlm),
  };
});

// Now import after mocks
import { ResearchCrew, AnalysisCrew, RiskCrew, DeliveryCrew } from "../crews/index.js";
import { ReportWriterAgent } from "../agents/reportWriter.js";
import { DynamicPlanner } from "../skills/dynamicPlanner.js";
import { ReflexionEngine } from "../skills/reflexion.js";
import { ProcessRewardModel } from "../skills/processReward.js";

// ═══════════════════════════════════════════════════════════════
// ResearchCrew Behavior
// ═══════════════════════════════════════════════════════════════

describe("ResearchCrew — agent orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReactAgentSpy.mockResolvedValue("Mock agent output.");
  });

  it("creates 3 agents with correct roles", async () => {
    const crew = new ResearchCrew();
    await crew.run("NVIDIA", "Full analysis");

    expect(buildReactAgentSpy).toHaveBeenCalledTimes(3);

    expect(buildReactAgentSpy.mock.calls[0][0]).toMatchObject({ role: "webResearcher" });
    expect(buildReactAgentSpy.mock.calls[1][0]).toMatchObject({ role: "dataCollector" });
    expect(buildReactAgentSpy.mock.calls[2][0]).toMatchObject({ role: "summarizer" });
  });

  it("assigns correct tools to each agent", async () => {
    const crew = new ResearchCrew();
    await crew.run("NVIDIA", "Test query");

    // webResearcher gets search + MCP research tools (5 total)
    const researcherTools = buildReactAgentSpy.mock.calls[0][0].tools;
    expect(researcherTools).toHaveLength(5);
    expect(researcherTools.map((t: any) => t.name)).toEqual(
      expect.arrayContaining(["webSearch", "newsSearch", "notionSearchPastAnalyses"])
    );

    // dataCollector gets finance tools
    const collectorTools = buildReactAgentSpy.mock.calls[1][0].tools;
    expect(collectorTools).toHaveLength(2);
    expect(collectorTools.map((t: any) => t.name)).toContain("getStockInfo");

    // summarizer gets no tools (pure reasoning)
    expect(buildReactAgentSpy.mock.calls[2][0].tools).toHaveLength(0);
  });

  it("passes company name in all agent messages", async () => {
    const crew = new ResearchCrew();
    await crew.run("Tesla", "EV market analysis");

    expect(runReactAgentSpy).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(runReactAgentSpy.mock.calls[i][1]).toContain("Tesla");
    }
  });

  it("feeds qualitative and quantitative data to synthesizer", async () => {
    runReactAgentSpy
      .mockResolvedValueOnce("Qualitative research about NVIDIA")
      .mockResolvedValueOnce("Quantitative data: revenue $79B")
      .mockResolvedValueOnce("Synthesis: NVIDIA is strong");

    const crew = new ResearchCrew();
    await crew.run("NVIDIA", "Full analysis");

    const synthesizerMessage = runReactAgentSpy.mock.calls[2][1];
    expect(synthesizerMessage).toContain("Qualitative research about NVIDIA");
    expect(synthesizerMessage).toContain("Quantitative data: revenue $79B");
  });

  it("includes user query in researcher message", async () => {
    const crew = new ResearchCrew();
    await crew.run("Apple", "Focus on AI strategy");

    expect(runReactAgentSpy.mock.calls[0][1]).toContain("Focus on AI strategy");
  });

  it("returns structured result with all fields", async () => {
    runReactAgentSpy
      .mockResolvedValueOnce("Research data")
      .mockResolvedValueOnce("Finance data")
      .mockResolvedValueOnce("Summary text");

    const crew = new ResearchCrew();
    const result = await crew.run("NVIDIA", "test");

    expect(result).toHaveProperty("researchData");
    expect(result).toHaveProperty("researchSummary", "Summary text");
    expect(result).toHaveProperty("sources");
    expect(result.researchData).toHaveProperty("qualitative", "Research data");
    expect(result.researchData).toHaveProperty("quantitative", "Finance data");
  });
});

// ═══════════════════════════════════════════════════════════════
// AnalysisCrew Behavior
// ═══════════════════════════════════════════════════════════════

describe("AnalysisCrew — parallel agent execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReactAgentSpy.mockResolvedValue("Mock analysis output.");
  });

  it("creates 3 analysts with correct roles", async () => {
    const crew = new AnalysisCrew();
    await crew.run("NVIDIA", "Research summary here");

    expect(buildReactAgentSpy).toHaveBeenCalledTimes(3);

    const roles = buildReactAgentSpy.mock.calls.map((c: any) => c[0].role);
    expect(roles).toContain("financialAnalyst");
    expect(roles).toContain("marketAnalyst");
    expect(roles).toContain("techAnalyst");
  });

  it("assigns finance tools to financial analyst, search tools to others", async () => {
    const crew = new AnalysisCrew();
    await crew.run("NVIDIA", "Research data");

    const financialCall = buildReactAgentSpy.mock.calls.find(
      (c: any) => c[0].role === "financialAnalyst"
    );
    const marketCall = buildReactAgentSpy.mock.calls.find(
      (c: any) => c[0].role === "marketAnalyst"
    );
    const techCall = buildReactAgentSpy.mock.calls.find(
      (c: any) => c[0].role === "techAnalyst"
    );

    expect(financialCall![0].tools.map((t: any) => t.name)).toContain("getStockInfo");
    expect(marketCall![0].tools.map((t: any) => t.name)).toContain("webSearch");
    expect(techCall![0].tools.map((t: any) => t.name)).toContain("webSearch");
  });

  it("includes research context in all analyst messages", async () => {
    const crew = new AnalysisCrew();
    await crew.run("NVIDIA", "Strong AI chip demand");

    for (let i = 0; i < 3; i++) {
      const message = runReactAgentSpy.mock.calls[i][1];
      expect(message).toContain("Strong AI chip demand");
      expect(message).toContain("NVIDIA");
    }
  });

  it("returns structured result with three analysis fields", async () => {
    runReactAgentSpy
      .mockResolvedValueOnce("Financial: P/E 65")
      .mockResolvedValueOnce("Market: Leader in GPUs")
      .mockResolvedValueOnce("Tech: CUDA ecosystem");

    const crew = new AnalysisCrew();
    const result = await crew.run("NVIDIA", "data");

    expect(result).toHaveProperty("financialAnalysis");
    expect(result).toHaveProperty("marketAnalysis");
    expect(result).toHaveProperty("techAnalysis");
  });
});

// ═══════════════════════════════════════════════════════════════
// RiskCrew Behavior
// ═══════════════════════════════════════════════════════════════

describe("RiskCrew — risk analysis + structured scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReactAgentSpy.mockResolvedValue("Mock risk assessment.");
    mockWithStructuredOutput.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        overallScore: 6.5,
        dimensions: { market: 7, operational: 5, competitive: 8, financial: 5, geopolitical: 6 },
        summary: "Moderate-high risk",
      }),
    });
  });

  it("creates riskAnalyst and complianceAnalyst agents", async () => {
    const crew = new RiskCrew();
    await crew.run("NVIDIA", "Research data", "Analysis data");

    expect(buildReactAgentSpy).toHaveBeenCalledTimes(2);
    const roles = buildReactAgentSpy.mock.calls.map((c: any) => c[0].role);
    expect(roles).toContain("riskAnalyst");
    expect(roles).toContain("complianceAnalyst");
  });

  it("both risk agents use search tools", async () => {
    const crew = new RiskCrew();
    await crew.run("NVIDIA", "data", "analysis");

    for (const call of buildReactAgentSpy.mock.calls) {
      expect(call[0].tools.map((t: any) => t.name)).toContain("webSearch");
    }
  });

  it("feeds risk agent output to compliance agent", async () => {
    runReactAgentSpy
      .mockResolvedValueOnce("Market risk is high due to concentration")
      .mockResolvedValueOnce("Regulatory risk: antitrust concerns");

    const crew = new RiskCrew();
    await crew.run("NVIDIA", "research", "analysis");

    const complianceMessage = runReactAgentSpy.mock.calls[1][1];
    expect(complianceMessage).toContain("Market risk is high due to concentration");
  });

  it("extracts structured risk score via LLM", async () => {
    const crew = new RiskCrew();
    const result = await crew.run("NVIDIA", "research", "analysis");

    expect(result.riskScore).toBe(6.5);
    expect(result.riskAssessment).toBeDefined();
  });

  it("falls back to 5.0 when structured output fails", async () => {
    mockWithStructuredOutput.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error("Schema validation failed")),
    });

    const crew = new RiskCrew();
    const result = await crew.run("NVIDIA", "research", "analysis");

    expect(result.riskScore).toBe(5.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// DeliveryCrew Behavior
// ═══════════════════════════════════════════════════════════════

describe("DeliveryCrew — MCP tool distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReactAgentSpy.mockResolvedValue("Delivered.");
  });

  it("assigns first MCP tool to knowledgeManager, rest to distributionCoordinator", async () => {
    const crew = new DeliveryCrew();
    await crew.run("NVIDIA", "Report content", 6.5);

    expect(buildReactAgentSpy).toHaveBeenCalledTimes(2);

    // KM agent gets 1st tool (notionSaveAnalysis)
    const kmTools = buildReactAgentSpy.mock.calls[0][0].tools;
    expect(kmTools).toHaveLength(1);
    expect(kmTools[0].name).toBe("notionSaveAnalysis");

    // Distribution agent gets remaining 3 tools
    const distTools = buildReactAgentSpy.mock.calls[1][0].tools;
    expect(distTools).toHaveLength(3);
    expect(distTools.map((t: any) => t.name)).toContain("gmailSendReport");
  });

  it("includes risk score in KM agent message", async () => {
    const crew = new DeliveryCrew();
    await crew.run("NVIDIA", "Report", 7.5);

    const kmMessage = runReactAgentSpy.mock.calls[0][1];
    expect(kmMessage).toContain("7.5");
    expect(kmMessage).toContain("NVIDIA");
  });

  it("returns completed status when agents succeed", async () => {
    const crew = new DeliveryCrew();
    const result = await crew.run("NVIDIA", "Report", 6);

    expect(result.deliveryStatus).toBe("completed");
    expect(result.notionSaved).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(result.meetingScheduled).toBe(true);
  });

  it("handles agent failure gracefully (non-fatal)", async () => {
    runReactAgentSpy.mockRejectedValue(new Error("Agent crashed"));

    const crew = new DeliveryCrew();
    const result = await crew.run("NVIDIA", "Report", 6);

    expect(result.deliveryStatus).toBe("skipped");
    expect(result.notionSaved).toBe(false);
    expect(result.emailSent).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// ReportWriterAgent Behavior
// ═══════════════════════════════════════════════════════════════

describe("ReportWriterAgent — construction and chains", () => {
  it("constructs 3 chains without throwing", () => {
    const agent = new ReportWriterAgent();
    expect(agent).toBeDefined();
    // Verify the agent has the expected methods
    expect(typeof agent.generate).toBe("function");
    expect(typeof agent.revise).toBe("function");
    expect(typeof agent.translate).toBe("function");
  });

  it("uses createLLM for each chain (3 calls for main + revision + translation)", async () => {
    vi.clearAllMocks();

    // Import the mocked createLLM
    const { createLLM } = await import("../config.js");

    new ReportWriterAgent();

    // Constructor builds 3 chains, each calling createLLM once
    expect(createLLM).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// DynamicPlanner Behavior
// ═══════════════════════════════════════════════════════════════

describe("DynamicPlanner — LLM call patterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createInitialPlan calls LLM with company and query in message", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify([
        { type: "research", description: "Research NVIDIA", priority: "critical", reasoning: "Key step" },
      ]),
    });

    const planner = new DynamicPlanner();
    await planner.createInitialPlan("NVIDIA", "Full due diligence", "full");

    expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
    const messages = mockLlmInvoke.mock.calls[0][0];
    expect(messages).toHaveLength(2);

    const humanMsg = messages[1];
    expect(humanMsg.content).toContain("NVIDIA");
    expect(humanMsg.content).toContain("Full due diligence");
    expect(humanMsg.content).toContain("full");
  });

  it("createInitialPlan includes available task types in message", async () => {
    mockLlmInvoke.mockResolvedValueOnce({ content: "[]" });

    const planner = new DynamicPlanner();
    await planner.createInitialPlan("Apple", "Quick check", "quick");

    const humanMsg = mockLlmInvoke.mock.calls[0][0][1];
    expect(humanMsg.content).toContain("research");
    expect(humanMsg.content).toContain("financial_analysis");
    expect(humanMsg.content).toContain("risk_assessment");
    expect(humanMsg.content).toContain("delivery");
  });

  it("parses valid JSON plan from LLM", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify([
        { type: "research", description: "Investigate", priority: "critical", reasoning: "Needed" },
        { type: "financial_analysis", description: "Financials", priority: "high", reasoning: "Key" },
      ]),
    });

    const planner = new DynamicPlanner();
    const plan = await planner.createInitialPlan("NVIDIA", "test", "full");

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].type).toBe("research");
    expect(plan.tasks[0].status).toBe("pending");
    expect(plan.version).toBe(1);
    expect(plan.company).toBe("NVIDIA");
  });

  it("uses fallback plan when LLM returns invalid JSON", async () => {
    mockLlmInvoke.mockResolvedValueOnce({ content: "This is not JSON at all." });

    const planner = new DynamicPlanner();
    const plan = await planner.createInitialPlan("NVIDIA", "test", "full");

    expect(plan.tasks.length).toBe(7);
    expect(plan.tasks[0].type).toBe("research");
    expect(plan.tasks[0].priority).toBe("critical");
  });

  it("handles markdown-wrapped JSON from LLM", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: '```json\n[{"type":"research","description":"Do it","priority":"high","reasoning":""}]\n```',
    });

    const planner = new DynamicPlanner();
    const plan = await planner.createInitialPlan("NVIDIA", "test", "full");

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].type).toBe("research");
  });

  it("adaptPlan calls LLM with completed task and result", async () => {
    mockLlmInvoke.mockResolvedValueOnce({ content: "[]" });

    const planner = new DynamicPlanner();
    const plan = {
      company: "NVIDIA",
      query: "analysis",
      tasks: [
        { type: "research" as const, description: "Research", priority: "critical" as const, reasoning: "", status: "completed" as const },
        { type: "financial_analysis" as const, description: "Finance", priority: "high" as const, reasoning: "", status: "pending" as const },
      ],
      version: 1,
      adaptations: [],
    };

    await planner.adaptPlan(plan, "research", "Found strong revenue growth");

    const humanMsg = mockLlmInvoke.mock.calls[0][0][1];
    expect(humanMsg.content).toContain("research");
    expect(humanMsg.content).toContain("Found strong revenue growth");
    expect(humanMsg.content).toContain("financial_analysis");
  });

  it("adaptPlan applies skip adaptations", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify([
        { action: "skip", task: "financial_analysis", reason: "Pre-revenue company" },
      ]),
    });

    const planner = new DynamicPlanner();
    const plan = {
      company: "StartupX",
      query: "analysis",
      tasks: [
        { type: "research" as const, description: "Research", priority: "critical" as const, reasoning: "", status: "completed" as const },
        { type: "financial_analysis" as const, description: "Finance", priority: "high" as const, reasoning: "", status: "pending" as const },
      ],
      version: 1,
      adaptations: [],
    };

    const adapted = await planner.adaptPlan(plan, "research", "result");

    const skippedTask = adapted.tasks.find((t) => t.type === "financial_analysis");
    expect(skippedTask!.status).toBe("skipped");
    expect(skippedTask!.priority).toBe("skip");
    expect(adapted.version).toBe(2);
    expect(adapted.adaptations).toHaveLength(1);
    expect(adapted.adaptations[0]).toContain("Skipped");
  });

  it("adaptPlan applies add adaptations", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify([
        { action: "add", task: "regulatory_analysis", reason: "Antitrust investigation announced" },
      ]),
    });

    const planner = new DynamicPlanner();
    const plan = {
      company: "Google",
      query: "analysis",
      tasks: [
        { type: "research" as const, description: "Research", priority: "critical" as const, reasoning: "", status: "completed" as const },
        { type: "report_generation" as const, description: "Report", priority: "high" as const, reasoning: "", status: "pending" as const },
      ],
      version: 1,
      adaptations: [],
    };

    const adapted = await planner.adaptPlan(plan, "research", "result");

    expect(adapted.tasks).toHaveLength(3);
    const added = adapted.tasks.find((t) => t.type === "regulatory_analysis");
    expect(added).toBeDefined();
    expect(added!.priority).toBe("high");
    expect(added!.status).toBe("pending");
    expect(adapted.adaptations[0]).toContain("Added");
  });

  it("adaptPlan skips LLM call when no remaining tasks", async () => {
    const planner = new DynamicPlanner();
    const plan = {
      company: "NVIDIA",
      query: "test",
      tasks: [
        { type: "research" as const, description: "Done", priority: "critical" as const, reasoning: "", status: "completed" as const },
      ],
      version: 1,
      adaptations: [],
    };

    const adapted = await planner.adaptPlan(plan, "research", "result");

    expect(mockLlmInvoke).not.toHaveBeenCalled();
    expect(adapted.version).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// ReflexionEngine Behavior
// ═══════════════════════════════════════════════════════════════

describe("ReflexionEngine — two-phase LLM evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let callCount = 0;
    mockWithStructuredOutput.mockImplementation(() => ({
      invoke: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) {
          // Evaluator phase
          return Promise.resolve({
            completeness: 2,
            dataQuality: 1.5,
            analyticalDepth: 1.5,
            actionability: 1,
            writingQuality: 1.5,
            overall: 7.5,
            reasoning: "Good coverage but lacks price targets",
          });
        }
        // Reflector phase
        return Promise.resolve({
          rootCauses: ["Missing price targets"],
          whatWorkedWell: "Strong financial analysis section",
          actionItems: ["Add bull/bear price targets", "Include peer comparison"],
          priority: "Add price targets",
          shouldRetry: false,
        });
      }),
    }));
  });

  it("makes two structured output LLM calls", async () => {
    const engine = new ReflexionEngine();
    await engine.evaluateAndReflect("Generate report", "# Report content", 1);

    expect(mockWithStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it("returns score from evaluation phase", async () => {
    const engine = new ReflexionEngine();
    const result = await engine.evaluateAndReflect("task", "output", 1);

    expect(result.score).toBe(7.5);
  });

  it("returns action items from reflection phase", async () => {
    const engine = new ReflexionEngine();
    const result = await engine.evaluateAndReflect("task", "output", 1);

    expect(result.actionItems).toEqual(["Add bull/bear price targets", "Include peer comparison"]);
  });

  it("accumulates memory across calls", async () => {
    const engine = new ReflexionEngine();

    await engine.evaluateAndReflect("task", "output v1", 1);
    const result2 = await engine.evaluateAndReflect("task", "output v2", 2);

    expect(result2.pastReflections).toContain("Attempt #1");
  });

  it("clamps score to [1, 10] range", async () => {
    let callCount = 0;
    mockWithStructuredOutput.mockImplementation(() => ({
      invoke: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) {
          return Promise.resolve({
            completeness: 2, dataQuality: 2, analyticalDepth: 2,
            actionability: 2, writingQuality: 2, overall: 15, // exceeds max
            reasoning: "Perfect",
          });
        }
        return Promise.resolve({
          rootCauses: [], whatWorkedWell: "All", actionItems: [],
          priority: "None", shouldRetry: false,
        });
      }),
    }));

    const engine = new ReflexionEngine();
    const result = await engine.evaluateAndReflect("task", "output", 1);

    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("uses fallback defaults when evaluation LLM fails", async () => {
    mockWithStructuredOutput.mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(new Error("LLM parse error")),
    }));

    const engine = new ReflexionEngine();
    const result = await engine.evaluateAndReflect("task", "output", 1);

    expect(result.score).toBe(5);
    expect(result.actionItems).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// ProcessRewardModel Behavior
// ═══════════════════════════════════════════════════════════════

describe("ProcessRewardModel — step evaluation LLM calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls LLM with step-specific rubric", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        score: 8, dimensions: { coverage: 9, recency: 7 }, issues: [],
        isBlocking: false, recommendation: "proceed", details: "Good research",
      }),
    });

    const prm = new ProcessRewardModel();
    await prm.evaluateStep("research", "Research output here");

    expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
    const humanMsg = mockLlmInvoke.mock.calls[0][0][1];
    expect(humanMsg.content).toContain("research");
    expect(humanMsg.content).toContain("Coverage");
    expect(humanMsg.content).toContain("Recency");
  });

  it("uses generic rubric for unknown step names", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        score: 7, dimensions: {}, issues: [], isBlocking: false,
        recommendation: "proceed", details: "",
      }),
    });

    const prm = new ProcessRewardModel();
    await prm.evaluateStep("custom_step", "Some output");

    const humanMsg = mockLlmInvoke.mock.calls[0][0][1];
    expect(humanMsg.content).toContain("completeness, quality, usefulness");
  });

  it("parses valid JSON response into StepEvaluation", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        score: 8.5, dimensions: { accuracy: 9, depth: 8 },
        issues: ["Missing Q4 data"], isBlocking: false,
        recommendation: "proceed", details: "Strong analysis",
      }),
    });

    const prm = new ProcessRewardModel();
    const result = await prm.evaluateStep("financial_analysis", "Financial output");

    expect(result.score).toBe(8.5);
    expect(result.issues).toEqual(["Missing Q4 data"]);
    expect(result.recommendation).toBe("proceed");
    expect(result.isBlocking).toBe(false);
  });

  it("falls back to safe defaults on parse failure", async () => {
    mockLlmInvoke.mockResolvedValueOnce({ content: "Not valid JSON at all" });

    const prm = new ProcessRewardModel();
    const result = await prm.evaluateStep("research", "output");

    expect(result.score).toBe(6.0);
    expect(result.isBlocking).toBe(false);
    expect(result.recommendation).toBe("proceed");
    expect(result.issues).toContain("Evaluation parsing failed");
  });

  it("accumulates evaluations across multiple calls", async () => {
    const makeResponse = (score: number) => ({
      content: JSON.stringify({
        score, dimensions: {}, issues: [], isBlocking: false,
        recommendation: "proceed", details: "",
      }),
    });

    mockLlmInvoke
      .mockResolvedValueOnce(makeResponse(7))
      .mockResolvedValueOnce(makeResponse(8))
      .mockResolvedValueOnce(makeResponse(6));

    const prm = new ProcessRewardModel();
    await prm.evaluateStep("research", "r");
    await prm.evaluateStep("financial_analysis", "f");
    await prm.evaluateStep("risk_assessment", "risk");

    const summary = prm.getSummary();
    expect(summary).toContain("research");
    expect(summary).toContain("financial_analysis");
    expect(summary).toContain("risk_assessment");
    expect(summary).toContain("7.0"); // average

    expect(prm.getWeakestStep()).toBe("risk_assessment");
    expect(prm.hasBlockingFailure()).toBe(false);
  });

  it("handles markdown-wrapped JSON from LLM", async () => {
    mockLlmInvoke.mockResolvedValueOnce({
      content: '```json\n{"score":9,"dimensions":{},"issues":[],"isBlocking":false,"recommendation":"proceed","details":""}\n```',
    });

    const prm = new ProcessRewardModel();
    const result = await prm.evaluateStep("research", "output");

    expect(result.score).toBe(9);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cross-cutting: Agent Configuration
// ═══════════════════════════════════════════════════════════════

describe("Cross-cutting — model and tool configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReactAgentSpy.mockResolvedValue("output");
  });

  it("all crew agents receive a model string", async () => {
    const research = new ResearchCrew();
    await research.run("NVIDIA", "test");

    for (const call of buildReactAgentSpy.mock.calls) {
      expect(call[0].model).toBeDefined();
      expect(typeof call[0].model).toBe("string");
    }
  });

  it("research crew runs 3 sequential agents", async () => {
    const crew = new ResearchCrew();
    await crew.run("NVIDIA", "test");

    expect(runReactAgentSpy).toHaveBeenCalledTimes(3);
  });

  it("analysis crew invokes 3 agents", async () => {
    const crew = new AnalysisCrew();
    await crew.run("NVIDIA", "research");

    expect(buildReactAgentSpy).toHaveBeenCalledTimes(3);
    expect(runReactAgentSpy).toHaveBeenCalledTimes(3);
  });
});
