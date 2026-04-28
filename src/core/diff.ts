import DiffMatchPatch from "diff-match-patch";
import type { MarkRange } from "./types";

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
  }

  return mergeRanges(ranges);
}

function intersectTip(marks: MarkRange[], start: number, end: number): string {
  for (const m of marks) {
    if (m.end <= start || m.start >= end) continue;
    return m.tip;
  }
  return "已修改";
}

export function computeChangedMarks(a: string, b: string, outMarks: MarkRange[]) {
  const rightRanges = computeChangedRanges(a, b).map((r) => ({
    ...r,
    tip: intersectTip(outMarks, r.start, r.end),
  }));

  const leftRanges = computeChangedRanges(b, a).map((r) => ({
    ...r,
    tip: "原文对应位置",
  }));

  return {
    rightMarks: rightRanges,
    leftMarks: leftRanges,
  };
}
