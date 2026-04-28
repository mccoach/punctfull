import { toMarkRanges, toSkipRanges } from "./model";
import type { ChangeEvent, SkipEvent, TransformResult } from "./types";

function cloneChanges(changes: ChangeEvent[]): ChangeEvent[] {
  return changes.map((c) => ({
    source: { ...c.source },
    target: { ...c.target },
    tip: c.tip,
  }));
}

function cloneSkips(skips: SkipEvent[]): SkipEvent[] {
  return skips.map((s) => ({
    range: { ...s.range },
    reason: s.reason,
    kind: s.kind,
    key: s.key,
  }));
}

function shiftPosByChanges(pos: number, changes: ChangeEvent[]): number {
  let delta = 0;

  for (const c of changes) {
    const s0 = c.source.start;
    const s1 = c.source.end;
    const inLen = s1 - s0;
    const outLen = c.target.end - c.target.start;

    if (pos < s0) break;

    if (pos <= s1) {
      return c.target.start + Math.min(pos - s0, outLen);
    }

    delta += outLen - inLen;
  }

  return pos + delta;
}

function remapSkipEvents(skips: SkipEvent[], changes: ChangeEvent[]): SkipEvent[] {
  return skips.map((s) => ({
    ...s,
    range: {
      start: shiftPosByChanges(s.range.start, changes),
      end: shiftPosByChanges(s.range.end, changes),
    },
  }));
}

function normalizeChangeEventRanges(changes: ChangeEvent[]): ChangeEvent[] {
  return changes.map((c) => {
    const targetLen = c.target.end - c.target.start;
    return {
      ...c,
      target: {
        start: c.target.start,
        end: targetLen <= 0 ? c.target.start + 1 : c.target.end,
      },
    };
  });
}

export type ProjectedEvents = {
  text: string;
  changes: ChangeEvent[];
  skips: SkipEvent[];
  marks: ReturnType<typeof toMarkRanges>;
  skipRanges: ReturnType<typeof toSkipRanges>;
};

export function projectEvents(result: TransformResult): ProjectedEvents {
  const sortedChanges = cloneChanges(result.changes).sort(
    (a, b) => a.source.start - b.source.start || a.source.end - b.source.end,
  );

  const normalizedChanges = normalizeChangeEventRanges(sortedChanges);
  const remappedSkips = remapSkipEvents(cloneSkips(result.skips), normalizedChanges);

  return {
    text: result.text,
    changes: normalizedChanges,
    skips: remappedSkips,
    marks: toMarkRanges(normalizedChanges, result.text.length),
    skipRanges: toSkipRanges(remappedSkips, result.text.length),
  };
}
