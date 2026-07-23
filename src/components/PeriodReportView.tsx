'use client';

const SECTION_META: Record<string, { label: string; short: string; index: string; accent: string }> = {
  section_frontier_interpretation: { label: '前沿解读', short: '前沿', index: '01', accent: 'bg-sky-500' },
  section_industry_model: { label: '业务与市场', short: '市场', index: '02', accent: 'bg-teal-500' },
  section_regulatory_news: { label: '监管政策', short: '监管', index: '03', accent: 'bg-indigo-500' },
  section_dispute_resolution: { label: '风险与争议', short: '风险', index: '04', accent: 'bg-amber-500' },
  section_normative_documents: { label: '规范文件', short: '规范', index: '05', accent: 'bg-slate-500' },
};

interface PeriodReportViewProps {
  type: 'weekly' | 'monthly';
  report: any;
}

function dateRange(report: any) {
  const range = report.report_date_range;
  return range ? `${range.start || ''} — ${range.end || ''}` : '';
}

function sectionArticles(content: any): any[] {
  return [
    ...(content?.articles || []),
    ...((content?.subsections || []).flatMap((section: any) => section.articles || [])),
  ];
}

function getSections(report: any) {
  return Object.entries(SECTION_META).flatMap(([key, meta]) => {
    const content = report[key];
    const articles = sectionArticles(content);
    return content && articles.length ? [{ key, meta, content, articles }] : [];
  });
}

function insightLines(report: any, type: 'weekly' | 'monthly') {
  if (type === 'weekly' && Array.isArray(report.key_insights) && report.key_insights.length) return report.key_insights.slice(0, 4);
  const text = String(report.executive_summary || '').split(/\n|。/).map((item) => item.trim()).filter(Boolean);
  return text.slice(0, 3);
}

