# CLAUDE.md — agentic-analyst

## Project Identity

**agentic-analyst**: Skill-composition 投资分析平台 — 10 个 ReAct Agent 分布在 4 个 Skill Domain，通过 LangGraph.js 编排。核心差异化是 compliance-as-infrastructure：香港金融监管规则（HKMA/SFC/PDPO/HKEX）编码为 MCP 工具，任何 MCP 兼容 AI 系统即插即用。

**定位**：Portfolio piece 展示工程能力（不是产品），但架构是 production-grade 的。

## Tech Stack

- **Runtime**: TypeScript + Node.js >=20
- **Orchestration**: LangGraph.js v0.2.40 + LangChain.js v0.3.x
- **Architecture**: 10 ReAct agents × 4 skill domains (Research, Analysis, Risk, Delivery)
- **Tools**: 14 tools (3 search + 2 finance + 9 MCP)
- **Skill Layer (MCP)**: [hk-regtech-mcp](../../hk-regtech-mcp/) — 9 composable tools (6 financial + 3 HK compliance)
- **Orchestration Skills**: Reflexion Engine, Process Reward Model, Dynamic Planner, Cost Tracker
- **Validation**: Zod (all inter-domain communication + tool parameters + risk scores)
- **Model Routing**: Multi-provider (DeepSeek / OpenAI / Anthropic) via `detectProvider()`
- **Frontend**: Next.js 15 + Supabase + real-time pipeline DAG visualization
- **Testing**: Vitest v4.1.0, 230+ tests across L1-L8 (8-layer test pyramid)
- **Monorepo**: Turborepo (packages/core, apps/web, apps/cli)

## Current Focus (as of 2026-03-24)

- Phase 1 strategic redesign COMPLETE (narrative reframe + CostTracker wiring)
- **Next**: Phase 2A — Build 3 HK regulatory compliance MCP tools in hk-regtech-mcp
- **Next**: Phase 2B — Wire HK compliance tools into agentic-analyst
- **Next**: Phase 3 — HK demo trace (Tencent), SkillsPanel component
- **Upcoming**: AWS deployment (EC2 + Docker), README polish, PyPI publish for hk-regtech-mcp

## Session Protocol

1. **Session start**: Read `memory_docs/ARCHITECTURE.md`, `memory_docs/DECISIONS.md`, and latest entries in `memory_docs/CHANGELOG.md`
2. **During work**: For any architectural decision, document it in `memory_docs/DECISIONS.md` before implementing
3. **Session end (MANDATORY)**: Update `memory_docs/CHANGELOG.md` with:
   - What changed (summary + file list)
   - Why it changed
   - What to do next (TODO for next session)
   - If architecture changed → also update `memory_docs/ARCHITECTURE.md`
   - If a design decision was made → also update `memory_docs/DECISIONS.md`

## Coding Preferences

- Prefer explicit types over `any`
- Use Zod for all external data validation and structured LLM output
- Follow existing patterns in codebase before introducing new ones
- Error handling: fail fast with descriptive messages
- Comments: explain "why", not "what"
- Test new features at the appropriate test layer (L1-L8)
- Architecture boundaries enforced by `boundaries.test.ts` — don't break them
