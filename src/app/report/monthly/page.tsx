'use client';

import AppShell from '@/components/AppShell';
import { PeriodReportView } from '@/components/PeriodReportView';
import { useState, useEffect } from 'react';

const MONTH_NAMES = [
  '', '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

interface MonthlyReport {
  id: string;
  year: number;
  month: number;
  report_title: string;
  report_date_range: { start?: string; end?: string };
  executive_summary: string | null;
  total_articles: number;
  generated_at: string;
  section_frontier_interpretation: any;
  section_industry_model: any;
  section_regulatory_news: any;
  section_dispute_resolution: any;
  section_normative_documents: any;
  monthly_overview: any;
  trend_charts: any;
  expert_opinions: any;
  editorial_board: any;
  center_intro: any;
}

export default function MonthlyReportPage() {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [selected, setSelected] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    loadList();
  }, [currentYear]);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch(`/api/monthly?year=${currentYear}&limit=12`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        if (data.reports?.length > 0 && !selected) {
          setSelected(data.reports[0]);
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function loadDetail(year: number, month: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/monthly?year=${year}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setSelected(data);
      }
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: currentYear, month: genMonth }),
      });
      if (res.ok) {
        const result = await res.json();
        setSelected(result.report);
        await loadList(); // refresh sidebar
      } else {
        const err = await res.json();
        alert(`生成失败：${err.error || '未知错误'}`);
      }
    } catch (e: any) {
      alert(`生成失败：${e.message}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell
      wide
      railAfter={
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-sky-700">ARCHIVE</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">往期月报</h2>
            </div>
            <select
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
              value={currentYear}
              onChange={(e) => { setCurrentYear(Number(e.target.value)); setSelected(null); }}
            >
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y} 年</option>)}
            </select>
          </div>
          {loading ? <p className="py-5 text-center text-xs text-slate-400">加载中...</p> : reports.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">该年度暂无月报</p> : (
            <ul className="mt-4 max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {reports.map((r) => {
                const isActive = selected?.id === r.id;
                const rangeStr = r.report_date_range ? `${r.report_date_range.start || ''} ~ ${r.report_date_range.end || ''}` : '';
                return <li key={r.id}><button onClick={() => loadDetail(r.year, r.month)} className={`w-full py-3 text-left transition ${isActive ? 'text-sky-700' : 'text-slate-700 hover:text-sky-700'}`}><span className="flex items-center justify-between gap-3 text-sm font-medium"><span>{MONTH_NAMES[r.month] || `${r.month}月`}</span><span className="text-xs font-normal text-slate-400">{r.total_articles} 篇</span></span>{rangeStr && <span className="mt-1 block text-xs text-slate-400">{rangeStr}</span>}</button></li>;
              })}
            </ul>
          )}
        </section>
      }
    >
        <header className="page-intro flex items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">Monthly insight</p>
            <h1 className="page-title">保理行业月度观察</h1>
            <p className="page-description">每月汇集高价值文章与趋势信号，形成可回顾的行业观察。</p>
          </div>

          {/* Generate controls */}
          <div className="flex items-center gap-2">
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1.5"
              value={genMonth}
              onChange={(e) => setGenMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? '生成中...' : '生成月刊'}
            </button>
          </div>
        </header>

        <div className="min-w-0">
            {detailLoading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : (
              <PeriodReportView type="monthly" report={selected} />
            )}
        </div>
    </AppShell>
  );
}
