---
name: factoring-hot
description: >
  Query and monitor factoring (保理) and supply-chain finance industry news.
  Use when the user asks about factoring news, supply-chain finance trends,
  industry policy changes, ABS developments, risk alerts, or wants a daily
  briefing on the factoring industry. Also triggers for keywords like
  保理, 供应链金融, 应收账款, ABS, 商业保理.
version: 1.0.0
---

# Factoring HOT — Industry News Skill

## Overview

Factoring HOT aggregates and scores news from 48 authoritative sources (government
regulators, industry associations, financial media, think tanks, exchanges) in the
Chinese factoring and supply-chain finance industry. It provides daily/weekly/monthly
reports, hot topic rankings, and real-time article feeds with AI-powered scoring across
five dimensions: frontier interpretation, industry model, regulatory news, dispute
resolution, and normative documents.

## Base URL

```
https://factoring-hot.vercel.app
```

## API Endpoints

### 1. List Items — `GET /api/public/items`

Fetch articles with filtering, search, and cursor pagination.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | string | `all` | `all` or `selected` (editor's picks only) |
| `category` | string | — | Filter: `frontier`, `industry_model`, `regulatory`, `dispute`, `normative` |
| `since` | string | — | ISO date — only items published after this date |
| `take` | int | `20` | Page size, 1–100 |
| `cursor` | string | — | Opaque cursor from previous response's `nextCursor` |
| `q` | string | — | Full-text search in article title |

**Response:**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "央行发布保理行业新规...",
      "url": "https://...",
      "permalink": "https://...",
      "source": "中国人民银行",
      "sourceId": "pbc",
      "publishedAt": "2026-07-05T08:00:00Z",
      "summary": "央行发布保理新规，规范应收账款融资...",
      "category": "regulatory",
      "categoryLabel": "前沿监管新闻",
      "priority": "T1",
      "score": 85,
      "scoreDimensions": { "frontier": 18, "industry_model": 15, "regulatory": 20, "dispute": 12, "normative": 20 },
      "scoringMethod": "llm",
      "selected": true,
      "eventId": null,
      "eventTitle": null
    }
  ],
  "total": 156,
  "take": 20,
  "nextCursor": "eyJjcmVhdGVkQXQiOi...",
  "hasMore": true,
  "siteUrl": "https://factoring-hot.vercel.app",
  "generatedAt": "2026-07-09T08:00:00Z"
}
```

### 2. Daily Report — `GET /api/public/daily`

Get today's daily report (or a specific date with `?date=YYYY-MM-DD`).

**Response:**

```json
{
  "date": "2026-07-05",
  "title": "2026-07-05 保理行业日报",
  "executiveSummary": "今日收录38条资讯，政策监管类12条...",
  "sections": [...],
  "totalArticles": 38
}
```

### 3. Daily Report by Date — `GET /api/public/daily/{date}`

Same as above but date is in the URL path.

### 4. Hot Topics — `GET /api/public/hot-topics`

Get trending topics ranked by multi-source coverage.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `take` | int | `10` | Number of results, 1–50 |
| `days` | int | `7` | Look-back window in days, 1–30 |

**Response:**

```json
{
  "hotTopics": [
    {
      "id": "event-001",
      "title": "保理行业数字化转型加速",
      "summary": "多家机构推进保理业务线上化...",
      "category": "industry_model",
      "articleCount": 15,
      "sourceCount": 8,
      "sourceNames": ["中国人民银行", "中国银行业协会", "21世纪经济报道"],
      "maxScore": 92.5,
      "avgScore": 78.2,
      "clusterDate": "2026-07-09"
    }
  ],
  "total": 10,
  "days": 7,
  "generatedAt": "2026-07-09T08:00:00Z"
}
```

### 5. Version — `GET /api/public/version`

Returns API version info and endpoint documentation index.

## RSS Feeds

| Path | Description |
|------|-------------|
| `/feed.xml` | Selected articles from the last 7 days |
| `/feed/all.xml` | All articles from the last 3 days |
| `/feed/daily.xml` | Today's daily report as RSS items |
| `/feed/category/{cat}.xml` | Category-specific feed (frontier/industry_model/regulatory/dispute/normative) |

## Categories

| ID | Chinese Name | Description |
|----|-------------|-------------|
| `frontier` | 前沿解读 | Deep analysis, trend research, white papers |
| `industry_model` | 行业前沿模式 | Business model innovation, market movement, tech-enabled finance |
| `regulatory` | 前沿监管新闻 | Central bank, NFRA and other regulator policy changes |
| `dispute` | 前沿争议解决 | Disputes, penalties, risk case studies |
| `normative` | 前沿规范文件 | Regulatory standards, drafts for comment, industry norms |

## Rate Limiting

- 60 requests per minute per IP
- Returns `429` with `Retry-After` header when exceeded

## Caching

- All endpoints support `ETag` / `If-None-Match` → `304 Not Modified`
- Default `Cache-Control: public, max-age=300, s-maxage=600`

## Typical Agent Workflow

1. **Daily briefing**: Call `GET /api/public/daily` → summarize `executiveSummary`
2. **Search topic**: Call `GET /api/public/items?q=保理+ABS&take=10` → list results
3. **Hot topics**: Call `GET /api/public/hot-topics?days=3&take=5` → trending news
4. **Category deep dive**: Call `GET /api/public/items?category=regulatory&take=20`
5. **Paginate**: Use `nextCursor` from response for subsequent pages

## Notes

- All timestamps are in ISO 8601 format
- Scores range 0–100 across five dimensions (each 0–20)
- `selected: true` means the article was curated by editors as noteworthy
- The `summary` field contains a one-sentence AI-generated Chinese summary
