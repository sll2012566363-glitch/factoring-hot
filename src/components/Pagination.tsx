'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

type PageToken = number | 'ellipsis';

/**
 * 首尾页始终保留，当前页前后各 2 页；窗口与首/尾之间缺口 > 1 时补省略号，
 * 例如 page=7/34 → 1 … 5 6 [7] 8 9 … 34
 */
function buildPageTokens(page: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  for (let i = page - 2; i <= page + 2; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) tokens.push('ellipsis');
    tokens.push(p);
    prev = p;
  }
  return tokens;
}

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const tokens = buildPageTokens(page, totalPages);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav className="pagination" aria-label="资料库分页">
      <button
        type="button"
        className="pagination-side"
        disabled={prevDisabled}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>

      <div className="pagination-pages">
        {tokens.map((token, index) =>
          token === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={token}
              type="button"
              className={`pagination-page ${token === page ? 'active' : ''}`}
              aria-current={token === page ? 'page' : undefined}
              onClick={() => token !== page && onChange(token)}
            >
              {token}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        className="pagination-side"
        disabled={nextDisabled}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
