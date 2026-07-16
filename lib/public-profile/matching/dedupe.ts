// Duplicate-posting collapse, ported from the refined private engine
// (app/scans/dedupe.ts). Boards frequently post the same role several times
// (per location / per req id); results must show each role once.

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCompanyName(value: string) {
  return normalizeKey(value)
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|group|ai)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string) {
  return normalizeKey(value)
    .replace(/\b(remote|hybrid|onsite|on site|contract|full time|part time|temporary|temp)\b/g, " ")
    .replace(/\b(i|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function duplicatePostingKey(input: { companyName: string; title: string }) {
  return [
    normalizeCompanyName(input.companyName),
    normalizeTitle(input.title),
  ].filter(Boolean).join("|");
}

// Keep the first item per duplicate key; callers order the input best-first
// (by score at read time, by decision score at scan time).
export function selectUniquePostings<T>(
  items: T[],
  keyFor: (item: T) => string,
): { selected: T[]; duplicates: T[] } {
  const selected: T[] = [];
  const duplicates: T[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = keyFor(item);
    if (!key || !seen.has(key)) {
      seen.add(key);
      selected.push(item);
    } else {
      duplicates.push(item);
    }
  }

  return { selected, duplicates };
}
