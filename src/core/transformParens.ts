import { decidePairContext } from "./context";
import { makeChangeEvent, makeSkipEvent } from "./model";
import { isParenWhitelistHit } from "./rules";
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

function pairParensInLine(line: string): { pairs: Pair[]; odd: number[] } {
  const stack: number[] = [];
  const pairs: Pair[] = [];
  const odd: number[] = [];

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "(") stack.push(i);
    else if (ch === ")") {
      const left = stack.pop();
      if (left === undefined) odd.push(i);
      else pairs.push({ left, right: i });
    }
  }

  odd.push(...stack);
  pairs.sort((a, b) => a.left - b.left || a.right - b.right);
  return { pairs, odd };
}

function transformLine(line: string, lineBase: number, stats: Stats): TransformResult {
  const chars = line.split("");
  const changes: ChangeEvent[] = [];
  const skips: SkipEvent[] = [];
  const { pairs, odd } = pairParensInLine(line);

  for (const p of odd) {
    skips.push(makeSkipEvent(lineBase + p, lineBase + p + 1, "跳过：括号数量不成对", "uncertain", "paren_odd_fallback"));
  }

  for (const pair of pairs) {
    const hit = isParenWhitelistHit(line, pair.left, pair.right);

    if (!hit) {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：不符合中文标点符号用法规范",
          "uncertain",
          "paren_whitelist_miss",
        ),
      );
      continue;
    }

    const ctx = decidePairContext(line, pair.left, pair.left + 1, pair.right, pair.right + 1);
    if (ctx.decision === "positive") {
      chars[pair.left] = "（";
      chars[pair.right] = "）";
      inc(stats, "parens_converted", 1);
      changes.push(
        makeChangeEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "英文括号转换为中文括号",
        ),
      );
    } else if (ctx.decision === "negative") {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：非中文标点符号",
          "negative",
          "paren_context_negative",
        ),
      );
    } else {
      skips.push(
        makeSkipEvent(
          lineBase + pair.left,
          lineBase + pair.right + 1,
          "跳过：无法判定中文语境",
          "uncertain",
          "paren_context_unknown",
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

export function transformParens(text: string, stats: Stats): TransformResult {
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
