'use client';

import AppShell from '@/components/AppShell';

export default function ArchivePage() {
  return (
    <AppShell>
        <header className="page-intro">
          <p className="page-eyebrow">Archive</p>
          <h1 className="page-title">报告归档</h1>
          <p className="page-description">周度复盘与月度观察将持续沉淀为可回溯的行业资料。</p>
        </header>
        
        <div className="surface p-12 text-center">
          <div className="text-[var(--muted)] text-5xl mb-4">📦</div>
          <p className="text-[var(--ink)] mb-2">暂无归档报告</p>
          <p className="text-sm text-[var(--muted)]">
            周报和月刊将在数据采集运行一段时间后自动生成
          </p>
        </div>
    </AppShell>
  );
}
