import AppShell from '@/components/AppShell';

const REASONS = [
  '信源该收录但没收录 / 该下架但还在抓',
  '文章分类或评分明显不准',
  '话题聚类把不相关的文章聚到一起了',
  '日报 / 周报 / 月刊生成有问题',
  '其他 bug 或建议',
];

export default function FeedbackPage() {
  return (
    <AppShell>
        <header className="page-intro">
          <p className="page-eyebrow">Feedback & correction</p>
          <h1 className="page-title">帮助我们把情报做准。</h1>
          <p className="page-description">信源遗漏、内容纠错、聚类错误或产品建议，都会直接帮助这套系统变得更可靠。</p>
        </header>

        <section className="surface p-5 mb-4">
          <h2 className="section-title mb-3">你可以反馈</h2>
          <ul className="space-y-2">
            {REASONS.map(r => (
              <li key={r} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <span className="text-[var(--brand)] mt-0.5">·</span>
                {r}
              </li>
            ))}
          </ul>
        </section>

        <a
          href="https://github.com/sll2012566363-glitch/factoring-hot/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="primary-button"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          在 GitHub 提 Issue
        </a>
    </AppShell>
  );
}
