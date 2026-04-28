import { isAsciiLetterOrDigit } from "./context";
import { makeChangeEvent } from "./model";
import type { ChangeEvent, TransformResult, Stats } from "./types";
import { inc } from "./types";

type BoldPairFix = { start: number; end: number; replacement: string };

const RE_LINE_WITH_END = /.*(?:\r?\n|$)/g;

function isHanChar(ch: string): boolean {
  return !!ch && /[\u4e00-\u9fff]/.test(ch);
}

function isWordLikeForBold(ch: string): boolean {
  return isAsciiLetterOrDigit(ch) || isHanChar(ch);
}

function isNonWordLikeForBold(ch: string): boolean {
  if (!ch) return true;
  return !isWordLikeForBold(ch);
}

function trimBoldInner(inner: string, stats: Stats): string {
  let out = inner;

  const leftTrimmed = out.replace(/^[ \t]+/, "");
  if (leftTrimmed !== out) {
    out = leftTrimmed;
    inc(stats, "md_bold_symbol_fix", 1);
  }

  const rightTrimmed = out.replace(/[ \t]+$/, "");
  if (rightTrimmed !== out) {
    out = rightTrimmed;
    inc(stats, "md_bold_symbol_fix", 1);
  }

  return out;
}

function normalizeBoldInner(
  leftOuter: string,
  inner: string,
  rightOuter: string,
  stats: Stats,
): string {
  const trimmed = trimBoldInner(inner, stats);
  const firstInner = trimmed[0] ?? "";
  const lastInner = trimmed[trimmed.length - 1] ?? "";

  const needLeftPad =
    !!firstInner &&
    isNonWordLikeForBold(firstInner) &&
    !isNonWordLikeForBold(leftOuter);

  const needRightPad =
    !!lastInner &&
    isNonWordLikeForBold(lastInner) &&
    !isNonWordLikeForBold(rightOuter);

  if (needLeftPad) inc(stats, "md_bold_symbol_fix", 1);
  if (needRightPad) inc(stats, "md_bold_symbol_fix", 1);

  return `${needLeftPad ? " " : ""}**${trimmed}**${needRightPad ? " " : ""}`;
}

function hasLineBreak(s: string): boolean {
  return s.includes("\n") || s.includes("\r");
}

function collectBoldPairFixesInLine(line: string, stats: Stats): BoldPairFix[] {
  const fixes: BoldPairFix[] = [];
  let i = 0;

  while (i < line.length - 1) {
    const open = line.indexOf("**", i);
    if (open < 0) break;

    const close = line.indexOf("**", open + 2);
    if (close < 0) break;

    const inner = line.slice(open + 2, close);
    if (inner.length === 0 || hasLineBreak(inner)) {
      i = open + 2;
      continue;
    }

    const leftOuter = open > 0 ? line[open - 1] : "";
    const rightOuter = close + 2 < line.length ? line[close + 2] : "";
    const replacement = normalizeBoldInner(leftOuter, inner, rightOuter, stats);

    if (replacement !== line.slice(open, close + 2)) {
      fixes.push({ start: open, end: close + 2, replacement });
    }

    i = close + 2;
  }

  return fixes;
}

function applyBoldPairFixes(line: string, fixes: BoldPairFix[]): string {
  if (!fixes.length) return line;

  const out: string[] = [];
  let last = 0;

  for (const fix of fixes) {
    out.push(line.slice(last, fix.start));
    out.push(fix.replacement);
    last = fix.end;
  }

  out.push(line.slice(last));
  return out.join("");
}

export function transformMarkdown(text: string, stats: Stats): TransformResult {
  if (!text || !text.includes("**")) {
    return { text, changes: [], skips: [] };
  }

  const lines = text.match(RE_LINE_WITH_END) ?? [text];
  const out: string[] = [];
  const changes: ChangeEvent[] = [];
  let pos = 0;

  for (const line of lines) {
    if (!line.includes("**")) {
      out.push(line);
      pos += line.length;
      continue;
    }

    const before = line;
    const fixes = collectBoldPairFixesInLine(line, stats);
    const after = applyBoldPairFixes(line, fixes);
    out.push(after);

    if (after !== before) {
      changes.push(
        makeChangeEvent(
          pos,
          pos + before.length,
          pos,
          pos + after.length,
          "Markdown 加粗符号修正",
        ),
      );
    }

    pos += before.length;
  }

  return {
    text: out.join(""),
    changes,
    skips: [],
  };
}
