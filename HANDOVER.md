# 保理 HOT — 项目交接文档

> 最后更新：2026-07-09  
> 线上地址：https://factoring-hot.vercel.app  
> GitHub：https://github.com/sll2012566363-glitch/factoring-hot  
> Supabase 项目名：baoli（region: ap-southeast-2）

---

## 一、项目概述

保理 HOT 是一个面向中国保理与供应链金融行业的资讯聚合平台。系统自动从 48 个权威信源（政府监管机构、行业协会、金融媒体、智库、交易所）抓取文章，通过 AI 五维度评分系统打分，按话题聚类，并自动生成日报/周报/月刊。

**核心数据流：**
```
信源抓取 → 预过滤(关键词+LLM) → 正文补全 → LLM五维度评分 → 话题聚类 → 报告生成
```

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 14 (App Router) + TypeScript |
| 样式 | Tailwind CSS |
| 数据库 | Supabase (PostgreSQL 17) + RLS |
| 部署 | Vercel (自动部署，push to main) |
| 定时任务 | GitHub Actions (每小时管道 + 每日日报) |
| LLM | DeepSeek/Step API (OpenAI 兼容接口) |
| 爬虫 | cheerio (HTML) + rss-parser (RSS) + undici (fetch) |

**关键要求：Node.js 22+**（Supabase JS v2 需要原生 WebSocket 支持）

---

## 三、目录结构

```
factoring-hot/
├── config/
│   ├── scoring.json          # 五维度评分配置 + 日报板块配置
│   └── sources.json          # 48个信源定义（id/name/url/type/category/priority/rss/selector/active）
├── src/
│   ├── app/
│   │   ├── page.tsx          # 首页 - 热榜（按日期分组时间线）
│   │   ├── all/page.tsx      # 全部文章（分页+搜索+分类筛选）
│   │   ├── archive/page.tsx  # 归档页（⚠️ 当前是占位页，未实现）
│   │   ├── article/[id]/page.tsx  # 文章详情（实时抓取全文）
│   │   ├── topics/page.tsx   # 热门话题（从 topic_clusters 读取）
│   │   ├── report/page.tsx   # 日报
│   │   ├── report/weekly/page.tsx   # 周报
│   │   ├── report/monthly/page.tsx  # 月刊
│   │   ├── api/
│   │   │   ├── articles/route.ts     # GET 文章列表 / POST 批量更新
│   │   │   ├── articles/[id]/route.ts # GET 单篇文章
│   │   │   ├── fetch/route.ts        # POST 触发抓取
│   │   │   ├── report/route.ts       # GET/POST 日报
│   │   │   ├── weekly/route.ts       # GET 周报
│   │   │   ├── monthly/route.ts      # GET/POST 月刊
│   │   │   ├── cron/run-pipeline/route.ts  # GET 触发完整管道（cron保护）
│   │   │   └── public/
│   │   │       ├── items/route.ts    # 公开API（游标分页+ETag+限流）
│   │   │       ├── daily/route.ts    # 公开日报API
│   │   │       ├── daily/[date]/route.ts
│   │   │       ├── hot-topics/route.ts
│   │   │       └── version/route.ts  # API版本文档
│   │   └── feed/
│   │       ├── route.ts      # /feed.xml - 精选文章
│   │       ├── all/route.ts  # /feed/all.xml - 全部文章
│   │       ├── daily/route.ts # /feed/daily.xml - 日报
│   │       └── category/[cat]/route.ts  # /feed/category/{cat}.xml
│   ├── components/
│   │   ├── ArticleCard.tsx   # 文章卡片（含评分色标+时间格式化）
│   │   ├── CategoryFilter.tsx # 分类筛选按钮组
│   │   ├── DailyReportView.tsx # 日报渲染组件
│   │   ├── DateGroup.tsx     # 日期分组容器（时间线样式）
│   │   ├── Header.tsx        # 顶部导航
│   │   └── PeriodReportView.tsx # 周报/月刊渲染组件
│   ├── lib/
│   │   ├── supabase.ts       # Supabase 客户端（public + admin）
│   │   ├── classifier.ts     # 文章五分类分类器
│   │   ├── generate-report.ts # 日报生成逻辑（被 API 路由使用）
│   │   └── public-api-utils.ts # 公开API工具（限流/ETag/游标/RSS构建）
│   ├── scripts/              # ⭐ 管道脚本（GitHub Actions 调用）
│   │   ├── run-pipeline.ts   # 管道入口：5步串行执行
│   │   ├── fetch-sources.ts  # Step 1: 从48个信源抓取文章
│   │   ├── pre-filter.ts     # Step 2: 关键词+LLM相关性过滤
│   │   ├── enrich-articles.ts # Step 3: 正文补全+日期提取
│   │   ├── llm-score.ts      # Step 4: LLM五维度评分
│   │   ├── cluster-events.ts # Step 5: bigram Jaccard话题聚类
│   │   ├── generate-reports.ts # 日报/周报/月刊生成（CLI）
│   │   ├── init-sources.ts   # 初始化信源数据到数据库
│   │   ├── cleanup.ts        # 清理30天前旧数据
│   │   ├── score-articles.ts # ⚠️ 旧版评分（已废弃，用 llm-score.ts）
│   │   ├── reclassify.ts     # 重新分类已有文章
│   │   └── backfill-excerpts.ts # 补填摘要
│   └── types/index.ts        # TypeScript 类型定义
├── supabase/schema.sql       # 完整数据库 DDL
├── .github/workflows/
│   ├── fetch.yml             # 每小时管道（fetch→prefilter→enrich→score→cluster）
│   └── daily-report.yml      # 每日00:00 UTC = 08:00 北京时间生成日报
├── .env.example              # 环境变量模板
├── next.config.js            # Next.js 配置 + RSS rewrite 规则
├── tailwind.config.ts
└── package.json
```

