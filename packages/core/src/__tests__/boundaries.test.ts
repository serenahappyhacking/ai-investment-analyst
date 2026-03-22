/**
 * L9: Architectural Boundary Tests
 * ==================================
 * Validates that crew → agent → tool assignments respect boundaries.
 * These are structural tests — they intercept agent construction and
 * verify tool arrays, not runtime behavior.
 *
 * When a boundary violation is detected, the failure message includes:
 *   - WHAT the boundary is
 *   - WHY it exists
 *   - HOW to fix the violation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Tool name constants (source of truth) ──────────────────────────

const SEARCH_TOOLS = ["web_search", "news_search", "competitor_search"];
const FINANCE_TOOLS = ["get_stock_info", "get_financial_history"];
const MCP_RESEARCH_TOOLS = ["notion_search_past_analyses", "gmail_search_newsletters"];
const MCP_DELIVERY_TOOLS = [
  "notion_save_analysis",
  "gmail_send_report",
  "calendar_schedule_review",
  "calendar_set_followup",
];

// ── Allowed tool sets per agent role ────────────────────────────────

const HK_COMPLIANCE_TOOLS = ["check_hk_compliance", "search_hkex_filings", "assess_cross_border_risk"];

const ALLOWED_TOOLS: Record<string, string[]> = {
  // Research crew
  webResearcher: [...SEARCH_TOOLS, ...MCP_RESEARCH_TOOLS],
  dataCollector: FINANCE_TOOLS,
  summarizer: [], // zero tools — pure reasoning

  // Analysis crew
  financialAnalyst: FINANCE_TOOLS,
  marketAnalyst: SEARCH_TOOLS,
  techAnalyst: SEARCH_TOOLS,

  // Risk crew
  riskAnalyst: SEARCH_TOOLS,
  complianceAnalyst: [...SEARCH_TOOLS, ...HK_COMPLIANCE_TOOLS],

  // Delivery crew
  knowledgeManager: MCP_DELIVERY_TOOLS,
  distributionCoordinator: MCP_DELIVERY_TOOLS,
};

// ── Capture buildReactAgent calls ───────────────────────────────────

interface CapturedAgent {
  role: string;
  toolNames: string[];
}

const capturedAgents: CapturedAgent[] = [];

vi.mock("../agents/reactAgent.js", () => ({
  buildReactAgent: (opts: { role: string; tools: Array<{ name: string }> }) => {
    capturedAgents.push({
      role: opts.role,
      toolNames: opts.tools.map((t) => t.name),
    });
    return { role: opts.role };
  },
  runReactAgent: vi.fn().mockResolvedValue("mocked agent output"),
}));

vi.mock("../config.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    createLLM: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ content: "mocked" }),
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          overallScore: 5,
          dimensions: { market: 5, operational: 5, competitive: 5, financial: 5, geopolitical: 5, regulatory: 5 },
          summary: "mock",
        }),
      }),
    }),
  };
});

// ── Tests ───────────────────────────────────────────────────────────

describe("L9: Architectural Boundaries", () => {
  beforeEach(() => {
    capturedAgents.length = 0;
  });

  describe("ResearchCrew tool boundaries", () => {
    it("assigns correct tools to each research agent", async () => {
      const { ResearchCrew } = await import("../crews/index.js");
      const crew = new ResearchCrew();
      await crew.run("TestCo", "test query");

      const researcher = capturedAgents.find((a) => a.role === "webResearcher");
      const collector = capturedAgents.find((a) => a.role === "dataCollector");
      const synthesizer = capturedAgents.find((a) => a.role === "summarizer");

      expect(researcher, "webResearcher agent should be created").toBeDefined();
      expect(collector, "dataCollector agent should be created").toBeDefined();
      expect(synthesizer, "summarizer agent should be created").toBeDefined();

      // webResearcher: search + MCP research tools
      for (const toolName of researcher!.toolNames) {
        expect(
          ALLOWED_TOOLS.webResearcher,
          `BOUNDARY VIOLATION: webResearcher received tool "${toolName}" which is not in its allowed set.\n` +
            `Boundary: Research agents must only use search + MCP research tools.\n` +
            `Why: Prevents research agents from triggering delivery actions (email/Notion save).\n` +
            `Fix: Remove "${toolName}" from the tools array in ResearchCrew.run()`
        ).toContain(toolName);
      }

      // dataCollector: finance tools only
      for (const toolName of collector!.toolNames) {
        expect(
          ALLOWED_TOOLS.dataCollector,
          `BOUNDARY VIOLATION: dataCollector received tool "${toolName}".\n` +
            `Boundary: Data collector must only use finance tools.\n` +
            `Why: Ensures quantitative data comes from structured financial APIs, not web scraping.\n` +
            `Fix: Remove "${toolName}" from tools in ResearchCrew and use getFinanceTools() only`
        ).toContain(toolName);
      }

      // summarizer: zero tools
      expect(
        synthesizer!.toolNames,
        `BOUNDARY VIOLATION: summarizer received tools ${JSON.stringify(synthesizer!.toolNames)}.\n` +
          `Boundary: Synthesizer must have zero tools — it's a pure reasoning agent.\n` +
          `Why: Synthesizer works over data already collected by other agents. Giving it tools would cause redundant API calls.\n` +
          `Fix: Pass an empty array [] as tools in ResearchCrew`
      ).toHaveLength(0);
    });
  });

  describe("AnalysisCrew tool boundaries", () => {
    it("assigns correct tools to each analyst", async () => {
      const { AnalysisCrew } = await import("../crews/index.js");
      const crew = new AnalysisCrew();
      await crew.run("TestCo", "test research summary");

      const financial = capturedAgents.find((a) => a.role === "financialAnalyst");
      const market = capturedAgents.find((a) => a.role === "marketAnalyst");
      const tech = capturedAgents.find((a) => a.role === "techAnalyst");

      expect(financial).toBeDefined();
      expect(market).toBeDefined();
      expect(tech).toBeDefined();

      // financialAnalyst: finance tools only (no search)
      for (const toolName of financial!.toolNames) {
        expect(
          ALLOWED_TOOLS.financialAnalyst,
          `BOUNDARY VIOLATION: financialAnalyst received "${toolName}".\n` +
            `Boundary: Financial analyst must only use finance tools (get_stock_info, get_financial_history).\n` +
            `Why: Financial analysis must be grounded in structured data, not web search results, to prevent data pollution.\n` +
            `Fix: Use getFinanceTools() only in AnalysisCrew.runFinancialAnalyst()`
        ).toContain(toolName);
      }

      // marketAnalyst: search tools only (no finance)
      for (const toolName of market!.toolNames) {
        expect(
          ALLOWED_TOOLS.marketAnalyst,
          `BOUNDARY VIOLATION: marketAnalyst received "${toolName}".\n` +
            `Boundary: Market analyst uses search tools for competitive intelligence.\n` +
            `Why: Market analysis is qualitative (TAM, moats, Porter's) — finance APIs would be unused noise.\n` +
            `Fix: Use getSearchTools() only in AnalysisCrew.runMarketAnalyst()`
        ).toContain(toolName);
      }

      // techAnalyst: search tools only
      for (const toolName of tech!.toolNames) {
        expect(
          ALLOWED_TOOLS.techAnalyst,
          `BOUNDARY VIOLATION: techAnalyst received "${toolName}".\n` +
            `Boundary: Tech analyst uses search tools for technology research.\n` +
            `Fix: Use getSearchTools() only in AnalysisCrew.runTechAnalyst()`
        ).toContain(toolName);
      }
    });
  });

  describe("RiskCrew tool boundaries", () => {
    it("assigns search tools only to risk agents", async () => {
      const { RiskCrew } = await import("../crews/index.js");
      const crew = new RiskCrew();
      await crew.run("TestCo", "research summary", "analysis context");

      const risk = capturedAgents.find((a) => a.role === "riskAnalyst");
      const compliance = capturedAgents.find((a) => a.role === "complianceAnalyst");

      expect(risk).toBeDefined();
      expect(compliance).toBeDefined();

      for (const toolName of risk!.toolNames) {
        expect(
          ALLOWED_TOOLS.riskAnalyst,
          `BOUNDARY VIOLATION: riskAnalyst received "${toolName}".\n` +
            `Boundary: Risk agents use search tools for current risk data.\n` +
            `Why: Risk assessment is about current events and regulations, not historical financials.\n` +
            `Fix: Use getSearchTools() only in RiskCrew.run()`
        ).toContain(toolName);
      }

      for (const toolName of compliance!.toolNames) {
        expect(
          ALLOWED_TOOLS.complianceAnalyst,
          `BOUNDARY VIOLATION: complianceAnalyst received "${toolName}".\n` +
            `Boundary: Compliance analyst uses search tools for regulatory research.\n` +
            `Fix: Use getSearchTools() only in RiskCrew.run()`
        ).toContain(toolName);
      }
    });
  });

  describe("Cross-crew isolation", () => {
    it("no agent receives tools from another crew's domain", async () => {
      // Run all crews
      const { ResearchCrew, AnalysisCrew, RiskCrew } = await import("../crews/index.js");

      await new ResearchCrew().run("TestCo", "query");
      await new AnalysisCrew().run("TestCo", "summary");
      await new RiskCrew().run("TestCo", "research", "analysis");

      for (const agent of capturedAgents) {
        const allowed = ALLOWED_TOOLS[agent.role];
        if (!allowed) continue;

        for (const toolName of agent.toolNames) {
          expect(
            allowed,
            `CROSS-CREW VIOLATION: "${agent.role}" received tool "${toolName}" from outside its boundary.\n` +
              `Allowed tools for ${agent.role}: [${allowed.join(", ")}]\n` +
              `Why: Cross-crew tool access breaks separation of concerns and can cause agents to take unauthorized actions.\n` +
              `Fix: Check the tool array passed to buildReactAgent() for role "${agent.role}" in crews/index.ts`
          ).toContain(toolName);
        }
      }
    });
  });

  describe("AGENT_ROLES completeness", () => {
    it("every instantiated agent role exists in AGENT_ROLES config", async () => {
      const { AGENT_ROLES } = await import("../config.js");
      const { ResearchCrew, AnalysisCrew, RiskCrew } = await import("../crews/index.js");

      await new ResearchCrew().run("TestCo", "query");
      await new AnalysisCrew().run("TestCo", "summary");
      await new RiskCrew().run("TestCo", "research", "analysis");

      const definedRoles = Object.keys(AGENT_ROLES);

      for (const agent of capturedAgents) {
        expect(
          definedRoles,
          `MISSING ROLE: Agent "${agent.role}" is instantiated in crews/index.ts but has no entry in AGENT_ROLES.\n` +
            `Why: Every agent needs a role definition (role, goal, backstory) for consistent prompt engineering.\n` +
            `Fix: Add "${agent.role}" to AGENT_ROLES in config.ts`
        ).toContain(agent.role);
      }
    });
  });
});
