# DECISIONS.md — Architecture Decision Records

> 按时间倒序排列，最新决策在最上面。
> 每条记录回答一个核心问题：为什么选 A 而不选 B？

---

### ADR-008: Turborepo monorepo structure

**Date**: 2026-02 (Phase 1)
**Status**: Accepted

**Context**
项目有三个独立部分：核心引擎 (core)、Web 仪表盘 (web)、CLI 入口 (cli)，需要共享类型和配置。

**Decision**
使用 Turborepo 管理 monorepo：`packages/core` + `apps/web` + `apps/cli`。

**Alternatives Considered**
- Nx: 功能更强但配置复杂 → Rejected：项目规模不需要 Nx 的 build graph 优化
- 单一 package: 简单但前后端耦合 → Rejected：web 和 core 的依赖树完全不同

**Consequences**
- core 包可被 web 和 cli 直接引用，类型共享零成本
- 需要 `tsconfig.json` 层级管理（root + packages + apps）

---

### ADR-007: Zod structured output over regex parsing

**Date**: 2026-02
**Status**: Accepted

**Context**
Reflexion Engine 和 RiskCrew 需要从 LLM 输出中提取结构化数据（评分、risk dimensions）。最初用正则提取，频繁出错。

**Decision**
使用 Zod schema + LangChain `withStructuredOutput()` 替代所有正则解析。

**Alternatives Considered**
- Regex parsing: 简单但脆弱 → Rejected：LLM 输出格式变化导致 silent failures
- JSON mode (OpenAI): 只保证 JSON 不保证 schema → Rejected：缺少 type-level 验证

**Consequences**
- Reflexion 评分、RiskScoreSchema（6维）、PRM 评估全部使用 Zod schema
- Schema 变更可被 TypeScript 编译器捕获
- 需要 LLM 支持 function calling / tool use

---

### ADR-006: Vitest over Jest

**Date**: 2026-02
**Status**: Accepted

**Context**
项目使用 ESM (`"type": "module"`)，Jest 的 ESM 支持不完整（需要 experimental flag + transform 配置）。

**Decision**
使用 Vitest v4.1.0 作为测试框架。

**Alternatives Considered**
- Jest: 生态更大但 ESM 支持差 → Rejected：需要 `--experimental-vm-modules` + babel transform
- Node.js test runner: 原生但功能少 → Rejected：缺少 mock、snapshot、coverage 集成

**Consequences**
- ESM 原生支持，zero-config
- 与 Vite 共享配置（但本项目不用 Vite bundling）
- 230+ tests 运行速度快（parallel by default）

---

### ADR-005: Compliance-as-infrastructure via MCP tools

**Date**: 2026-03
**Status**: Accepted

**Context**
HK 金融监管规则（HKMA/SFC/PDPO/HKEX）需要被 AI 系统消费。两个方向：hardcode 到 agent prompt vs 编码为独立工具。

**Decision**
将合规规则编码为 hk-regtech-mcp 中的 3 个 MCP 工具（check_hk_compliance, search_hkex_filings, assess_cross_border_risk），通过 MCP 协议暴露，任何兼容系统可调用。

**Alternatives Considered**
- Hardcode into agent prompts: 简单 → Rejected：不可复用，规则更新需改 agent 代码，其他 AI 系统无法使用
- 外部 RegTech API (Compliance.ai): 直接可用 → Rejected：没有 HK 市场覆盖，且非 MCP 协议

**Consequences**
- Compliance analyst 是唯一可调用 HK tools 的 agent（boundaries.test.ts 机械保证）
- 规则更新只需改 hk-regtech-mcp，不动 agentic-analyst 代码
- 面试叙事差异化："compliance-as-infrastructure，不是 hardcoded prompt"

---

### ADR-004: DeepSeek as default model

**Date**: 2026-02
**Status**: Accepted

**Context**
全链路需要 LLM 调用（10 agents + Reflexion + PRM + DynamicPlanner），成本敏感。

**Decision**
默认使用 DeepSeek-V3（`deepseek-chat`），全链路约 $0.025-0.03/report。通过 `detectProvider()` 支持一键切换到 GPT-4o 或 Claude。

**Alternatives Considered**
- GPT-4o: 质量好但成本高 100x → Rejected：每份报告 $2-3，不适合批量 watchlist
- Claude Sonnet: 质量好但成本中等 → Rejected：作为可选 provider 保留，不作默认
- Llama 3 (self-hosted): 免费但需 GPU → Rejected：增加部署复杂度

**Consequences**
- 预算上限 $0.50/report，CostTracker 实时监控
- 架构支持 multi-provider routing，env 变量切换（PLANNING_MODEL, RESEARCH_MODEL 等）

---

### ADR-003: DuckDuckGo + Yahoo Finance (free, no API key)

**Date**: 2026-01
**Status**: Accepted

**Context**
搜索和金融数据是 Research 和 Analysis crew 的核心依赖。需要稳定、免费、无 API key 的数据源。

**Decision**
搜索用 DuckDuckGo HTML 接口（解析 HTML 提取结果），金融数据用 Yahoo Finance API（crumb auth）。

**Alternatives Considered**
- Google Custom Search API: 质量好但每天 100 次免费限制 → Rejected：批量 watchlist 场景不够
- Serper API: 便宜但仍需 API key → Rejected：增加用户配置门槛
- Alpha Vantage: 免费但 rate limit 5/min → Rejected：10 agents 并发调用会超限

**Consequences**
- 零配置，`git clone` + `npm install` 即可运行
- DuckDuckGo 偶尔被 rate limit，通过 proxy 支持缓解
- Yahoo Finance 需要 crumb + cookie auth（已实现自动刷新）

---

### ADR-002: Skill-composition over monolithic agent

**Date**: 2026-01
**Status**: Accepted

**Context**
单个 LLM agent 处理完整投资分析：context window 不够，推理质量差，无法并行，成本不可控。

**Decision**
10 个专职 ReAct agent 分布在 4 个 skill domain，各自持有特定 tools，通过 LangGraph shared state 通信。

**Alternatives Considered**
- Single mega-agent: 简单但 context window 爆炸 → Rejected：单次分析需 50K+ tokens 输入
- Function calling pipeline (no agents): 确定性但缺少自主推理 → Rejected：agent 需要决定调用哪些 tools

**Consequences**
- 每个 agent 的 context 更小、更聚焦
- Analysis Crew 3 agents 可并行（Promise.all），节省 ~60% 时间
- 需要 boundaries.test.ts 保证 tool 隔离
- 增加了系统复杂度（10 个 agent 的 prompt 管理）

---

### ADR-001: LangGraph.js over Python LangGraph / CrewAI

**Date**: 2026-01
**Status**: Accepted

**Context**
需要 multi-agent orchestration framework。选项：Python LangGraph, CrewAI, AutoGen, TypeScript LangGraph.js。

**Decision**
选择 TypeScript + LangGraph.js 作为主运行时。

**Alternatives Considered**
- Python LangGraph: 更成熟 → Rejected：前端 Next.js 是 TypeScript，monorepo 共享类型更高效
- CrewAI: 更高层抽象 → Rejected：缺少 graph-level control（条件边、错误路由、检查点），无法实现 Reflexion 重试逻辑
- AutoGen: 多 agent 对话 → Rejected：对话模式不适合流水线架构

**Consequences**
- 和 Next.js 前端同栈，类型安全端到端
- LangGraph.js 生态比 Python 版小，部分 feature 滞后
- 需要自己实现一些 Python 版已有的功能

---

<!-- Add new ADRs above this line -->