---

## 四、数据库表结构

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `sources` | 信源管理 | id, name, url, type(government/association/media/thinktank/exchange), category, priority(T1/T1.5/T2), weight, rss, selector, active |
| `articles` | 文章 | id(UUID), title, link(UNIQUE), content, excerpt, pub_date, source_id, source_name, category, score, score_dimensions(JSONB), scored_at, scoring_method(rule/llm), pre_filtered, ai_reason, status(pending/selected/rejected), is_selected |
| `topic_clusters` | 话题聚类 | id, primary_article_id, primary_title, primary_score, related_article_ids, related_count, source_count, unique_sources, max_score, cluster_date |
| `daily_reports` | 日报 | id, report_date(UNIQUE), report_title, sections(JSONB), total_articles, executive_summary |
| `weekly_reports` | 周报 | id, year, week_number(UNIQUE), report_title, section_*(JSONB×5), executive_summary, key_insights, trend_analysis |
| `monthly_reports` | 月刊 | id, year, month(UNIQUE), report_title, section_*(JSONB×5), editorial_board(JSONB), executive_summary, monthly_overview, trend_charts |
| `events` | ⚠️ 旧事件表（已弃用，被 topic_clusters 取代） |
| `report_archives` | 归档（⚠️ 已定义但未使用） |

**文章分类体系（articles.category）：**
- `frontier` — 前沿解读
- `industry_model` — 行业前沿模式
- `regulatory` — 前沿监管新闻
- `dispute` — 前沿争议解决
- `normative` — 前沿规范文件

**注意：** sources.json 中的 category 是旧体系 (policy/market/risk/innovation)，文章入库后由 classifier.ts 重新分类为五体系。

---

## 五、数据管道（核心）

### 5.1 管道流程

GitHub Actions 每小时执行一次 `run-pipeline.ts`，5步串行：

| 步骤 | 脚本 | 功能 | 耗时 |
|---|---|---|---|
| 1 | fetch-sources.ts | 遍历48个信源，RSS/HTML抓取，去重入库 | ~3min |
| 2 | pre-filter.ts | 关键词匹配 + LLM批量相关性判断，标记 pre_filtered | ~5min |
| 3 | enrich-articles.ts | 实时抓取文章全文，补全 excerpt 和 pub_date | ~10min |
| 4 | llm-score.ts | LLM 五维度评分（每维度0-20，总分0-100），写入 score/score_dimensions/ai_reason | ~10min |
| 5 | cluster-events.ts | bigram Jaccard 相似度(阈值0.42) + Union-Find 聚类 → topic_clusters | ~1min |

**总耗时约 28-33 分钟。** 超时设置 35 分钟。

### 5.2 日报生成

每天 08:00 北京时间（00:00 UTC）由 `daily-report.yml` 触发 `generate-reports.ts daily`。

