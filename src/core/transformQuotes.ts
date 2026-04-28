import { decidePairContext } from "./context";
import { makeChangeEvent, makeSkipEvent } from "./model";
import { isQuoteWhitelistHit } from "./rules";
import type { ChangeEvent, SkipEvent, TransformResult, Stats } from "./types";
import { inc } from "./types";

type Pair = { left: number; right: number };

function splitLinesKeepEnds(s: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") {
      out.push({ text: s.slice(start, i + 1), start });
      start = i + 1;
    }
  }

  if (start < s.length) out.push({ text: s.slice(start), start });
  if (!out.length) out.push({ text: "", start: 0 });
  return out;
}

function splitParagraphsByBlankLines(text: string): Array<{ text: string; start: number; isSep: boolean }> {
  const parts = text.split(/(\n[ \t]*\n+)/);
  const out: Array<{ text: string; start: number; isSep: boolean }> = [];
  let pos = 0;

  for (const part of parts) {
    out.push({ text: part, start: pos, isSep: /^\n[ \t]*\n+$/.test(part) });
    pos += part.length;
  }
  return out;
}

function collectApostrophePositions(seg: string): Set<number> {
  const apost = new Set<number>();

  for (let i = 1; i < seg.length - 1; i++) {
    const a = seg[i - 1];
    const b = seg[i];
    const c = seg[i + 1];

    if (b === "'" && /[A-Za-z]/.test(a) && /[A-Za-z]/.test(c)) {
      apost.add(i);
    }
  }

  return apost;
}

function pairLinearPositions(positions: number[]): { pairs: Pair[]; odd: number[] } {
  const pairs: Pair[] = [];
  const odd: number[] = [];

  for (let i = 0; i + 1 < positions.length; i += 2) {
    pairs.push({ left: positions[i], right: positions[i + 1] });
  }

  if (positions.length % 2 === 1) {
    odd.push(positions[positions.length - 1]);
  }

  return { pairs, odd };
}

function transformLine(line: string, lineBase: number, stats: Stats): TransformResult {
  const chars = line.split("");
  const changes: ChangeEvent[] = [];
  const skips: SkipEvent[] = [];

  const doublePos: number[] = [];
  const singlePos: number[] = [];
  const apost = collectApostrophePositions(line);

  for (let i = 0; i < line.length; i++) {
    if (line[i] === `"`) doublePos.push(i);
    if (line[i] === `'` && !apost.has(i)) singlePos.push(i);
  }

  const dq = pairLinearPositions(doublePos);
  const sq = pairLinearPositions(singlePos);

  if (dq.odd.length) {
    stats.skipped_quote_paragraphs_double += 1;
    for (const p of dq.odd) {
      skips.push(makeSkipEvent(lineBase + p, lineBase + p + 1, "跳过：引号数量不成对", "uncertain", "quote_odd_fallback"));
    }
  }

  if (sq.odd.length) {
    stats.skipped_quote_paragraphs_single += 1;
    for (const p of sq.odd) {
      skips.push(makeSkipEvent(lineBase + p, lineBase + p + 1, "跳过：引号数量不成对", "uncertain", "quote_odd_fallback"));
    }
  }

  for (const pair of dq.pairs) {
    const hit = isQuoteWhitelistHit(line, pair.left, pair.right, `"`);
    if (!hit) {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：不符合中文标点符号用法规范",
          "uncertain",
          "quote_whitelist_miss",
        ),
      );
      continue;
    }

    const ctx = decidePairContext(line, pair.left, pair.left + 1, pair.right, pair.right + 1);
    if (ctx.decision === "positive") {
      chars[pair.left] = "“";
      chars[pair.right] = "”";
      inc(stats, "double_quotes", 2);
      changes.push(
        makeChangeEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "英文引号转换为中文引号",
        ),
      );
    } else if (ctx.decision === "negative") {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：非中文标点符号",
          "negative",
          "quote_context_negative",
        ),
      );
    } else {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：无法判定中文语境",
          "uncertain",
          "quote_context_unknown",
        ),
      );
    }
  }

  for (const pair of sq.pairs) {
    const hit = isQuoteWhitelistHit(line, pair.left, pair.right, `'`);
    if (!hit) {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：不符合中文标点符号用法规范",
          "uncertain",
          "quote_whitelist_miss",
        ),
      );
      continue;
    }

    const ctx = decidePairContext(line, pair.left, pair.left + 1, pair.right, pair.right + 1);
    if (ctx.decision === "positive") {
      chars[pair.left] = "‘";
      chars[pair.right] = "’";
      inc(stats, "single_quotes", 2);
      changes.push(
        makeChangeEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "英文引号转换为中文引号",
        ),
      );
    } else if (ctx.decision === "negative") {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：非中文标点符号",
          "negative",
          "quote_context_negative",
        ),
      );
    } else {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：无法判定中文语境",
          "uncertain",
          "quote_context_unknown",
        ),
      );
    }
  }

  return {
    text: chars.join(""),
    changes,
    skips,
  };
}

export function transformQuotes(text: string, stats: Stats): TransformResult {
  const parts = splitParagraphsByBlankLines(text);
  const out: string[] = [];
  const changes: ChangeEvent[] = [];
  const skips: SkipEvent[] = [];

  for (const part of parts) {
    if (part.isSep) {
      out.push(part.text);
      continue;
    }

    const lines = splitLinesKeepEnds(part.text);
    for (const line of lines) {
      const r = transformLine(line.text, part.start + line.start, stats);
      out.push(r.text);
      changes.push(...r.changes);
      skips.push(...r.skips);
    }
  }

  return {
    text: out.join(""),
    changes,
    skips,
  };
}
