import Header from '@/components/Header';

const STATS = [
  { value: '48', label: '权威信源' },
  { value: '5', label: '评分维度' },
  { value: '1h', label: '抓取频率' },
  { value: '3', label: '报告周期（日/周/月）' },
];

const STEPS = [
  { title: '抓取', desc: '每小时遍历 48 个信源（政府监管、行业协会、金融媒体、智库、交易所），RSS/HTML 双通道抓取并去重入库。' },
  { title: '过滤', desc: '关键词 + LLM 判断相关性，只留下真正和保理/供应链金融相关的内容。' },
  { title: '评分', desc: 'LLM 按前沿解读、行业前沿模式、前沿监管新闻、前沿争议解决、前沿规范文件五个维度打分，每维度 0–20，总分 0–100。' },
  { title: '聚类', desc: '同一事件的多方报道用 bigram Jaccard 算法聚成一个话题，方便看谁都在报什么。' },
  { title: '生成', desc: '每天自动出日报，每周/每月出周报/月刊，摘要和推荐理由都是 AI 生成。' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">关于保理 HOT</h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            一个只做一件事的站：把中国保理与供应链金融行业每天发生的事，筛出来、打上分、按话题理清楚。
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {STATS.map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">怎么运作的</h2>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <span className="text-sm font-medium text-gray-900">{s.title}</span>
                  <span className="text-sm text-gray-600"> — {s.desc}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">关于内容</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            页面上的摘要和推荐理由由 AI 生成，仅作为阅读索引，原文版权归各信源所有。引用前请点击标题或卡片图标跳转原文核对。
            如果发现某篇文章分类不准、某个信源该收录没收录，或者其他任何问题，欢迎通过
            <a href="/feedback" className="text-blue-600 hover:underline mx-1">反馈</a>
            告诉我们。
          </p>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-2">开放接入</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            提供 RSS 订阅和公开 REST API，也支持作为 Skill 接入 Claude Code / Cursor 等 Agent，
            详见 <a href="/agent" className="text-blue-600 hover:underline">Agent 接入</a>。
          </p>
        </section>
      </main>
    </div>
  );
}
