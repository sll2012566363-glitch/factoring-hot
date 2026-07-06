# Factoring HOT - 后端完整部署指南

## 🎯 项目状态

✅ **已完成：**
1. 完整项目结构（Next.js 14 + TypeScript + Tailwind + Supabase）
2. 7张数据库表（sources/articles/events/daily/weekly/monthly/archives）
3. 静态 HTML 演示页面（日报/周报/月刊/往期，按你的月刊结构设计）
4. 核心脚本（fetch/score/generate/init）
5. GitHub Actions 配置（每小时采集 + 每日生成日报）

---

## 🚀 快速启动（3步）

### 第1步：创建 Supabase 项目

1. 访问 https://supabase.com
2. 点击 "New Project"
3. 填写：
   - **Name**: `factoring-hot`
   - **Database Password**: 生成强密码（**保存好！**）
   - **Region**: 选 `Northeast Asia (Tokyo)` 或 `Singapore`
4. 等待创建完成（约2分钟）

### 第2步：执行数据库 Schema

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 "New Query"
3. 打开 `factoring-hot/supabase/schema.sql`
4. 复制全部内容，粘贴到 SQL Editor
5. 点击 **Run**
6. 确认7张表创建成功

### 第3步：获取 API 密钥

在 Supabase Dashboard 中：
1. 左侧菜单 → **Settings** → **API**
2. 复制：
   - `Project URL` → `https://xxx.supabase.co`
   - `anon public` key → `eyJhbG...`
   - `service_role` key → `eyJhbG...` ⚠️ 保密！

### 第4步：配置环境变量

创建 `factoring-hot/.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPENAI_API_KEY=your_openai_api_key_here  # 可选
```

### 第5步：安装依赖并运行

```bash
cd factoring-hot
npm install
npm run init    # 导入信源数据
npm run dev      # 启动开发服务器
```

访问 http://localhost:3000

---

## 🔄 自动化流程

### GitHub Actions 定时任务

已配置两个 GitHub Actions：

1. **每2小时采集** (`.github/workflows/fetch.yml`)
   - 采集新文章
   - 自动评分
   - 去重入库

2. **每日20:00（北京时间）生成日报** (`.github/workflows/daily-report.yml`)
   - 生成当日日报
   - 推送到 Supabase

### 手动触发

```bash
# 采集文章
npm run fetch

# 评分
npm run score

# 生成周报
npm run report -- weekly 2026 27

# 生成月刊
npm run report -- monthly 2026 7
```

---

## 📊 数据库表说明

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `sources` | 信源管理 | type, category, priority, weight |
| `articles` | 文章存储 | score, score_dimensions, event_id |
| `events` | 事件聚类 | article_ids, importance_score |
| `daily_reports` | 日报 | sections (JSONB), total_articles |
| `weekly_reports` | 周报 | 五大板块 (JSONB) |
| `monthly_reports` | 月刊 | 五大板块 + 编委会 |
| `report_archives` | 归档 | pdf_url, markdown_url |

---

## 🎨 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 日报 | `/` | 首页，展示当日文章 |
| 全部文章 | `/all` | 所有文章列表 |
| 日报详情 | `/report?date=2026-07-05` | 某日日报 |
| 往期 | `/archive` | 周报/月刊归档 |

---

## ⚙️ 配置说明

### 信源配置 (`config/sources.json`)

20个信源，分4类：
- **官方** (4个): 银保监会、人民银行、金融监管总局、工信部
- **协会** (6个): 商业保理专委会、北京保理协会、上海保理协会等
- **媒体** (6个): 贸易金融、供应链金融、中国保理等
- **智库** (4个): 德和衡研究院、上海金融法院、北大金融法等

### 评分规则 (`config/scoring.json`)

四维度评分（各0-25分，总分0-100）：
1. **政策敏感度** (policy): 监管政策、法规变化
2. **市场信号** (market): 市场趋势、商业模式
3. **风险预警** (risk): 行业风险、合规问题
4. **创新实践** (innovation): 新技术、新应用

---

## 🐛 常见问题

**Q: Supabase 连接失败？**
A: 检查 `.env.local` 中的 URL 和 KEY 是否正确

**Q: 文章采集失败？**
A: 部分网站有反爬，需要配置 proxy 或使用 wechat-article-fetch

**Q: 评分不准确？**
A: 设置 `OPENAI_API_KEY` 启用 LLM 评分

**Q: GitHub Actions 不运行？**
A: 需要在仓库 Settings → Secrets 中配置环境变量

---

## 📞 联系方式

- 技术负责人：Leo (沈龙龙)
- 邮箱：2012566363@qq.com
- 带教律师：田江涛 (18516208227)
