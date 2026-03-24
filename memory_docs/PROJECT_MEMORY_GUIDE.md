# agentic-analyst — 项目记忆文件体系

## 设计原则

每个新的 Claude Code session 启动时，只需读取这几个文件就能完全接上上下文。
文件按 **更新频率** 分层，避免高频小改动污染低频战略文档。

---

## 文件清单（共 4 个）

```
agentic-analyst/memory_docs/
├── CLAUDE.md              ← Claude Code 会话入口（自动读取根目录 CLAUDE.md 后引导到这里）
├── ARCHITECTURE.md        ← 当前架构全景（低频更新，架构变了才动）
├── DECISIONS.md           ← 架构决策记录 ADR（中频更新，选 A 不选 B 的理由）
└── CHANGELOG.md           ← 变更日志 + 下一步 TODO（高频更新，session 接力棒）
```

---

## 1. CLAUDE.md — Claude Code 会话入口（最重要）

**作用**：提供项目定位、技术栈、当前重点的快照，并引导 Claude Code 读取其他文件。

**内容包含**：
- 项目一句话定位（skill-composition 投资分析平台）
- 技术栈摘要（TypeScript, LangGraph.js, 10 agents × 4 crews, 14 tools）
- 当前开发阶段和重点
- 指向其他 3 个文件的引用指令
- 编码规范和偏好

**更新时机**：每当开发阶段/重点发生变化时更新。

---

## 2. ARCHITECTURE.md — 架构全景

**作用**：描述系统"现在长什么样"，而不是"怎么变成这样的"。

**内容包含**：
- LangGraph 工作流（9 节点 + 条件路由）
- 4 Crew × 10 Agent 清单及各自 tools
- 4 个编排技能（Reflexion, PRM, DynamicPlanner, CostTracker）
- 测试框架 L1-L8 当前状态（230+ tests）
- 目录结构

**更新时机**：架构实际发生变化后更新（不是每次代码改动都更新）。

---

## 3. DECISIONS.md — 架构决策记录 (ADR)

**作用**：记录每一个"为什么选 A 不选 B"的决策。**这是对抗遗忘最有价值的文件** —— 它能防止下一个 session 重新讨论你已经否决过的方案。

**格式**：轻量 ADR，每条包含：日期、背景、决定、替代方案（被否决的理由）、影响。

**更新时机**：每次做出技术方案选择时追加。

---

## 4. CHANGELOG.md — 变更日志

**作用**：记录每次 session 的实际变更 + 下一步 TODO。**TODO 字段是 session 之间的接力棒。**

**格式**：按日期倒序，最新在最上面。

**更新时机**：每个 Claude Code session 结束前，作为最后一步。

---

## 使用工作流

### Session 开始时

```
> 请先读取 memory_docs/CLAUDE.md, memory_docs/ARCHITECTURE.md, memory_docs/DECISIONS.md, memory_docs/CHANGELOG.md
```

### Session 结束前

```
> 请将本次 session 的变更更新到 memory_docs/CHANGELOG.md，
> 如果有架构决策请更新 memory_docs/DECISIONS.md，
> 如果架构发生了变化请更新 memory_docs/ARCHITECTURE.md
```

---

## 注意事项

- CHANGELOG.md 超过 500 行时，将旧内容归档到 `docs/changelog-archive/` 目录
- 中英文混合都可以，以写得快为准
- DECISIONS.md 中的"替代方案"字段非常重要 —— 防止未来 session 重复讨论已否决方案
- 根目录 CLAUDE.md 已包含 session 协议，会引导 Claude Code 执行更新
