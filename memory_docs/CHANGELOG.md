# CHANGELOG.md

> 按时间倒序排列，最新变更在最上面。
> 每个 Claude Code session 结束前必须更新此文件。
> 超过 500 行时，将旧内容移至 docs/changelog-archive/YYYY-MM.md

---

### 2026-03-22 Session via Claude Code

**Summary**: Phase 1 strategic redesign完成 — 叙事重构 + CostTracker 接入实时数据

**Changes**:
- 叙事重构："4-crew/10-agent" → "4 Skill Domains, skill-composition platform" (`AGENTS.md`, `README.md`)
- 添加 "Skill Layer: fin-intel-mcp" 和 "Compliance-as-Infrastructure" 到 README
- CostTracker 接入 LangChain callbacks，记录所有 LLM 调用的真实 token 使用 (`config.ts`, `costTracker.ts`)
- DeepSeek/Claude 定价添加到 MODEL_PRICING (`costTracker.ts`)
- `createLLM()` 添加 cost-tracking callbacks (`config.ts`)
- `finalizeNode()` 从 globalCostTracker 生成真实成本报告 (`nodes.ts`)
- `workflow.ts` 发射真实 cost_update PipelineEvent
- 确认 PRM `evaluateStep()` 和 DynamicPlanner `adaptPlan()` 已在 nodes.ts 中调用

**Why**: 面试准备 — 叙事差异化 + 功能完整性

**Next TODO**:
- [ ] Phase 2A: Build 3 HK regulatory compliance MCP tools in hk-regtech-mcp
- [ ] Phase 2B: Wire HK compliance tools into agentic-analyst
- [ ] Phase 3: HK demo trace (Tencent), skill_invocation event, SkillsPanel

**Decisions Made**: 无新 ADR

---

### 2026-03-20 Session via Claude Code

**Summary**: Pipeline 可视化修复 — 动态公司名、相对日期、React bugs

**Changes**:
- Pipeline DAG 显示动态公司名（不再硬编码 "NVIDIA"）(`pipeline-dag.tsx`)
- 日期显示改为相对格式 (`pipeline-dag.tsx`)
- 修复多个 React hydration 和状态管理 bugs (`pipeline-dag.tsx`)

**Why**: Demo 演示时需要支持任意公司，不能只展示 NVIDIA

**Next TODO**:
- [ ] Strategic redesign Phase 1 (narrative reframe)

**Decisions Made**: 无

---

### 2026-03-18 Session via Claude Code

**Summary**: Skill-composition 架构 + Pipeline 可视化 + HK compliance tools 骨架

**Changes**:
- PipelineEvent 系统、SSE streaming、demo playback (`workflow.ts`, `apps/web/`)
- DAG 可视化组件 (`pipeline-dag.tsx`, `pipeline-graph.ts`)
- Execution log、cost summary card
- HK compliance tools 定义 (`mcpTools.ts`: check_hk_compliance, search_hkex_filings, assess_cross_border_risk)
- Compliance analyst agent 添加到 RiskCrew (`crews/index.ts`)
- RiskScoreSchema 扩展为 6 维（添加 regulatory）(`crews/index.ts`)

**Why**: 面试 demo 需要可视化流水线 + HK 差异化

**Decisions Made**: ADR-005 (compliance-as-infrastructure)

---

### 2026-03-16 Session via Claude Code

**Summary**: Harness engineering — AGENTS.md + boundary tests + schema tests + gc-check

**Changes**:
- 创建 `AGENTS.md` 项目快速参考文件
- `boundaries.test.ts` — 验证 skill isolation (每个 agent 只能访问指定 tools)
- `schemas.test.ts` — 验证 Zod schema 覆盖所有 inter-domain 通信
- `scripts/gc-check.ts` — 文档/代码一致性检查

**Why**: 架构约束需要机械化保证，不能靠文档约定

**Decisions Made**: 无

---

### 2026-03-14 Session via Claude Code

**Summary**: 8 层测试金字塔完成 (L1-L8, 230+ tests)

**Changes**:
- L5 eval tests with real LLM API calls (`llm.eval.test.ts`)
- L4 agent behavior tests (`agent.behavior.test.ts`)
- L6 golden regression tests (`golden.regression.test.ts`)
- L7 chaos/resilience tests, 41 tests (`chaos.resilience.test.ts`)
- L8 cost guard tests (`cost.guard.test.ts`)

**Why**: Production-grade 工程标准，面试可展示

---

### 2026-03-12 Session via Claude Code

**Summary**: L1-L3 测试基础 + multi-provider model routing

**Changes**:
- Vitest 基础设施 + 63 unit tests (`config.test.ts`, `nodes.helpers.test.ts`, etc.)
- L2 node integration + L3 graph integration tests
- `detectProvider()` 支持 DeepSeek / OpenAI / Anthropic auto-routing (`config.ts`)

**Why**: 测试覆盖 + model 灵活性

---

### 2026-03 Earlier Sessions

**Summary**: Agentic architecture upgrade + Turborepo setup

**Changes**:
- ReAct agents (LangGraph createReactAgent) 替代 single-turn bindTools (`reactAgent.ts`, `crews/index.ts`)
- Zod structured output 替代 regex parsing (`reflexion.ts`, `crews/index.ts`)
- PRM step-level evaluation at every node (`processReward.ts`, `nodes.ts`)
- DynamicPlanner adaptive planning (`dynamicPlanner.ts`, `nodes.ts`)
- Turborepo monorepo: packages/core + apps/web + apps/cli
- Next.js 15 dashboard + Supabase auth
- i18n (EN/ZH) + light/dark theme

---

### 2026-03-24 Current TODO

- [ ] Phase 2A: Build 3 HK regulatory compliance MCP tools in hk-regtech-mcp (check_hk_compliance, search_hkex_filings, assess_cross_border_risk)
- [ ] Phase 2B: Wire HK compliance tools into agentic-analyst (mcpTools, RiskCrew, boundaries tests)
- [ ] Phase 3: HK demo trace (Tencent), skill_invocation event type, SkillsPanel component
- [ ] AWS deployment (EC2 + Docker Compose + Nginx)
- [ ] hk-regtech-mcp publish to PyPI
- [ ] README final polish with deploy link + architecture diagram + screenshots

---

<!-- Add new entries above this line -->
