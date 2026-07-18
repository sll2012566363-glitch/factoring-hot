'use client';

import AppShell from '@/components/AppShell';
import { DailyReportView } from '@/components/DailyReportView';
import { useState, useEffect } from 'react';
import type { DailyReport, Article } from '@/types';

export default function DailyReportPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const now = new Date();
        const beijingOffset = 8 * 60 * 60 * 1000;
        const beijingDate = new Date(now.getTime() + beijingOffset);
        const today = beijingDate.toISOString().split('T')[0];

        const res = await fetch(`/api/report?date=${today}`);
        if (res.ok) {
          const data = await res.json();
          setReport(data);
        }
      } catch (err) {
        setError('加载日报失败');
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, []);

  // Build articlesBySection from report.sections
  const articlesBySection: Record<string, Article[]> = {};
  if (report?.sections) {
    for (const section of report.sections) {
      articlesBySection[section.id] = section.articles || [];
    }
  }

  return (
    <AppShell>
        <header className="page-intro">
          <p className="page-eyebrow">Daily Briefing</p>
          <h1 className="page-title">保理行业日报</h1>
          <p className="page-description">以当日行业信号为线索，汇总监管、市场、交易与风险变化。</p>
        </header>
        
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">{error}</div>
        ) : (
          <DailyReportView report={report} articlesBySection={articlesBySection} />
        )}
    </AppShell>
  );
}
