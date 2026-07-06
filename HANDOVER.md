# 保理HOT 项目交接文档

> 交接日期：2026-07-05  
> 项目状态：静态演示完成，后端待实现  
> 写给下一位接手的 AI 助手

---

## 一、项目概述

**项目名称：** 保理HOT（Factoring HOT）  
**项目性质：** 保理与供应链金融垂直领域资讯聚合平台  
**参考对标：** 数字生命卡兹克的 AI HOT（aihot.virxact.com）  
**目标用户：** 保理公司、供应链金融企业、金融机构、法律从业者  

**核心功能：**
1. 每日自动采集 20+ 权威信源（监管/协会/媒体/学术）
2. AI 四维度评分（政策敏感性 / 市场信号 / 风险预警 / 业务创新）
3. 每日生成日报（自动排版，零 LLM 调用）
4. 每周生成周报（热点洞察 + 趋势分析）
5. 每月生成月刊（按固定板块结构）

---

## 二、已完成工作

### ✅ 静态演示（可直接在浏览器打开）

文件：`factoring-hot/index-standalone.html`

- 完整的四页切换（日报 / 周报 / 月刊 / 往期）
- 深色 Hero + 蜂蜜黄强调色设计
- 8 篇模拟文章数据，含分类筛选交互
- 月刊页完全对齐用户现有五月刊结构（五大板块）

**如何使用：** 双击文件，或用浏览器打开即可。

---

### ✅ Next.js 项目骨架

目录：`factoring-hot/`

已完成的文件：

| 文件 | 说明 |
|------|------|
| `package.json` | 依赖配置（Next.js 14 + Tailwind + Supabase） |
| `tsconfig.json` | TypeScript 配置 |
| `next.config.js` | Next.js 配置 |
| `tailwind.config.ts` | Tailwind 主题（蓝色主色） |
| `src/types/index.ts` | TypeScript 类型定义 |
| `src/lib/supabase.ts` | Supabase 客户端 |
| `src/app/layout.tsx` | 全局布局 |
| `src/app/globals.css` | 全局样式 |
| `src/app/page.tsx` | 首页（含模拟数据，可直接运行） |
| `src/components/Header.tsx` | 顶部导航组件 |
| `src/components/CategoryFilter.tsx` | 分类筛选组件 |
| `src/components/ArticleCard.tsx` | 文章卡片组件 |
| `src/components/DateGroup.tsx` | 日期分组组件 |
| `src/components/DailyReportView.tsx` | 日报视图组件 |
| `config/sources.json` | 20 个信源配置 |
| `config/scoring.json` | 评分规则配置 |
| `supabase/schema.sql` | 数据库 Schema（7 张表） |
| `.github/workflows/fetch.yml` | 定时采集 GitHub Actions |
| `.github/workflows/daily-report.yml` | 定时生成日报 GitHub Actions |
| `DEPLOYMENT.md` | 详细部署指南 |
| `SETUP.md` | 快速启动指南 |

---

### ✅ 月刊结构（已对齐用户现有刊物）

完全按照用户提供的 `260604v2供应链和供应链金融前沿26年五月刊.docx` 结构设计：

1. **第一部分：前沿解读** — 深度政策/市场分析文章
2. **第二部分：行业前沿模式** — 区块链/电子凭证/跨境保理等创新实践
3. **第三部分：前沿监管新闻** — 新规动态（含施行日期）
4. **第四部分：前沿争议解决** — 典型案例 + 裁判规则提炼
5. **第五部分：前沿规范文件** — 新规全文列表
6. **编委会名单** — 主编：田江涛；副主编：沈龙龙（Leo）

---

## 三、数据库设计

### Schema 文件：`supabase/schema.sql`

共 7 张表：

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `sources` | 信源管理 | `id`, `name`, `url`, `type`(rss/html), `category`, `weight`(1-10), `active` |
| `articles` | 文章数据 | `id`, `source_id`, `title`, `link`, `content`, `pub_date`, `score`, `category`, `status`(pending/scored/published) |
| `events` | 事件聚类 | `id`, `title`, `keywords`, `articles`(JSONB), `hotness` |
| `daily_reports` | 日报 | `id`, `date`, `content`(JSONB), `top_articles`(JSONB) |
| `weekly_reports` | 周报 | `id`, `week_number`, `year`, `start_date`, `end_date`, `sections`(JSONB) |
| `monthly_reports` | 月刊 | `id`, `year`, `month`, `sections`(JSONB), `editor_list`(JSONB) |
| `report_archives` | 归档 | `id`, `report_id`, `report_type`, `file_url`, `download_count` |

**枚举类型：**
- `source_category`: `policy` / `market` / `risk` / `innovation`
- `source_type`: `rss` / `html` / `api` / `wechat`
- `article_status`: `pending` / `scored` / `published` / `archived`

