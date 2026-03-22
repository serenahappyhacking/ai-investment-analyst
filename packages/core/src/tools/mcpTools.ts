/**
 * MCP (Model Context Protocol) Tool Integrations
 * =================================================
 * Wraps MCP server interactions as LangChain.js tools.
 *
 * Architecture:
 *   Agent → LangChain Tool → MCP Client → MCP Server → Service (Notion/Gmail/etc.)
 *
 * In production, these tools would use the @modelcontextprotocol/sdk
 * to communicate with real MCP servers. Here we show the integration
 * pattern with typed schemas.
 *
 * Available MCP servers:
 *   - Notion:  https://mcp.notion.com/mcp
 *   - Gmail:   https://gmail.mcp.claude.com/mcp
 *   - Calendar: https://gcal.mcp.claude.com/mcp
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { isNotionConfigured, saveReportToNotion } from "../integrations/notionClient.js";
import { isEmailConfigured, sendReportEmail } from "../integrations/emailClient.js";

// ═══════════════════════════════════════════════════════════════
// Notion MCP Tools
// ═══════════════════════════════════════════════════════════════

export const notionSaveAnalysis = tool(
  async ({ title, content, tags }): Promise<string> => {
    const tagList = tags
      ? tags.split(",").map((t: string) => t.trim())
      : [];

    // Use real Notion API when configured, otherwise stub
    if (isNotionConfigured()) {
      try {
        const result = await saveReportToNotion({
          company: title,
          report: content,
          tags: tagList,
        });
        return JSON.stringify({
          status: "success",
          message: `Analysis "${title}" saved to Notion`,
          pageUrl: result.pageUrl,
          pageId: result.pageId,
          tags: tagList,
        });
      } catch (error) {
        return JSON.stringify({
          status: "error",
          message: `Failed to save to Notion: ${String(error)}`,
        });
      }
    }

    return JSON.stringify({
      status: "success",
      message: `Analysis "${title}" saved to Notion (stub)`,
      pageUrl: `https://notion.so/team/analysis-${title.toLowerCase().replace(/\s+/g, "-")}`,
      tags: tagList,
      note: "Set NOTION_API_KEY + NOTION_DATABASE_ID for real integration",
    });
  },
  {
    name: "notion_save_analysis",
    description:
      "Save an analysis report to the team's Notion knowledge base. " +
      "Creates a searchable page for institutional memory.",
    schema: z.object({
      title: z.string().describe('Page title, e.g. "NVIDIA Analysis Q1 2025"'),
      content: z.string().describe("Full analysis content in Markdown"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags: tech,semiconductors,AI"),
    }),
  }
);

export const notionSearchPastAnalyses = tool(
  async ({ query, limit }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      query,
      results: [
        {
          title: `Past analysis matching "${query}"`,
          date: "2024-12-15",
          summary: "Previous deep-dive analysis available in Notion",
          url: "https://notion.so/team/past-analysis",
        },
      ],
      mcpServer: "notion",
    });
  },
  {
    name: "notion_search_past_analyses",
    description:
      "Search Notion knowledge base for past analyses. " +
      "Retrieve historical context to avoid duplicate work.",
    schema: z.object({
      query: z.string().describe("Search query, e.g. 'NVIDIA', 'semiconductor'"),
      limit: z.number().optional().default(5).describe("Max results"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Gmail MCP Tools
// ═══════════════════════════════════════════════════════════════

export const gmailSendReport = tool(
  async ({ to, subject, body, cc }): Promise<string> => {
    // Use real email when configured
    if (isEmailConfigured()) {
      try {
        const result = await sendReportEmail({
          company: subject,
          report: body,
        });
        return JSON.stringify({
          status: "success",
          message: `Report email sent to ${process.env.EMAIL_TO}`,
          messageId: result.messageId,
        });
      } catch (error) {
        return JSON.stringify({
          status: "error",
          message: `Email failed: ${String(error)}`,
        });
      }
    }

    return JSON.stringify({
      status: "success",
      message: `Report email sent to ${to} (stub)`,
      subject,
      cc: cc ?? "",
      note: "Set SMTP_HOST + SMTP_USER + SMTP_PASS + EMAIL_TO for real email",
    });
  },
  {
    name: "gmail_send_report",
    description:
      "Send the analysis report via Gmail to stakeholders. " +
      "Supports CC and attachments.",
    schema: z.object({
      to: z.string().describe("Recipient email"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (HTML supported)"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
    }),
  }
);

export const gmailSearchNewsletters = tool(
  async ({ company, days }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      query: `subject:(${company}) newer_than:${days ?? 30}d`,
      resultsCount: 0,
      results: [],
      mcpServer: "gmail",
    });
  },
  {
    name: "gmail_search_newsletters",
    description:
      "Search Gmail for industry newsletters about a company. " +
      "Gathers additional intelligence during research phase.",
    schema: z.object({
      company: z.string().describe("Company name"),
      days: z.number().optional().default(30).describe("Days to search back"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Calendar MCP Tools
// ═══════════════════════════════════════════════════════════════

export const calendarScheduleReview = tool(
  async ({ title, description, durationMinutes, attendees }): Promise<string> => {
    const attendeeList = attendees
      ? attendees.split(",").map((a: string) => a.trim())
      : [];

    return JSON.stringify({
      status: "success",
      message: `Review meeting "${title}" scheduled`,
      duration: `${durationMinutes ?? 30} minutes`,
      attendees: attendeeList,
      mcpServer: "calendar",
    });
  },
  {
    name: "calendar_schedule_review",
    description:
      "Schedule a review meeting on Google Calendar. " +
      "Includes analysis summary in the event.",
    schema: z.object({
      title: z.string().describe('Meeting title, e.g. "NVIDIA Analysis Review"'),
      description: z.string().describe("Meeting description with key findings"),
      durationMinutes: z.number().optional().default(30),
      attendees: z.string().optional().describe("Comma-separated emails"),
    }),
  }
);

export const calendarSetFollowup = tool(
  async ({ company, triggerEvent, reminderDate, notes }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      company,
      trigger: triggerEvent,
      reminderDate,
      notes: notes ?? "",
      mcpServer: "calendar",
    });
  },
  {
    name: "calendar_set_followup",
    description:
      "Set a follow-up reminder for key catalyst dates " +
      "(earnings, regulatory decisions, price reviews).",
    schema: z.object({
      company: z.string(),
      triggerEvent: z.string().describe('e.g. "Q2 2025 Earnings"'),
      reminderDate: z.string().describe("ISO date format"),
      notes: z.string().optional(),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// HK Regulatory Compliance MCP Tools (Compliance-as-Infrastructure)
// ═══════════════════════════════════════════════════════════════

export const hkComplianceCheck = tool(
  async ({ ticker, activityType, jurisdiction }): Promise<string> => {
    // In production: calls fin-intel-mcp via MCP protocol
    // Here: demonstrates the tool interface pattern
    return JSON.stringify({
      status: "success",
      ticker,
      activityType,
      jurisdiction: jurisdiction ?? "HK",
      applicableRules: [
        { regulator: "HKMA", rule: "TM-G-1 Technology Risk Management", applies: true },
        { regulator: "SFC", rule: "AI Guidance for Licensed Corporations", applies: true },
        { regulator: "PDPO", rule: "Data Protection Principles for AI", applies: true },
      ],
      mcpServer: "fin-intel-mcp",
    });
  },
  {
    name: "check_hk_compliance",
    description:
      "Check applicable Hong Kong regulatory requirements (HKMA, SFC, PDPO, HKEX) for a company or activity. " +
      "Returns matching rules with citations.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. 0700.HK"),
      activityType: z.string().describe("Activity type: ai_deployment, crypto, data_privacy, listing, cross_border"),
      jurisdiction: z.string().optional().default("HK").describe("Jurisdiction code"),
    }),
  }
);

export const hkexFilingSearch = tool(
  async ({ ticker, filingType, period }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      ticker,
      filingType: filingType ?? "all",
      period: period ?? "1y",
      filings: [
        { title: `${ticker} Annual Results`, type: "Annual Results", date: "2025-03-20" },
        { title: `${ticker} ESG Report 2024`, type: "ESG Report", date: "2025-04-01" },
      ],
      mcpServer: "fin-intel-mcp",
    });
  },
  {
    name: "search_hkex_filings",
    description:
      "Search HKEX announcements and disclosure filings for a listed company. " +
      "Returns annual results, connected transactions, ESG reports.",
    schema: z.object({
      ticker: z.string().describe("HKEX stock code, e.g. 0700.HK"),
      filingType: z.string().optional().describe("Filter: Annual Results, Connected Transaction, ESG Report"),
      period: z.string().optional().default("1y").describe("Time period: 6mo, 1y, 2y"),
    }),
  }
);

export const crossBorderRiskAssess = tool(
  async ({ ticker, sourceJurisdiction, targetJurisdiction }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      ticker,
      sourceJurisdiction: sourceJurisdiction ?? "HK",
      targetJurisdiction: targetJurisdiction ?? "CN",
      riskFactors: [
        { factor: "data_localization", severity: "high", description: "PIPL requires mainland data residency" },
        { factor: "capital_flow_restrictions", severity: "medium", description: "Stock Connect daily quotas apply" },
        { factor: "vie_structure_risk", severity: "medium", description: "VIE regulatory uncertainty ongoing" },
      ],
      overallRiskScore: 7.2,
      mcpServer: "fin-intel-mcp",
    });
  },
  {
    name: "assess_cross_border_risk",
    description:
      "Assess cross-border regulatory risk for companies operating across HK, Mainland China, and international jurisdictions. " +
      "Covers data localization, capital flows, dual-listing compliance, sanctions.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker"),
      sourceJurisdiction: z.string().optional().default("HK").describe("Source: HK, US, CN"),
      targetJurisdiction: z.string().optional().default("CN").describe("Target: HK, US, CN"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool Collections
// ═══════════════════════════════════════════════════════════════

export function getMcpResearchTools() {
  return [notionSearchPastAnalyses, gmailSearchNewsletters];
}

export function getMcpDeliveryTools() {
  return [
    notionSaveAnalysis,
    gmailSendReport,
    calendarScheduleReview,
    calendarSetFollowup,
  ];
}

export function getHKComplianceTools() {
  return [hkComplianceCheck, hkexFilingSearch, crossBorderRiskAssess];
}

export function getAllMcpTools() {
  return [...getMcpResearchTools(), ...getMcpDeliveryTools(), ...getHKComplianceTools()];
}
