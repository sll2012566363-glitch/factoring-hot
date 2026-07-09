import Header from '@/components/Header';

const RSS_FEEDS = [
  { path: '/feed.xml', desc: '精选文章，近 7 天，按评分排序' },
  { path: '/feed/all.xml', desc: '全部文章，近 3 天' },
  { path: '/feed/daily.xml', desc: '今日日报（按板块拆分为条目）' },
  { path: '/feed/category/{category}.xml', desc: '按分类订阅，category 见下方五分类' },
];

const ENDPOINTS = [
  { method: 'GET', path: '/api/public/items', desc: '文章列表，支持分类/搜索/游标分页' },
  { method: 'GET', path: '/api/public/daily', desc: '今日日报（?date=YYYY-MM-DD 查指定日期）' },
  { method: 'GET', path: '/api/public/daily/{date}', desc: '指定日期日报（路径参数形式）' },
  { method: 'GET', path: '/api/public/hot-topics', desc: '热门话题，按多信源覆盖排序' },
  { method: 'GET', path: '/api/public/version', desc: 'API 版本与端点索引（机器可读）' },
];

const CATEGORIES = [
  { id: 'frontier', name: '前沿解读' },
  { id: 'industry_model', name: '行业前沿模式' },
  { id: 'regulatory', name: '前沿监管新闻' },
  { id: 'dispute', name: '前沿争议解决' },
  { id: 'normative', name: '前沿规范文件' },
];

function Code({ children }: { children: string }) {
  return (
    <code className="block bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-xs text-gray-700 overflow-x-auto whitespace-pre">
      {children}
    </code>
  );
}

export default function AgentPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Agent 接入</h1>
          <p className="text-sm text-gray-600">
            把保理 HOT 接进 Claude Code、Cursor、ChatGPT 等 Agent，三种方式任选。
          </p>
        </div>

        <div className="space-y-4">
          {/* Method 1: Skill */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">1. Skill（推荐给 Agent 用）</h2>
            <p className="text-sm text-gray-600 mb-3">
              适用于 Claude Code、Cursor、Gemini CLI 等支持 SKILL.md 标准的 Agent。把下面链接发给你的 Agent，
              它会自动读取并安装为技能，之后可直接理解"保理""供应链金融""ABS"等相关提问该调用哪个接口。
            </p>
            <Code>{'https://factoring-hot.vercel.app/SKILL.md'}</Code>
          </section>

          {/* Method 2: RSS */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">2. RSS 订阅</h2>
            <p className="text-sm text-gray-600 mb-3">零配置，任何 RSS reader 都能订阅，不需要 API Key。</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {RSS_FEEDS.map(f => (
                    <tr key={f.path} className="border-t border-gray-100 first:border-t-0">
                      <td className="py-2 pr-4 font-mono text-xs text-blue-600 whitespace-nowrap">{f.path}</td>
                      <td className="py-2 text-gray-600">{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Method 3: REST API */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">3. REST API</h2>
            <p className="text-sm text-gray-600 mb-3">面向开发者的自定义集成，匿名可用，游标分页 + ETag 缓存。</p>
            <Code>{'https://factoring-hot.vercel.app'}</Code>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <tbody>
                  {ENDPOINTS.map(e => (
                    <tr key={e.path} className="border-t border-gray-100 first:border-t-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="text-[11px] font-mono text-gray-400 mr-1.5">{e.method}</span>
                        <span className="font-mono text-xs text-blue-600">{e.path}</span>
                      </td>
                      <td className="py-2 text-gray-600">{e.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              完整参数说明见{' '}
              <a href="/SKILL.md" className="text-blue-600 hover:underline">/SKILL.md</a>
              {' '}或调用{' '}
              <a href="/api/public/version" className="text-blue-600 hover:underline">/api/public/version</a>
              {' '}获取机器可读索引。
            </p>
          </section>

          {/* Categories reference */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">五分类 / 五维度</h2>
            <p className="text-sm text-gray-600 mb-3">
              article 的 <code className="text-xs bg-gray-50 border border-gray-200 rounded px-1 py-0.5">category</code> 字段，
              也是评分体系的五个维度，每维度 0–20 分，总分 0–100：
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                  <span className="font-mono text-[10px] text-blue-400">{c.id}</span>
                  {c.name}
                </span>
              ))}
            </div>
          </section>

          {/* Usage notes */}
          <section className="bg-amber-50 border border-amber-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-amber-900 mb-2">使用须知</h2>
            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
              <li>摘要与推荐理由由 LLM 生成，引用前请用 <code className="text-xs">url</code> 字段回原文核对</li>
              <li>限流 60 次/分钟/IP，超出返回 429，请合理控制轮询频率</li>
              <li>接口当前免费公开，无 SLA 保证，生产环境依赖请自行做好容错</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