---

## 四、待完成工作（按优先级排序）

### 🔴 P0 — 必须完成（项目才能跑起来）

#### 1. 配置 Supabase 数据库

**步骤：**
1. 注册/登录 [Supabase](https://supabase.com)
2. 新建项目（名称：`factoring-hot`，密码记下来）
3. 进入 SQL Editor，粘贴 `supabase/schema.sql` 全部内容，点击运行
4. 进入 Settings → API，复制：
   - `NEXT_PUBLIC_SUPABASE_URL`（类似 `https://xxxx.supabase.co`）
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（以 `eyJ` 开头）
   - `SERVICE_ROLE_KEY`（以 `eyJ` 开头，**保密**）
5. 在项目根目录创建 `.env.local`，填入这些值

**预计时间：** 20 分钟

---

#### 2. 采集脚本实现

**目标：** 从 `config/sources.json` 的 20 个信源抓取文章，存入 `articles` 表。

**文件待创建：** `src/lib/ingest.ts`

**关键逻辑：**
```typescript
// 伪代码
for (const source of sources) {
  if (source.type === 'rss') {
    // 用 rss-parser 解析 RSS
    const feed = await parseFeed(source.url);
    for (const item of feed.items) {
      // 去重（按 link 或 title 哈希）
      // 存入 articles 表，status = 'pending'
    }
  } else if (source.type === 'html') {
    // 用 cheerio 解析 HTML
    // 提取标题/链接/摘要/发布时间
  } else if (source.type === 'wechat') {
    // 用微信公众号 API 或 Playwright 抓取
    // 需要特殊处理（卡兹克用 Playwright 无头浏览器）
  }
}
```

**注意：**
- RSS 信源优先（稳定、规范）
- HTML 抓取需要针对每个网站写选择器
- 微信公众号文章建议用 [Wechat Article Fetch](../.workbuddy/skills/wechat-article-fetch/) 技能

---

#### 3. 评分脚本实现

**目标：** 对 `status = 'pending'` 的文章进行 AI 评分。

**文件待创建：** `src/lib/score.ts`

**两种模式：**

**模式 A：规则引擎（免费，推荐先做）**
```typescript
function ruleBasedScore(article: Article): number {
  let score = 50; // 基础分
  
  // 关键词加权
  const policyKeywords = ['监管', '办法', '通知', '银保监会', '最高法'];
  const marketKeywords = ['规模', '增长', 'ABS', '发行'];
  const riskKeywords = ['违规', '立案', '风险', '暴雷'];
  const innovationKeywords = ['区块链', 'AI', '大模型', '电子凭证'];

  // 标题匹配
  for (const kw of policyKeywords) {
    if (article.title.includes(kw)) score += 5;
  }
  // 内容匹配（权重减半）
  for (const kw of marketKeywords) {
    if (article.content?.includes(kw)) score += 2;
  }

  // 来源权重
  score += article.source.weight * 2;

  // 时效性（越新越高）
  const hoursAgo = (now - pubDate) / 3600000;
  if (hoursAgo < 6) score += 15;
  else if (hoursAgo < 24) score += 10;
  else if (hoursAgo < 72) score += 5;

  return Math.min(100, Math.max(0, score));
}
```

**模式 B：LLM 评分（精确，需要 API Key）**
```typescript
// 调用 OpenAI API
const prompt = `
请对以下保理行业文章进行评分（0-100分），从四个维度评估：

1. 政策敏感性（0-25）：是否涉及监管政策、法规变更
2. 市场信号（0-25）：是否反映市场规模、融资趋势
3. 风险预警（0-25）：是否提示行业风险、违规案例
4. 业务创新（0-25）：是否介绍新技术、新模式

文章标题：${article.title}
文章摘要：${article.content?.slice(0, 500)}

只返回一个数字（0-100），不要解释。
`;

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini', // 便宜，够用
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
});

return parseInt(response.choices[0].message.content);
```

**推荐路径：** 先做规则引擎 → 跑通全流程 → 再升级 LLM 评分

---

#### 4. 日报生成脚本

**目标：** 每天 20:00 自动生成日报，存入 `daily_reports` 表。

**文件待创建：** `src/lib/generate-daily.ts`

**逻辑：**
```typescript
// 1. 获取今天评分 >= 70 的文章
const todayArticles = await supabase
  .from('articles')
  .select('*')
  .gte('score', 70)
  .gte('pub_date', todayStart)
  .lte('pub_date', todayEnd)
  .order('score', { ascending: false })
  .limit(15);

// 2. 按分类分组
const grouped = groupByCategory(todayArticles);

// 3. 生成日报 JSON 结构
const report = {
  date: today,
  top_articles: todayArticles.slice(0, 5),
  sections: grouped,
  generated_at: new Date(),
};

// 4. 存入数据库
await supabase.from('daily_reports').insert(report);
```

---

### 🟡 P1 — 重要但可后做

#### 5. 周报生成脚本

**文件待创建：** `src/lib/generate-weekly.ts`

**逻辑：**
- 统计本周各分类文章数量
- 找出本周热度最高的 3 个事件（可用简单关键词聚类）
- 生成趋势分析（对比上周）
- 存入 `weekly_reports` 表

---

#### 6. 月刊生成脚本

**文件待创建：** `src/lib/generate-monthly.ts`

**逻辑：**（严格按照用户五月刊结构）
```typescript
const monthlyReport = {
  year: 2026,
  month: 7,
  sections: {
    part1_interpretation: [/* 前沿解读文章 */],
    part2_industry_patterns: [/* 行业模式创新 */],
    part3_regulatory_news: [/* 监管新闻 */],
    part4_dispute_resolution: [/* 争议解决案例 */],
    part5_normative_documents: [/* 规范文件列表 */],
  },
  editor_list: {
    chief_editor: '田江涛',
    deputy_editor: '沈龙龙（Leo）',
    editorial_team: '德和衡保理研究中心全体成员',
  },
};
```

---

#### 7. 前端页面完善

**待完成：**
- `src/app/all/page.tsx` — 全部文章页（分页 + 搜索）
- `src/app/report/[date]/page.tsx` — 日报详情页
- `src/app/report/weekly/[week]/page.tsx` — 周报详情页
- `src/app/report/monthly/[month]/page.tsx` — 月刊详情页
- `src/app/api/articles/route.ts` — 文章列表 API
- `src/app/api/reports/daily/route.ts` — 日报 API
- `src/app/api/reports/weekly/route.ts` — 周报 API
- `src/app/api/reports/monthly/route.ts` — 月刊 API

---

### 🟢 P2 — 锦上添花

#### 8. 微信公众号文章抓取

**问题：** 用户现有月刊内容主要来自微信公众号。

**解决方案：**
- 方案 A：用 [Wechat Article Fetch](../.workbuddy/skills/wechat-article-fetch/) 技能（推荐）
- 方案 B：用 Playwright 无头浏览器模拟微信读书/搜狗微信搜索
- 方案 C：手动粘贴文章内容到后台（临时方案）

---

#### 9. PDF 导出功能

**需求：** 月刊需要生成 PDF 供下载/打印。

**实现：**
- 用 `puppeteer` 或 `playwright` 把月刊页面转 PDF
- 或用 `pdfkit` / `jspdf` 直接生成

---

#### 10. 订阅邮件功能

**需求：** 用户希望每周一收到周报邮件。

**实现：**
- 用 `resend` 或 `sendgrid` API 发送邮件
- 或集成微信公众号模板消息

---

## 五、关键技术决策

### 为什么选 Supabase 而不是 MongoDB/MySQL？

1. **免费额度足够**：500MB 数据库 + 1GB 文件存储（够用很久）
2. **自带 REST API**：不需要写后端，前端直接调
3. **实时订阅**：文章更新时前端自动刷新（可选）
4. **Auth 内置**：如果需要用户登录，直接用 Supabase Auth

### 为什么评分先用规则引擎而不是 LLM？

1. **成本**：LLM 评分每篇文章约 $0.002，每天 50 篇 = $0.1/天 = $3/月
2. **速度**：规则引擎毫秒级，LLM 需要 2-3 秒/篇
3. **可控性**：规则引擎结果可预期，LLM 偶尔抽风

**推荐路径：** 规则引擎先跑通 → 积累数据 → 用数据微调 LLM 评分 Prompt

---

## 六、文件清单（完整）

### 项目根目录
```
factoring-hot/
├── index-standalone.html      ✅ 静态演示（可直接打开）
├── DEPLOYMENT.md             ✅ 部署指南
├── SETUP.md                  ✅ 快速启动
├── package.json              ✅ 依赖配置
├── tsconfig.json            ✅
├── next.config.js           ✅
├── tailwind.config.ts       ✅
├── postcss.config.js        ✅
├── .env.example            ✅ 环境变量模板
├── .gitignore              ✅
│
├── config/
│   ├── sources.json         ✅ 20 个信源
│   └── scoring.json        ✅ 评分规则
│
├── supabase/
│   └── schema.sql          ✅ 数据库 Schema（7 张表）
│
├── src/
│   ├── types/
│   │   └── index.ts        ✅ 类型定义
│   ├── lib/
│   │   ├── supabase.ts     ✅ 数据库客户端
│   │   ├── ingest.ts       ❌ 待创建（采集脚本）
│   │   ├── score.ts        ❌ 待创建（评分脚本）
│   │   ├── cluster.ts       ❌ 待创建（事件聚类）
│   │   ├── generate-daily.ts ❌ 待创建（日报生成）
│   │   ├── generate-weekly.ts ❌ 待创建（周报生成）
│   │   └── generate-monthly.ts ❌ 待创建（月刊生成）
│   ├── components/
│   │   ├── Header.tsx      ✅
│   │   ├── CategoryFilter.tsx ✅
│   │   ├── ArticleCard.tsx ✅
│   │   ├── DateGroup.tsx   ✅
│   │   └── DailyReportView.tsx ✅
│   ├── app/
│   │   ├── layout.tsx      ✅
│   │   ├── globals.css     ✅
│   │   ├── page.tsx        ✅ 首页（含模拟数据）
│   │   ├── all/page.tsx    ❌ 待完成
│   │   ├── report/page.tsx ❌ 待完成
│   │   └── api/            ❌ 待完成（4 个 API 路由）
│   └── scripts/
│       ├── init-sources.ts  ✅ 初始化信源数据
│       ├── cleanup.ts       ✅ 清理脚本
│       ├── fetch-sources.ts ❌ 待重写（采集逻辑）
│       ├── score-articles.ts ❌ 待重写（评分逻辑）
│       └── generate-reports.ts ❌ 待重写（报告生成）
│
├── .github/
│   └── workflows/
│       ├── fetch.yml        ✅ 定时采集（每 2 小时）
│       └── daily-report.yml ✅ 定时生成日报（每天 20:00）
│
└── node_modules/            （安装后自动生成）
```

---

## 七、下一步行动清单

### 给下一位 AI 的明确指令：

**第一步：配置数据库（最优先）**
1. 帮用户在 Supabase 创建项目
2. 执行 `supabase/schema.sql`
3. 配置 `.env.local`
4. 运行 `npm run init` 导入信源

**第二步：实现采集脚本**
1. 先写 RSS 采集（稳定）
2. 再写 HTML 抓取（针对特定网站）
3. 测试：运行 `npm run fetch`，检查数据库是否有数据

**第三步：实现评分脚本**
1. 先做规则引擎（快速验证）
2. 再接入 LLM API（精确评分）
3. 测试：运行 `npm run score`，检查评分是否合理

**第四步：实现日报生成**
1. 写 `generate-daily.ts`
2. 配置 GitHub Actions 定时任务
3. 测试：手动运行一次，检查日报是否生成

**第五步：完善前端**
1. 让首页显示真实数据（从 Supabase 读取）
2. 完成"全部文章"页
3. 完成"日报详情"页

**第六步：实现周报和月刊**
1. 写 `generate-weekly.ts`
2. 写 `generate-monthly.ts`
3. 按用户提供的结构生成 PDF

---

## 八、重要提醒

### ⚠️ 用户偏好（必须记住）

1. **月刊结构不能变**：必须按照用户现有五月刊的五大板块
2. **编委会名单**：主编田江涛，副主编沈龙龙（Leo）
3. **设计风格**：深色 Hero + 蜂蜜黄强调色 + 蓝色主色调
4. **去 AI 化**：所有自动生成的内容要走"去 AI 化"流程（用 `humanizer` 技能）

### ⚠️ 技术限制

1. **微信公众号文章难抓**：建议用现成的 `wechat-article-fetch` 技能
2. **RSS 信源可能失效**：需要定期维护 `sources.json`
3. **LLM API 费用**：建议设每日预算上限（比如 $5/天）

### ⚠️ 法律合规

1. **版权问题**：采集的文章只显示标题+摘要，链接回原文
2. **数据隐私**：用户邮箱/订阅信息要加密存储
3. **监管合规**：平台本身不提供投资建议，只做资讯聚合

---

## 九、联系信息

**用户：** Leo 沈龙龙  
**邮箱：** 2012566363@qq.com  
**微信：** （用户微信，可用于紧急沟通）  
**带教律师：** 田江涛（保理业务专家）  

**项目位置：**
- 本地：`/Users/null/WorkBuddy/2026-07-04-23-35-48/factoring-hot/`
- 静态演示：`factoring-hot/index-standalone.html`（双击可在浏览器打开）

---

## 十、附录：参考资源

1. **AI HOT 原版：** https://aihot.virxact.com
2. **卡兹克微信公众号：** 数字生命卡兹克（可搜索"AI HOT 搭建"）
3. **Supabase 文档：** https://supabase.com/docs
4. **Next.js 文档：** https://nextjs.org/docs
5. **Tailwind CSS：** https://tailwindcss.com/docs
6. **保理业务参考：** 《中国保理法：原理、问题与实务》（刘剑峰著，法律出版社2025年版）

---

**交接完成。祝下一位 AI 助手顺利！** 🚀
