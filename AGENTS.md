# AGENTS.md — ai-investment-analyst

## Quick Reference

- **Architecture**: Skill-composition platform — 10 skills across 4 domains, orchestrated by LangGraph.js
- **Skill Domains**: Research, Analysis, Compliance & Risk, Delivery
- **Skill Layer (MCP)**: [fin-intel-mcp](../fin-intel-mcp/) — 9 composable financial intelligence tools (6 core + 3 HK regulatory)
- **Stack**: TypeScript, LangGraph.js, LangChain.js, Turborepo
- **Schema validation**: Zod (all inter-domain communication + tool parameters)
- **Orchestration Skills**: Reflexion Engine, Process Reward Model, Dynamic Planner, Cost Tracker
- **Model routing**: Multi-provider (DeepSeek / OpenAI / Anthropic) via `detectProvider()`

## Source Index

| Area | Entry Point | Description |
|------|------------|-------------|
| Orchestration | `packages/core/src/graph/workflow.ts` | LangGraph state machine + conditional edges |
| Nodes | `packages/core/src/graph/nodes.ts` | 9 node functions (planning → delivery → finalize) |
| Skill Domains | `packages/core/src/crews/index.ts` | 4 domains: Research, Analysis, Compliance & Risk, Delivery |
| Skill Builder | `packages/core/src/agents/reactAgent.ts` | ReAct agent factory with tool binding |
| Report Writer | `packages/core/src/agents/reportWriter.ts` | EN + ZH report generation |
| Config | `packages/core/src/config.ts` | LLM routing, skill roles, watchlist |
| Types | `packages/core/src/types/index.ts` | LangGraph state annotation + domain types |
| Tools | `packages/core/src/tools/` | searchTools, financeTools, mcpTools, hkComplianceTools |
| Orchestration Skills | `packages/core/src/skills/` | Reflexion, PRM, Planner, CostTracker |
| Integrations | `packages/core/src/integrations/` | Notion API, email (SMTP) |
| Skill Layer (MCP) | `../fin-intel-mcp/` | 9 composable tools: SEC RAG, sentiment, technical, HK compliance |
| Tests | `packages/core/src/__tests__/` | 8-layer test pyramid (~230 tests) |
| Pipeline Visualization | `apps/web/src/components/pipeline-dag.tsx` | Real-time DAG + execution log + cost tracking |
| Session State | `claude-progress.txt` | Current session state, blockers, and next steps |
| Web Dashboard | `apps/web/` | Next.js 15 + Supabase |
| CLI | `apps/cli/` | CLI entry point |

## Architectural Boundaries (enforced)

These constraints are validated by `boundaries.test.ts`:

1. **Skill isolation** — each skill receives ONLY its designated tools:
   - Research domain: search tools + MCP research tools (Notion search, Gmail search)
   - Analysis domain financial: finance tools only
   - Analysis domain market/tech: search tools only
   - Compliance & Risk domain: search tools + HK compliance tools (MCP)
   - Delivery domain: MCP delivery tools only (Notion save, Gmail send, Calendar)
   - Synthesizer: zero tools (pure reasoning)

2. **Domain communication** — skill domains communicate ONLY through LangGraph shared state, never directly

3. **Schema enforcement** — `RiskScoreSchema` (Zod) validates all risk dimension outputs (6 dimensions including regulatory)

4. **Cost guardrails** — per-report budget ceiling ($0.50 / 200K tokens), live cost tracking via CostTracker

5. **Compliance skill isolation** — HK regulatory tools (HKMA, SFC, PDPO, HKEX) are available ONLY to the compliance analyst skill, preventing accidental regulatory assertions from research or analysis domains

## Compliance-as-Infrastructure

Regulatory rules are encoded as composable MCP tools in `fin-intel-mcp`, not hardcoded into agent prompts:

| MCP Tool | Description | Regulator |
|----------|-------------|-----------|
| `check_hk_compliance` | Applicable regulatory requirements for a company/activity | HKMA, SFC, PDPO, HKEX |
| `search_hkex_filings` | HKEX announcements and disclosure filings | HKEX |
| `assess_cross_border_risk` | Cross-border regulatory risk (HK↔Mainland↔International) | PIPL, PDPO, Stock Connect |

This pattern — rules-as-data, compliance-as-skills — means any MCP-compatible agent can consume these tools. They are not coupled to this orchestrator.

## Build & Test Commands

```bash
# All tests (L1-L8)
npm run -w @repo/core test

# Type checking
npm run type-check

# Lint
npm run lint

# Architectural validation (boundaries + schemas)
npm run validate

# Garbage collection check (doc/code consistency)
npx tsx scripts/gc-check.ts

# Run analysis
npm run start -- --company "NVIDIA" --mode full
npm run start -- --company "Tencent" --mode full  # HK regulatory analysis
```

## When the Agent Struggles

If a task fails, do NOT retry with a different prompt. Instead:
1. Check if the required context/docs are discoverable from this file
2. Check if the architectural boundary is mechanically enforced (test/linter)
3. Check if there's a missing tool or data source
4. Add the fix to the repo, then retry
