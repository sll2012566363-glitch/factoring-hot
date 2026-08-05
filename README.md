# 保理 HOT

面向保理与供应链金融从业者的每日信息精选平台。

## 快速开始

```bash
# 安装依赖
npm ci

# 复制环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

## 内容管道

```bash
npm run pipeline
npm run pipeline:realtime
npm run selection:reconcile
```

入选规则集中在 `src/lib/content-policy.ts`：预筛通过、LLM 五维总分达到发布线、且正文质量达到 `full`，三项缺一不可。

## 验证与部署

```bash
npm test
npm run typecheck
npm run build
vercel --prod
```

## 许可证

MIT
