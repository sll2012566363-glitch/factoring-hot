'use client';

import Header from '@/components/Header';
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
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">保理月刊</h1>
            <p className="text-sm text-gray-600">
              每月深度行业分析，自动选取评分最高的文章填入各板块
            </p>
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
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-72 shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">月刊列表</h2>
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
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-500 mb-2">该年度暂无月刊</p>
                  <p className="text-xs text-blue-500">
                    点击右上方「生成月刊」按钮创建
                  </p>
                </div>
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
                          onClick={() => loadDetail(r.year, r.month)}
                          className={`w-full text-left p-2.5 rounded-md transition-colors ${
                            isActive
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {MONTH_NAMES[r.month] || `${r.month}月`}
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

          {/* Main */}
          <div className="flex-1 min-w-0">
            {detailLoading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : (
              <PeriodReportView type="monthly" report={selected} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
