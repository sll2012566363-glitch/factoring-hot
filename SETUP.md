# Factoring HOT - 部署 setup 指南

## 第一步：创建 Supabase 项目

1. 访问 https://supabase.com 并登录/注册
2. 点击 "New Project"
3. 填写项目信息：
   - Name: `factoring-hot`
   - Database Password: 生成一个强密码并保存
   - Region: 选择 `Northeast Asia (Tokyo)` 或 `Singapore`（靠近国内）
4. 等待项目创建完成（约2分钟）

## 第二步：执行数据库 Schema

1. 在 Supabase Dashboard 中，点击左侧菜单 **SQL Editor**
2. 点击 **New Query**
3. 打开项目文件 `factoring-hot/supabase/schema.sql`
4. 复制全部内容，粘贴到 SQL Editor
5. 点击 **Run** 执行
6. 确认5张表创建成功：
   - `sources`
   - `articles`
   - `clusters`
   - `daily_reports`
   - `report_sections`

## 第三步：获取 API 密钥

在 Supabase Dashboard 中：
1. 点击左侧 **Settings** → **API**
2. 复制以下信息：
   - `URL`: `https://xxx.supabase.co`
   - `anon public` key: `eyJhbGc...`
   - `service_role` key: `eyJhbGc...`（注意：这个key很敏感，不要提交到git）

## 第四步：配置环境变量

创建 `factoring-hot/.env.local` 文件（注意是 `.env.local` 不是 `.env`）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI（可选，用于LLM评分）
OPENAI_API_KEY=your_openai_api_key_here

# Vercel（部署时用）
VERCEL_URL=http://localhost:3000
```

## 第五步：安装依赖并运行

```bash
cd factoring-hot
npm install
npm run dev
```

访问 http://localhost:3000 查看效果。

## 第六步：初始化信源数据

```bash
npm run init
```

这会将 `config/sources.json` 中的20个信源导入数据库。

## 第七步：部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量（复制 `.env.local` 中的内容）
4. 部署

## 常见问题

**Q: Supabase 在国内访问慢？**
A: 选择 Tokyo 或 Singapore 区域，或配置自定义域名+CDN

**Q: OpenAI API 调用失败？**
A: 项目支持纯规则评分模式，不依赖 LLM。设置 `OPENAI_API_KEY` 可启用更精确的4维度评分。

**Q: GitHub Actions 定时任务不运行？**
A: 需要在仓库 Settings → Secrets 中配置 `SUPABASE_SERVICE_ROLE_KEY` 和 `OPENAI_API_KEY`
