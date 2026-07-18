import AppShell from '@/components/AppShell';

interface ChangelogEntry {
  date: string;
  items: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-07-09',
    items: [
      '新增「Agent 接入」页，整理 Skill / RSS / REST API 三种接入方式',
      '修正 SKILL.md 中过时的四分类描述（改为实际使用的五分类：前沿解读/行业前沿模式/前沿监管新闻/前沿争议解决/前沿规范文件），并在 /SKILL.md 提供可公开访问的副本',
      '新增「关于」「反馈」页',
      '首页新增「今日头条」模块，展示当日评分最高的 3 篇文章',
      '导航栏新增「更多」分组，收纳 Agent 接入 / 关于 / 更新日志 / 反馈',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <AppShell>
        <header className="page-intro">
          <p className="page-eyebrow">Changelog</p>
          <h1 className="page-title">产品更新日志</h1>
          <p className="page-description">保理 HOT 所有可见能力的更新，按时间倒序记录。</p>
        </header>

        <div className="space-y-4">
          {CHANGELOG.map(entry => (
            <section key={entry.date} className="surface p-5">
              <h2 className="text-sm font-mono font-semibold text-[var(--brand)] mb-3">{entry.date}</h2>
              <ul className="space-y-1.5">
                {entry.items.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                  <span className="text-[var(--brand)] mt-0.5">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
    </AppShell>
  );
}
