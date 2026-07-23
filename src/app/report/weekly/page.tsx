'use client';

import AppShell from '@/components/AppShell';
import { PeriodReportView } from '@/components/PeriodReportView';
import { useState, useEffect } from 'react';

interface WeeklyReport {
  id: string;
  year: number;
  week_number: number;
  report_title: string;
  report_date_range: { start?: string; end?: string };
  executive_summary: string | null;
  key_insights: string[] | null;
  total_articles: number;
  generated_at: string;
  // JSONB sections
  section_frontier_interpretation: any;
  section_industry_model: any;
  section_regulatory_news: any;
  section_dispute_resolution: any;
  section_normative_documents: any;
  trend_analysis: any;
}

export default function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selected, setSelected] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentYear, setCurrentYear] = useState(
    new Date().getFullYear()
  );

  useEffect(() => {
    async function loadList() {
      setLoading(true);
      try {
        const res = await fetch(`/api/weekly?year=${currentYear}&limit=52`);
        if (res.ok) {
          const data = await res.json();
          setReports(data.reports || []);
          // Auto-select latest if available and none selected
          if (data.reports?.length > 0 && !selected) {
            setSelected(data.reports[0]);
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    loadList();
  }, [currentYear]);

  async function loadDetail(year: number, week: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/weekly?year=${year}&week=${week}`);
      if (res.ok) {
        const data = await res.json();
        setSelected(data);
      }
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  return (
    <AppShell
      wide
      railAfter={
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-sky-700">ARCHIVE</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">往期周报</h2>
            </div>
            <select
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
              value={currentYear}
              onChange={(e) => {
                setCurrentYear(Number(e.target.value));
                setSelected(null);
              }}
            >
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y} 年</option>)}
            </select>
          </div>

          {loading ? (
            <p className="py-5 text-center text-xs text-slate-400">加载中...</p>
          ) : reports.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">该年度暂无周报</p>
          ) : (
            <ul className="mt-4 max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {reports.map((r) => {
                const isActive = selected?.id === r.id;
                const rangeStr = r.report_date_range ? `${r.report_date_range.start || ''} ~ ${r.report_date_range.end || ''}` : '';
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => loadDetail(r.year, r.week_number)}
                      className={`w-full py-3 text-left transition ${isActive ? 'text-sky-700' : 'text-slate-700 hover:text-sky-700'}`}
                    >
                      <span className="flex items-center justify-between gap-3 text-sm font-medium"><span>第 {r.week_number} 周</span><span className="text-xs font-normal text-slate-400">{r.total_articles} 篇</span></span>
                      {rangeStr && <span className="mt-1 block text-xs text-slate-400">{rangeStr}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      }
    >
        <header className="page-intro">
          <p className="page-eyebrow">Weekly review</p>
          <h1 className="page-title">保理行业周度复盘</h1>
          <p className="page-description">每周聚合行业事件，帮助你看到短期噪声之外的趋势。</p>
        </header>

        <div className="min-w-0">
          {detailLoading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : (
            <PeriodReportView type="weekly" report={selected} />
          )}
        </div>
    </AppShell>
  );
}
