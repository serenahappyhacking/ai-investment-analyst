# AI Investment Analyst -- SaaS Architecture Plan

## Tech Stack

| 关注点 | 选型 | 理由 |
|--------|------|------|
| **前端 + API** | Next.js 15 (App Router) | `streaming.ts` 已有原型，Vercel AI SDK 的 `useChat` 天然适配 |
| **数据库 + Auth** | Supabase (Postgres + Auth) | 免费额度大，RLS 内置行级安全，Realtime 订阅进度更新 |
| **后台任务** | Inngest | 专为长任务设计（分析需 2-5 分钟），持久执行 + 步骤重试 + cron 调度 |
| **支付** | Stripe | 支持 HKD，Checkout + Customer Portal 自助管理 |
| **邮件** | Resend | 现代 API，免费 3k 封/月，替换当前 nodemailer |
| **LLM** | DeepSeek-V3 (保持) | 极低成本 ~$0.025/篇报告，毛利率 >90% |
| **Notion** | OAuth 2.0 | 每个客户授权自己的 workspace，返回 scoped bot_token |
| **Monorepo** | Turborepo | TypeScript monorepo 零配置，并行构建 |
| **部署** | Vercel + Inngest + Supabase | 全托管，运维接近零 |

## Monorepo 结构

```
ai-investment-analyst/
  turbo.json
  packages/
    core/                       # 分析引擎（从当前 src/ 提取）
      src/
        engine.ts               # 主入口: runAnalysis(params) -> AnalysisResult
        config.ts               # LLM 配置（参数化，不再依赖 env 单例）
        graph/                  # LangGraph 工作流（保持不变）
        crews/                  # 4 个 Crew（保持不变）
        agents/                 # ReportWriter（保持不变）
        skills/                 # Reflexion/PRM/Planner/CostTracker
        tools/                  # 搜索/金融/MCP 工具
        integrations/           # Notion（接受 token 参数）+ Resend
    db/                         # 数据库层
      src/
        schema.ts               # Drizzle ORM 表定义
        queries/                # 类型安全查询
  apps/
    web/                        # Next.js 15 Dashboard
      src/app/
        (auth)/                 # 登录/注册/OAuth
        (dashboard)/            # 仪表板
          watchlist/            # 管理关注列表
          reports/              # 报告历史 + 实时流式查看
          settings/             # Notion OAuth + 邮件偏好
          billing/              # Stripe 订阅管理
        api/
          analyze/              # 触发分析（-> Inngest）
          webhooks/             # Stripe + Inngest webhooks
          notion/               # OAuth callback
```

## 数据库设计

```sql
profiles          -- 用户资料 + Notion token + Stripe customer ID
watchlist_items   -- 关注公司（每用户，含调度频率）
reports           -- 分析报告（内容、评分、进度日志、交付状态）
subscriptions     -- Stripe 订阅状态同步
usage             -- 月度用量追踪（报告数、token、成本）
```

所有表启用 Row Level Security —— 用户只能看到自己的数据。

## 核心引擎重构

当前引擎通过**依赖注入**实现多租户，不需要大改：

```typescript
interface AnalysisContext {
  llmApiKey: string;
  llmBaseUrl: string;
  notionToken?: string;        // 每个用户的 OAuth token
  notionDatabaseId?: string;
  onProgress?: (event: ProgressEvent) => Promise<void>;  // 进度回调
}

async function runAnalysis(params: AnalysisParams): Promise<AnalysisResult>
```

**改动最小化**：
- `createLLM()` 加 optional `{apiKey, baseUrl}` 参数，CLI 继续用 env vars
- `notionClient.ts` 加 optional `token` 参数
- 替换 nodemailer 为 Resend
- Crews/Agents/Skills/Tools 全部不改（已经是无状态的）

## 实时流式架构

```
用户点击 "分析"
  -> Server Action -> Inngest event
  -> Inngest 函数启动
    -> 每步更新 report.progress_log (Supabase)
    -> Supabase Realtime 广播变更
  <- 前端订阅 Realtime
  <- UI 实时更新进度时间线
```

不需要维护 WebSocket 连接。Supabase Realtime 是事件总线，Inngest 是持久执行层。

## 定价模型

| 功能 | Free | Pro (HK$128/月) | Enterprise (HK$488/月) |
|------|------|-----------------|----------------------|
| 月报告数 | 3 | 50 | 无限 |
| 关注公司数 | 3 | 20 | 无限 |
| 分析模式 | Quick only | Quick + Full | Quick + Full |
| 报告语言 | EN | EN + ZH | EN + ZH |
| 定时报告 | 无 | 每周 | 每日 + 每周 |
| Notion 交付 | 无 | 1 workspace | 多 workspace |
| 邮件通知 | 有 | 有 | 有 |
| 报告留存 | 30 天 | 1 年 | 永久 |
| API 访问 | 无 | 无 | 有 |

**单位经济**：Full 模式 ~$0.025 LLM 成本/篇。Pro 用户 50 篇/月 = $1.55 成本，收入 ~$16，**毛利率 >90%**。

## 分阶段实施计划

### Phase 1: Foundation（第 1 周）
Monorepo + Auth + 基础 Dashboard + 手动分析

- 提取 `packages/core/`，CLI 继续工作
- Supabase 建表 + Auth（Email + Google）
- Dashboard 骨架：关注列表 CRUD + "Run Analysis" 按钮
- **交付**：用户注册 -> 添加公司 -> 点击分析 -> 看到报告

### Phase 2: 后台任务 + 实时流（第 2 周）
Inngest + 进度推送 + 定时调度

- 分析移到 Inngest 后台执行
- Supabase Realtime 推送进度到前端
- 实现 cron 定时任务（周一/每天）
- Resend 邮件通知
- **交付**：点击分析 -> 看到实时进度流 -> 收到邮件

### Phase 3: 集成 + 计费（第 3 周）
Notion OAuth + Stripe + 层级限制

- Notion OAuth 2.0 接入
- Stripe Checkout + Customer Portal
- 用量限制（Free 3篇/月，Pro 50篇/月）
- **交付**：完整付费流程，连接 Notion，按层级限制功能

### Phase 4: 上线（第 4 周）
中文 UI + 港股支持 + Landing Page

- EN/ZH 双语界面
- 港股 ticker 支持（0700.HK 腾讯等）
- Landing page + 定价页
- Sentry 监控 + Vercel Analytics
- **交付**：可以开始邀请 beta 用户
