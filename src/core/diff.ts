import DiffMatchPatch from "diff-match-patch";

export type RangePair = { start: number; end: number };

export function mergeRanges(ranges: RangePair[]): RangePair[] {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const out: RangePair[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const last = out[out.length - 1];

    if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }

  return out;
}

export function computeChangedRanges(a: string, b: string): RangePair[] {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);

  const ranges: RangePair[] = [];
  let bPos = 0;

  for (const [op, text] of diffs) {
    const len = text.length;

    if (op === 0) {
      bPos += len;
      continue;
    }

    if (op === 1) {
      if (len > 0) ranges.push({ start: bPos, end: bPos + len });
      bPos += len;
      continue;
    }

    // deletion from a: no advance on b side, and no non-empty range to mark
  }

  return mergeRanges(ranges);
}