export function PeriodReportView({ type, report }: PeriodReportViewProps) {
  if (!report) return <EmptyState type={type} />;

  const sections = getSections(report);
  const insights = insightLines(report, type);
  const isWeekly = type === 'weekly';
  const generated = report.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : '';
  const primaryTheme = insights[0] || report.executive_summary || '本期行业情报正在整理。';

  return (
    <article className="space-y-7 pb-10">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-cyan-200 uppercase">
            {isWeekly ? `VOL.${report.year}-W${String(report.week_number || '').padStart(2, '0')} · WEEKLY` : `VOL.${report.year}-${String(report.month || '').padStart(2, '0')} · MONTHLY`}
          </p>
          <p className="mt-5 text-xs font-medium text-slate-300">{isWeekly ? '周度观察' : '月度复盘'} · 编辑系统综合</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {report.report_title || (isWeekly ? `${report.year} 年第 ${report.week_number} 周行业观察` : `${report.year} 年 ${report.month} 月行业复盘`)}
          </h2>
          {dateRange(report) && <p className="mt-3 text-sm text-slate-300">{dateRange(report)}</p>}
          <div className="mt-8 border-l-2 border-cyan-300 pl-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-cyan-200">{isWeekly ? '本周主线' : '本月核心判断'}</p>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-100 sm:text-lg">{primaryTheme}</p>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/15 pt-5 sm:flex sm:items-center sm:gap-8">
          <Metric value={report.total_articles || 0} label="条精选" />
          <Metric value={sections.length} label="个主题" />
          <Metric value={isWeekly ? `${Math.max(1, Math.ceil((report.total_articles || 0) / 8))} min` : report.monthly_overview?.avg_score || '—'} label={isWeekly ? '建议阅读' : '平均关注度'} />
          <Metric value={generated || '—'} label="生成日期" />
        </div>
      </section>

      {insights.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-sky-700">EDITOR&apos;S TAKE</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{isWeekly ? '本周看点' : '本月趋势判断'}</h3>
            </div>
            <span className="hidden text-xs text-slate-400 sm:block">从信息中提炼判断</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {insights.map((insight: string, index: number) => (
              <div key={index} className="flex gap-3 rounded-xl bg-slate-50 p-4">
                <span className="text-sm font-semibold text-sky-700">0{index + 1}</span>
                <p className="text-sm leading-6 text-slate-700">{insight}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-sky-700">REPORT MAP</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">本期主题</h3>
          </div>
          <span className="text-xs text-slate-400">{sections.reduce((total, item) => total + item.articles.length, 0)} 篇依据文章</span>
        </div>
        <nav className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="报告主题目录">
          {sections.map(({ key, meta, articles }: any) => (
            <a key={key} href={`#${key}`} className="group flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50">
              <span className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-400">{meta.index}</span><span className="text-sm font-medium text-slate-800">{meta.label}</span></span>
              <span className="text-xs text-slate-400 group-hover:text-sky-700">{articles.length} 篇</span>
            </a>
          ))}
        </nav>
      </section>

      {!isWeekly && report.monthly_overview && <MonthlySignals overview={report.monthly_overview} />}

      <div className="space-y-5">
        {sections.map(({ key, meta, content, articles }: any) => (
          <SectionBlock key={key} id={key} meta={meta} content={content} articles={articles} />
        ))}
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-amber-700">NEXT WATCH</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{isWeekly ? '下周关注' : '下月观察'}</h3>
        <div className="mt-3 text-sm leading-7 text-slate-700">
          {report.trend_analysis ? <JsonSection data={report.trend_analysis} /> : <p>持续关注监管政策落地、基础交易真实性、应收账款确权及融资租赁资产风险变化。</p>}
        </div>
      </section>
    </article>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div><div className="text-lg font-semibold text-white">{value}</div><div className="mt-0.5 text-[11px] text-slate-400">{label}</div></div>;
}

function MonthlySignals({ overview }: { overview: any }) {
  const stats = [
    ['前沿解读', overview.by_category?.frontier || 0], ['业务与市场', overview.by_category?.industry_model || 0],
    ['监管政策', overview.by_category?.regulatory || 0], ['风险与争议', overview.by_category?.dispute || 0],
    ['规范文件', overview.by_category?.normative || 0],
  ];
  const maximum = Math.max(...stats.map(([, value]) => Number(value)), 1);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><p className="text-xs font-semibold tracking-[0.14em] text-sky-700">MONTHLY SIGNALS</p><h3 className="mt-1 text-lg font-semibold text-slate-950">本月信息分布</h3><div className="mt-5 space-y-3">{stats.map(([label, value]) => <div key={String(label)} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm"><span className="text-slate-600">{label}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.max(4, Number(value) / maximum * 100)}%` }} /></div><span className="text-right font-medium text-slate-700">{value}</span></div>)}</div></section>;
}

function SectionBlock({ id, meta, content, articles }: { id: string; meta: any; content: any; articles: any[] }) {
  const feature = articles[0];
  const remaining = articles.slice(1);
  const summary = content.summary || content.intro || feature?.excerpt || `本期共收录 ${articles.length} 篇${meta.label}相关资讯，以下为重点内容。`;
  return <section id={id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex gap-4"><span className={`mt-1 h-10 w-1 rounded-full ${meta.accent}`} /><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.14em] text-slate-400">{meta.index} · {meta.short}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{meta.label}</h3></div><span className="shrink-0 text-xs text-slate-400">{articles.length} 篇</span></div><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{summary}</p></div></div>{feature && <a href={feature.link} target="_blank" rel="noopener noreferrer" className="group mt-5 block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"><p className="text-xs font-semibold text-sky-700">重点文章</p><h4 className="mt-2 text-base font-semibold leading-6 text-slate-900 group-hover:text-sky-700">{feature.title}</h4><ArticleMeta article={feature} /></a>}{content.subsections?.map((sub: any, index: number) => <div key={index} className="mt-5"><p className="border-l-2 border-slate-300 pl-2 text-sm font-semibold text-slate-700">{sub.title}</p><ArticleList articles={(sub.articles || []).filter((article: any) => article.id !== feature?.id)} /></div>)}{remaining.length > 0 && <ArticleList articles={content.subsections ? remaining.filter((article: any) => !content.subsections.flatMap((sub: any) => sub.articles || []).some((subArticle: any) => subArticle.id === article.id)) : remaining} />}</section>;
}

function ArticleList({ articles }: { articles: any[] }) {
  if (!articles.length) return null;
  return <div className="mt-4 divide-y divide-slate-100">{articles.map((article, index) => <a key={article.id || index} href={article.link} target="_blank" rel="noopener noreferrer" className="group flex gap-3 py-3 first:pt-0"><span className="w-5 pt-0.5 text-right text-xs font-medium text-slate-400">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-6 text-slate-800 group-hover:text-sky-700">{article.title}</p><ArticleMeta article={article} /></div></a>)}</div>;
}

function ArticleMeta({ article }: { article: any }) {
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">{article.source_name && <span>{article.source_name}</span>}{article.pub_date && <span>{String(article.pub_date).slice(0, 10)}</span>}{article.score != null && <span className="text-amber-700">{Math.round(article.score)} 分关注度</span>}</div>;
}

function JsonSection({ data }: { data: any }) {
  if (Array.isArray(data)) return <ul className="space-y-1">{data.slice(0, 4).map((item, index) => <li key={index}>• {typeof item === 'string' ? item : '持续跟踪相关行业信号'}</li>)}</ul>;
  if (typeof data === 'object' && data !== null) {
    const categoryLabels: Record<string, string> = { frontier: '前沿解读', industry_model: '业务与市场', regulatory: '监管政策', dispute: '风险与争议', normative: '规范文件' };
    const sources = Array.isArray(data.top_sources) ? data.top_sources : [];
    const distribution = data.category_distribution && typeof data.category_distribution === 'object' ? data.category_distribution : null;
    return <div className="space-y-3">
      {sources.length > 0 && <p><span className="font-medium text-slate-800">重点信源：</span>{sources.slice(0, 5).map((source: any) => `${source.name || '未知来源'}${source.count ? `（${source.count}篇）` : ''}`).join('、')}</p>}
      {distribution && <p><span className="font-medium text-slate-800">本期重点：</span>{Object.entries(distribution).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${categoryLabels[key] || key}${value}篇`).join('、') || '持续关注保理与供应链金融实质关联资讯'}</p>}
    </div>;
  }
  return null;
}

function EmptyState({ type }: { type: 'weekly' | 'monthly' }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><p className="text-sm font-medium text-slate-700">暂无{type === 'weekly' ? '周度观察' : '月度复盘'}数据</p><p className="mt-2 text-xs text-slate-400">报告生成后将在此呈现本期主线和行业信号。</p></div>;
}

export default PeriodReportView;
