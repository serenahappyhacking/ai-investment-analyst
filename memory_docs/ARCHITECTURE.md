# ARCHITECTURE.md — agentic-analyst

> Last updated: 2026-03-24
> Update this file when the system architecture actually changes, not for every code commit.

## System Overview

```
Planning → Context → Research → [conditional] → Analysis → [conditional] → Risk → Report → Reflexion → [conditional] → Delivery → Finalize
```

10 ReAct agents across 4 skill domains, orchestrated via LangGraph.js state machine with conditional routing. Each agent autonomously decides which tools to call, observes results, and reasons over multiple turns.

## LangGraph Workflow (9 Nodes)

```
START
  ↓
planningNode ─── DynamicPlanner creates execution plan
  ↓
notionContextNode ─── Load historical context via Notion API
  ↓
researchNode ─── ResearchCrew: 3 agents sequential
  ↓
[routeAfterResearch]
  ├→ research (retry if blocked & retries < 2)
  ├→ report (degrade if max retries exceeded)
  └→ analysis (proceed)
  ↓
analysisNode ─── AnalysisCrew: 3 agents parallel
  ↓
[shouldSkipRisk]
  ├→ risk (full mode)
  └→ report (quick mode)
  ↓
riskNode ─── RiskCrew: 2 agents sequential
  ↓
reportNode ─── ReportWriter (EN + ZH) + live Yahoo Finance data injection
  ↓
reflexionNode ─── 5-dim evaluation + reflection
  ↓
[routeAfterReflexion]
  ├→ report (retry if score < 7.0 & iterations < 3)
  └→ delivery (proceed or force ship)
  ↓
deliveryNode ─── Notion save + email + calendar
  ↓
finalizeNode ─── PRM summary + cost report
  ↓
END
```

## Crew & Agent Map

### Research Crew (3 agents, sequential)
| Agent | Role | Tools |
|-------|------|-------|
| Web Researcher | Company overview, news, market position | web_search, news_search, competitor_search + MCP (notion_search, gmail_search) |
| Data Collector | Valuation metrics, revenue, margins, balance sheet | get_stock_info, get_financial_history |
| Synthesizer | 500-800 word intelligence brief from above data | (none — pure reasoning) |

### Analysis Crew (3 agents, parallel via Promise.all)
| Agent | Role | Tools |
|-------|------|-------|
| Financial Analyst | Valuation, growth, profitability, bull/base/bear targets | get_stock_info, get_financial_history |
| Market Analyst | TAM/SAM, moat, Porter's Five Forces, competitors | web_search, news_search, competitor_search |
| Tech Analyst | Tech stack, R&D, innovation pipeline, disruption risks | web_search, news_search, competitor_search |

### Risk Crew (2 agents, sequential)
| Agent | Role | Tools |
|-------|------|-------|
| Risk Analyst | 5 risk dimensions (market, operational, competitive, financial, geopolitical) | web_search, news_search, competitor_search |
| Compliance Analyst | Regulatory & compliance (HKMA, SFC, PDPO, HKEX, SEC) | web_search + check_hk_compliance, search_hkex_filings, assess_cross_border_risk |

Output: **RiskScoreSchema** (Zod) — 6 dimensions (market, operational, competitive, financial, geopolitical, regulatory), each 1-10.

### Delivery Crew (2 agents)
| Agent | Role | Tools |
|-------|------|-------|
| Knowledge Manager | Save report to Notion | notion_save_analysis |
| Distribution Coordinator | Email report, schedule review, set follow-ups | gmail_send_report, calendar_schedule_review, calendar_set_followup |

## Tools Inventory (14 total)

| Category | Tool | Source |
|----------|------|--------|
| Search (3) | web_search, news_search, competitor_search | Local (`searchTools.ts`) — DuckDuckGo HTML |
| Finance (2) | get_stock_info, get_financial_history | Local (`financeTools.ts`) — Yahoo Finance API |
| MCP Research (2) | notion_search_past_analyses, gmail_search_newsletters | MCP (`mcpTools.ts`) |
| MCP Delivery (4) | notion_save_analysis, gmail_send_report, calendar_schedule_review, calendar_set_followup | MCP (`mcpTools.ts`) |
| MCP HK Compliance (3) | check_hk_compliance, search_hkex_filings, assess_cross_border_risk | MCP (`mcpTools.ts`) — compliance-as-infrastructure |

## Orchestration Skills

