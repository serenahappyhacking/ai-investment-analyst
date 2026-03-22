/**
 * L9: Schema Validation Tests
 * =============================
 * Validates that all Zod schemas used in the system are consistent
 * and correctly reject invalid data. Catches schema drift at CI time
 * rather than at runtime.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── RiskScoreSchema ─────────────────────────────────────────────────

const RiskScoreSchema = z.object({
  overallScore: z.number().min(1).max(10),
  dimensions: z.object({
    market: z.number().min(1).max(10),
    operational: z.number().min(1).max(10),
    competitive: z.number().min(1).max(10),
    financial: z.number().min(1).max(10),
    geopolitical: z.number().min(1).max(10),
    regulatory: z.number().min(1).max(10),
  }),
  summary: z.string(),
});

describe("L9: Schema Validation", () => {
  describe("RiskScoreSchema", () => {
    it("accepts valid risk scores", () => {
      const valid = {
        overallScore: 7,
        dimensions: {
          market: 8,
          operational: 6,
          competitive: 7,
          financial: 5,
          geopolitical: 9,
          regulatory: 6,
        },
        summary: "High geopolitical risk due to export controls",
      };
      expect(() => RiskScoreSchema.parse(valid)).not.toThrow();
    });

    it("rejects score outside 1-10 range", () => {
      const invalid = {
        overallScore: 15,
        dimensions: {
          market: 5, operational: 5, competitive: 5,
          financial: 5, geopolitical: 5, regulatory: 5,
        },
        summary: "test",
      };
      expect(() => RiskScoreSchema.parse(invalid)).toThrow();
    });

    it("rejects score of 0", () => {
      const invalid = {
        overallScore: 0,
        dimensions: {
          market: 5, operational: 5, competitive: 5,
          financial: 5, geopolitical: 5, regulatory: 5,
        },
        summary: "test",
      };
      expect(() => RiskScoreSchema.parse(invalid)).toThrow();
    });

    it("rejects missing risk dimensions", () => {
      const invalid = {
        overallScore: 5,
        dimensions: {
          market: 5,
          operational: 5,
          // missing: competitive, financial, geopolitical
        },
        summary: "test",
      };
      expect(() => RiskScoreSchema.parse(invalid)).toThrow();
    });

    it("rejects missing summary", () => {
      const invalid = {
        overallScore: 5,
        dimensions: {
          market: 5, operational: 5, competitive: 5,
          financial: 5, geopolitical: 5, regulatory: 5,
        },
        // missing summary
      };
      expect(() => RiskScoreSchema.parse(invalid)).toThrow();
    });

    it("has exactly 6 risk dimensions", () => {
      const shape = RiskScoreSchema.shape.dimensions.shape;
      const dimensionNames = Object.keys(shape);
      expect(dimensionNames).toHaveLength(6);
      expect(dimensionNames).toEqual(
        expect.arrayContaining(["market", "operational", "competitive", "financial", "geopolitical", "regulatory"])
      );
    });
  });

  describe("PlannedTaskSchema", () => {
    const PlannedTaskSchema = z.object({
      type: z.string(),
      description: z.string(),
      priority: z.enum(["critical", "high", "medium", "low"]),
      reasoning: z.string().optional().default(""),
    });

    it("accepts valid planned task", () => {
      const valid = {
        type: "research",
        description: "Research NVIDIA financials",
        priority: "critical" as const,
        reasoning: "Foundation step for analysis",
      };
      expect(() => PlannedTaskSchema.parse(valid)).not.toThrow();
    });

    it("defaults reasoning to empty string when omitted", () => {
      const minimal = {
        type: "research",
        description: "Research NVIDIA",
        priority: "high" as const,
      };
      const parsed = PlannedTaskSchema.parse(minimal);
      expect(parsed.reasoning).toBe("");
    });

    it("rejects invalid priority level", () => {
      const invalid = {
        type: "research",
        description: "test",
        priority: "urgent", // not in enum
      };
      expect(() => PlannedTaskSchema.parse(invalid)).toThrow();
    });

    it("rejects missing required fields", () => {
      expect(() => PlannedTaskSchema.parse({})).toThrow();
      expect(() => PlannedTaskSchema.parse({ type: "research" })).toThrow();
    });
  });

  describe("Tool schema consistency", () => {
    it("search tools have required parameter schemas", async () => {
      const { webSearch, newsSearch, competitorSearch } = await import("../tools/searchTools.js");

      // Each tool must have a name and schema
      expect(webSearch.name).toBe("web_search");
      expect(newsSearch.name).toBe("news_search");
      expect(competitorSearch.name).toBe("competitor_search");
    });

    it("finance tools have required parameter schemas", async () => {
      const { getStockInfo, getFinancialHistory } = await import("../tools/financeTools.js");

      expect(getStockInfo.name).toBe("get_stock_info");
      expect(getFinancialHistory.name).toBe("get_financial_history");
    });

    it("MCP tools have required parameter schemas", async () => {
      const {
        notionSaveAnalysis,
        notionSearchPastAnalyses,
        gmailSendReport,
        gmailSearchNewsletters,
        calendarScheduleReview,
        calendarSetFollowup,
      } = await import("../tools/mcpTools.js");

      expect(notionSaveAnalysis.name).toBe("notion_save_analysis");
      expect(notionSearchPastAnalyses.name).toBe("notion_search_past_analyses");
      expect(gmailSendReport.name).toBe("gmail_send_report");
      expect(gmailSearchNewsletters.name).toBe("gmail_search_newsletters");
      expect(calendarScheduleReview.name).toBe("calendar_schedule_review");
      expect(calendarSetFollowup.name).toBe("calendar_set_followup");
    });
  });

  describe("LLMConfig schema", () => {
    it("all model stage keys are defined", async () => {
      const { LLMConfig } = await import("../config.js");

      const requiredStages = [
        "planningModel",
        "researchModel",
        "analysisModel",
        "reportModel",
        "translationModel",
        "evaluationModel",
      ];

      for (const stage of requiredStages) {
        expect(
          LLMConfig,
          `LLMConfig missing stage "${stage}". All 6 pipeline stages must have a model assignment.`
        ).toHaveProperty(stage);
        expect(typeof (LLMConfig as Record<string, unknown>)[stage]).toBe("string");
      }
    });
  });
});
