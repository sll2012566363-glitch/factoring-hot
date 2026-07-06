'use client';

import Header from '@/components/Header';
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
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            保理日报
          </h1>
          <p className="text-sm text-gray-600">
            每日自动生成的专业保理行业资讯摘要
          </p>
        </div>
        
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">{error}</div>
        ) : (
          <DailyReportView report={report} articlesBySection={articlesBySection} />
        )}
      </main>
    </div>
  );
}