1. **Reflexion Engine** (`skills/reflexion.ts`) — 5-dim evaluation (completeness, dataQuality, analyticalDepth, actionability, writingQuality) → reflection with rootCauses + actionItems → shouldRetry decision. Threshold: 7.0/10.
2. **Process Reward Model** (`skills/processReward.ts`) — Step-level quality evaluation at each node. Scores 1-10 per step. Detects blocking failures. Reports weakest step at finalization.
3. **Dynamic Planner** (`skills/dynamicPlanner.ts`) — Creates initial plan from company/query/mode, adapts plan after each major node based on actual results. Version-tracked adaptations.
4. **Cost Tracker** (`skills/costTracker.ts`) — Records every LLM call via LangChain callbacks. Per-agent cost tracking. Budget ceiling: $0.50 / 200K tokens per report. Generates cost breakdown report at finalization.

## Testing Framework (L1-L8)

| Layer | Name | Tests | Status | File |
|-------|------|-------|--------|------|
| L1 | Unit (Core Logic) | 28 | ✅ Done | config.test.ts, nodes.helpers.test.ts, reportWriter.test.ts |
| L2 | Node Integration | 17 | ✅ Done | nodes.integration.test.ts |
| L3 | Graph Integration | 8 | ✅ Done | graph.integration.test.ts |
| L4 | Agent Behavior | 45 | ✅ Done | agent.behavior.test.ts |
| L5 | LLM Evaluation | 7 | ✅ Done | llm.eval.test.ts (requires API keys) |
| L6 | Golden Regression | 13 | ✅ Done | golden.regression.test.ts |
| L7 | Chaos/Resilience | 41 | ✅ Done | chaos.resilience.test.ts |
| L8 | Cost Guard | 22 | ✅ Done | cost.guard.test.ts |
| — | Architecture | 67 | ✅ Done | boundaries.test.ts, schemas.test.ts, workflow.routing.test.ts, dynamicPlanner.test.ts, processReward.test.ts, reflexion.test.ts |

**Total**: 230+ tests, all passing. Run: `npm run -w @repo/core test`

## Directory Structure

```
agentic-analyst/                    # Turborepo monorepo root
├── packages/core/src/              # Core engine (@repo/core)
│   ├── agents/                     # ReAct agent factory + report writer
│   │   ├── reactAgent.ts
│   │   └── reportWriter.ts
│   ├── crews/                      # 4 skill domains
│   │   └── index.ts               # ResearchCrew, AnalysisCrew, RiskCrew, DeliveryCrew
│   ├── graph/                      # LangGraph orchestration
│   │   ├── workflow.ts             # State machine + conditional edges
│   │   └── nodes.ts               # 9 node functions
│   ├── skills/                     # Orchestration skills
│   │   ├── reflexion.ts
│   │   ├── processReward.ts
│   │   ├── dynamicPlanner.ts
│   │   └── costTracker.ts
│   ├── tools/                      # Tool definitions
│   │   ├── searchTools.ts          # DuckDuckGo (3 tools)
│   │   ├── financeTools.ts         # Yahoo Finance (2 tools)
│   │   └── mcpTools.ts             # MCP: Notion, Gmail, Calendar, HK compliance (9 tools)
│   ├── integrations/               # Direct API clients
│   │   ├── notionClient.ts
│   │   └── emailClient.ts
│   ├── types/                      # LangGraph state annotation + domain types
│   │   └── index.ts
│   ├── config.ts                   # LLM routing, agent roles, watchlist
│   ├── __tests__/                  # 16 test files (L1-L8)
│   └── index.ts
├── apps/web/                       # Next.js 15 dashboard
│   └── src/components/
│       └── pipeline-dag.tsx        # Real-time DAG visualization (SVG)
├── apps/cli/                       # CLI entry point
├── memory_docs/                    # Project memory (this file system)
└── AGENTS.md                       # Quick reference for Claude Code
```

## Key Data Flows

1. **Input**: Company name + query + mode (full/quick)
2. **Planning**: DynamicPlanner creates task list, version-tracked
3. **Research**: Web search + finance API → qualitative + quantitative data → synthesized brief
4. **Analysis**: 3 parallel analysts (financial, market, tech) each with specialized tools
5. **Risk**: Risk analyst + compliance analyst → 6-dimension RiskScoreSchema (Zod validated)
6. **Report**: EN + ZH generation with live Yahoo Finance data injection
7. **Quality Loop**: Reflexion evaluates → reflects → retries if score < 7.0 (max 3 iterations)
8. **Delivery**: Notion save + email send + calendar scheduling
9. **Finalize**: PRM pipeline summary + CostTracker cost report
10. **Output**: Final report + cost breakdown + delivery status, streamed via SSE to web dashboard
