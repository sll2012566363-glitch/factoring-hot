import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import AppShell from '@/components/AppShell';

export const revalidate = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface ArchiveItem {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  href: string;
  generatedAt: string;
}

async function getArchive() {
  const [weekly, monthly, daily] = await Promise.all([
    supabase.from('weekly_reports')
      .select('id, year, week_number, report_title, report_date_range, total_articles, generated_at')
      .order('year', { ascending: false }).order('week_number', { ascending: false }).limit(52),
    supabase.from('monthly_reports')
      .select('id, year, month, report_title, report_date_range, total_articles, generated_at')
      .order('year', { ascending: false }).order('month', { ascending: false }).limit(24),
    supabase.from('daily_reports')
      .select('id, report_date, report_title, total_articles, generated_at')
      .order('report_date', { ascending: false }).limit(31),
  ]);

  const weeklyItems: ArchiveItem[] = (weekly.data || []).map((item) => ({
    id: item.id,
    title: item.report_title,
    subtitle: `${item.report_date_range?.start || ''} — ${item.report_date_range?.end || ''}`,
    count: item.total_articles,
    href: `/report/weekly?year=${item.year}&week=${item.week_number}`,
    generatedAt: item.generated_at,
  }));
  const monthlyItems: ArchiveItem[] = (monthly.data || []).map((item) => ({
    id: item.id,
    title: item.report_title,
    subtitle: `${item.report_date_range?.start || ''} — ${item.report_date_range?.end || ''}`,
    count: item.total_articles,
    href: `/report/monthly?year=${item.year}&month=${item.month}`,
    generatedAt: item.generated_at,
  }));
  const dailyItems: ArchiveItem[] = (daily.data || []).map((item) => ({
    id: item.id,
    title: item.report_title,
    subtitle: item.report_date,
    count: item.total_articles,
    href: `/report?date=${item.report_date}`,
    generatedAt: item.generated_at,
  }));
  return { weeklyItems, monthlyItems, dailyItems };
}

function ArchiveSection({ title, eyebrow, items }: { title: string; eyebrow: string; items: ArchiveItem[] }) {
  return (
    <section className="surface p-6">
      <p className="page-eyebrow">{eyebrow}</p>
      <div className="mt-1 flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-[var(--ink)]">{title}</h2>
        <span className="text-xs text-[var(--muted)]">{items.length} 期</span>
      </div>
      {items.length ? (
        <div className="mt-5 divide-y divide-[var(--line)]">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="group flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-6 text-[var(--ink)] transition group-hover:text-[var(--brand)]">{item.title}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.subtitle}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs text-[var(--muted)]">{item.count} 篇</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-[var(--line)] py-8 text-center text-sm text-[var(--muted)]">暂无报告</p>
      )}
    </section>
  );
}

export default async function ArchivePage() {
  const { weeklyItems, monthlyItems, dailyItems } = await getArchive();
  return (
    <AppShell wide>
      <header className="page-intro">
        <p className="page-eyebrow">Archive</p>
        <h1 className="page-title">报告归档</h1>
        <p className="page-description">按日报、周度复盘与月度观察回溯行业变化。</p>
      </header>
      <div className="grid gap-5 xl:grid-cols-2">
        <ArchiveSection title="周度复盘" eyebrow="Weekly" items={weeklyItems} />
        <ArchiveSection title="月度观察" eyebrow="Monthly" items={monthlyItems} />
        <div className="xl:col-span-2">
          <ArchiveSection title="近 31 日日报" eyebrow="Daily" items={dailyItems} />
        </div>
      </div>
    </AppShell>
  );
}
