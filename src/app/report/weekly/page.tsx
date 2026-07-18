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
    <AppShell wide>
        <header className="page-intro">
          <p className="page-eyebrow">Weekly review</p>
          <h1 className="page-title">保理行业周度复盘</h1>
          <p className="page-description">每周聚合行业事件，帮助你看到短期噪声之外的趋势。</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar: report list */}
          <aside className="lg:w-72 shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">周报列表</h2>
                <select
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                  value={currentYear}
                  onChange={(e) => {
                    setCurrentYear(Number(e.target.value));
                    setSelected(null);
                  }}
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y} 年</option>
                  ))}
                </select>
              </div>

              {loading ? (
                <p className="text-xs text-gray-500 py-4 text-center">加载中...</p>
              ) : reports.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">
                  该年度暂无周报
                </p>
              ) : (
                <ul className="space-y-1 max-h-96 overflow-y-auto">
                  {reports.map((r) => {
                    const isActive = selected?.id === r.id;
                    const rangeStr = r.report_date_range
                      ? `${r.report_date_range.start || ''} ~ ${r.report_date_range.end || ''}`
                      : '';
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => loadDetail(r.year, r.week_number)}
                          className={`w-full text-left p-2.5 rounded-md transition-colors ${
                            isActive
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900">
                            第 {r.week_number} 周
                          </div>
                          {rangeStr && (
                            <div className="text-xs text-gray-500 mt-0.5">{rangeStr}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {r.total_articles} 篇文章
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Main: report detail */}
          <div className="flex-1 min-w-0">
            {detailLoading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : (
              <PeriodReportView type="weekly" report={selected} />
            )}
          </div>
        </div>
    </AppShell>
  );
}
