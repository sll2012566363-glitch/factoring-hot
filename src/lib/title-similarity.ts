function normalizeTitle(title: string): string {
  return title
    .replace(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}[日]?(?:\s+\d{1,2}:\d{2})?/g, '')
    .replace(/[【】[\]（）()“”"'‘’·|｜—–\-_,，。！？!?:：;\s]/g, '');
}

function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index++) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

export function titleSimilarity(left: string, right: string): number {
  const a = bigrams(normalizeTitle(left));
  const b = bigrams(normalizeTitle(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