日报包含 7 个板块：今日头条(top5)、前沿解读、行业前沿模式、前沿监管新闻、前沿争议解决、前沿规范文件、深度解读(top5)。

### 5.3 周报/月刊

通过 CLI 手动触发或 API 端点生成：
```bash
npm run report:weekly -- 2026 28    # 2026年第28周
npm run report:monthly -- 2026 7    # 2026年7月
```

---

## 六、环境变量

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# LLM（预过滤和评分用）
LLM_API_KEY=...
LLM_API_URL=https://api.deepseek.com/v1    # 或 Step API
LLM_MODEL=step-3.7-flash

# API 认证（POST 端点）
API_KEY=...

# Vercel
VERCEL_TOKEN=...

# 站点
NEXT_PUBLIC_SITE_URL=https://factoring-hot.vercel.app
NEXT_PUBLIC_SITE_NAME=保理 HOT
```

**GitHub Actions Secrets 需要同步配置以上所有变量。**

---

## 七、前端页面现状

| 页面 | 路由 | 状态 | 说明 |
|---|---|---|---|
| 首页热榜 | `/` | ✅ 完成 | 按日期分组时间线，分类筛选+搜索+日期范围 |
| 全部文章 | `/all` | ✅ 完成 | 分页(50/页)+搜索+分类筛选 |
| 文章详情 | `/article/[id]` | ✅ 完成 | 评分+维度+AI理由+全文（实时抓取） |
| 热门话题 | `/topics` | ✅ 完成 | topic_clusters 最近14天 |
| 日报 | `/report` | ✅ 完成 | 7板块结构，fallback到最近日报 |
| 周报 | `/report/weekly` | ✅ 完成 | 侧边栏列表+5板块详情 |
| 月刊 | `/report/monthly` | ✅ 完成 | 侧边栏列表+5板块+封面品牌 |
| 归档 | `/archive` | ⚠️ 占位页 | 只显示"暂无归档报告"，无实际功能 |
| 公开API | `/api/public/*` | ✅ 完成 | 游标分页+ETag+限流(60/min/IP)+CORS |
| RSS | `/feed/*.xml` | ✅ 完成 | 4路feed（精选/全部/日报/分类） |

---

## 八、已知问题和待优化项

### 🔴 需要修复

1. **`/archive` 归档页是空壳** — 只显示占位文字，没有接入日报/周报/月刊数据。应改造成报告归档中心，列出所有历史报告。

2. **月刊 `editorial_board` 从未填充** — monthly_reports 表有此字段，月报配置中有主编"田江涛"、副主编"沈龙龙（Leo）"，但 `generate-reports.ts` 和 `monthly/route.ts` 都没有写入此字段。

3. **根目录 `scripts/` 有4个废弃脚本** — `scripts/fetch-sources.ts`、`scripts/ai-score.ts`、`scripts/cluster-events.ts`、`scripts/generate-report.ts` 是旧版代码，已被 `src/scripts/` 取代。应清理避免混淆。

4. **`src/lib/supabase.ts` 导出的共享客户端未被 API 路由使用** — 每个 API 路由都自己 `createClient()`，共享的 `getSelectedArticles()`、`getAllArticles()` 等辅助函数无人调用。应统一引用。

### 🟡 可以优化

5. **首页 `/` 用 `any[]` 类型** — `page.tsx` 和 `DateGroup.tsx` 中文章用 `any[]` 而非 `Article[]`，丢失类型安全。

6. **无自定义 404 页面** — 没有 `not-found.tsx`。

7. **公开 API 限流是内存级** — `public-api-utils.ts` 用 Map 做限流，Vercel serverless 多实例下限流无效（60×N）。应换 Redis/Upstash。

8. **管道无并发保护** — `cron/run-pipeline/route.ts` 没有"正在运行"锁，如果上一次未结束又触发新一次会冲突。

9. **`next.config.js` 中 `images.unoptimized: true`** — 禁用了所有图片优化，`remotePatterns` 配置形同虚设。

10. **周报/月刊没有定时自动生成** — 只有日报有 cron，周报和月刊需要手动触发。

### 🟢 增强方向

11. **微信公众号文章接入** — 当前48个信源无微信公众号，但用户现有月刊内容主要来自微信。
12. **PDF 导出** — `report_archives` 表已预留 pdf_url 字段，但无实现。
13. **邮件订阅** — 无实现。
14. **搜索增强** — 当前用 `ilike` 做模糊搜索，数据量大后应换 PostgreSQL 全文检索或 pg_trgm。

---

## 九、本地开发

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建
npm run build

# 初始化信源数据到数据库
npm run init

# 手动运行完整管道
npx tsx src/scripts/run-pipeline.ts

# 单独运行某一步
npx tsx src/scripts/fetch-sources.ts      # 抓取
npx tsx src/scripts/pre-filter.ts         # 预过滤
npx tsx src/scripts/enrich-articles.ts    # 正文补全
npx tsx src/scripts/llm-score.ts          # LLM评分
npx tsx src/scripts/cluster-events.ts     # 聚类

# 生成报告
npx tsx src/scripts/generate-reports.ts daily [date]
npx tsx src/scripts/generate-reports.ts weekly [year] [week]
npx tsx src/scripts/generate-reports.ts monthly [year] [month]
npx tsx src/scripts/generate-reports.ts all              # 全部生成

# 清理旧数据
npx tsx src/scripts/cleanup.ts
```

---

## 十、部署

- **Vercel 自动部署**：push 到 `main` 分支即触发
- **GitHub Actions**：
  - `fetch.yml` — 每小时整点运行管道（超时35分钟）
  - `daily-report.yml` — 每天 00:00 UTC 生成日报
- **两个 workflow 都需要 Node.js 22**（已配置）
- **Vercel 环境变量**和 **GitHub Secrets** 需同步配置第六节列出的所有变量

---

## 十一、评分体系

五维度，每维度 0-20 分，总分 0-100：

| 维度 | 字段名 | 含义 | 关键词示例 |
|---|---|---|---|
| 前沿解读 | frontier | 深度分析、趋势研究 | 解读、深度分析、趋势、白皮书 |
| 行业前沿模式 | industry_model | 业务创新、新模式、市场动态 | 首单、落地、创新、ABS、科技赋能 |
| 前沿监管新闻 | regulatory | 监管政策、法规变化 | 国务院、央行、监管、合规、政策 |
| 前沿争议解决 | dispute | 纠纷案例、风险事件、处罚 | 案例、判决、纠纷、处罚、爆雷 |
| 前沿规范文件 | normative | 规范性文件、行业标准 | 办法、规定、指引、征求意见 |

优先级权重：T1=1.3, T1.5=1.0, T2=0.7  
入选阈值：总分≥35 且 单维度≥8  
每日上限：40篇

---

## 十二、信源概况

共 48 个信源（41 个 active），按类型：

| 类型 | 数量 | 说明 |
|---|---|---|
| government | 10 | 政府监管机构（央行、银保监、证监会等） |
| association | 7 | 行业协会 |
| media | 22 | 金融媒体 |
| thinktank | 4 | 智库 |
| exchange | 5 | 交易所 |

信源配置文件：`config/sources.json`，每个信源包含 id/name/url/type/category/priority/weight/rss/selector/active 字段。

---

## 十三、关键设计决策记录

1. **为什么用 server-side API routes 而不是 client-side Supabase** — Vercel 构建时如果 NEXT_PUBLIC_* 环境变量未设置，client-side Supabase 会静默失败。改用 server-side API routes 更可靠。

2. **为什么 topic_clusters 取代 events 表** — events 表是最初设计，但实际聚类脚本 (cluster-events.ts) 使用 bigram Jaccard 算法，输出结构不同，所以新建了 topic_clusters 表。events 表保留但不再写入。

3. **为什么文章分类和信源分类不同** — sources.json 的 category (policy/market/risk/innovation) 是信源本身的属性。文章入库后由 classifier.ts 根据内容重新分类为五体系 (frontier/industry_model/regulatory/dispute/normative)。

4. **为什么用 GitHub Actions 而不是 Vercel Cron** — 管道运行需要 28-33 分钟，Vercel Serverless Functions 最长 5 分钟（即使 pro 也才 15 分钟），不够用。GitHub Actions 可设 35 分钟超时。

5. **LLM 选择** — 使用 DeepSeek/Step API（OpenAI 兼容接口），模型 step-3.7-flash。不用 OpenAI 是因为成本和速度考虑。

6. **文章时间格式** — 统一显示为 `2026年7月7日 14:30` 格式（年月日时分），不使用"刚刚"、"X小时前"等相对时间。

---

*本文档由 AI 基于代码分析生成，如有疑问请直接阅读对应源文件。*
