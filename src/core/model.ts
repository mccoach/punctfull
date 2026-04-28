import type { ChangeEvent, MarkRange, Range, SkipEvent, SkipRange } from "./types";

function clampRange(r: Range, maxLen: number): Range {
  const start = Math.max(0, Math.min(maxLen, r.start));
  const end = Math.max(start, Math.min(maxLen, r.end));
  return { start, end };
}

export function makeRange(start: number, end: number): Range {
  return {
    start: Math.max(0, start),
    end: Math.max(0, end),
  };
}

export function makeChangeEvent(
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
  tip: string,
): ChangeEvent {
  return {
    source: makeRange(sourceStart, sourceEnd),
    target: makeRange(targetStart, targetEnd),
    tip,
  };
}

export function makeSkipEvent(
  start: number,
  end: number,
  reason: string,
  kind: SkipEvent["kind"],
  key: SkipEvent["key"],
): SkipEvent {
  return {
    range: makeRange(start, end),
    reason,
    kind,
    key,
  };
}

export function toMarkRanges(events: ChangeEvent[], textLen: number): MarkRange[] {
  return events
    .map((e) => ({
      ...clampRange(e.target, textLen),
      tip: e.tip,
    }))
    .filter((r) => r.end > r.start);
}

export function toSkipRanges(events: SkipEvent[], textLen: number): SkipRange[] {
  return events
    .map((e) => ({
      ...clampRange(e.range, textLen),
      reason: e.reason,
      kind: e.kind,
      key: e.key,
    }))
    .filter((r) => r.end > r.start);
}
