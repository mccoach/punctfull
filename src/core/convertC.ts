import type { Options, Stats } from "./types";
import { inc } from "./types";
import { shouldConvertAt } from "./context";
import { TOKEN_RE_ANY } from "./tokens";
import { fixPairedSymbolsInParagraph } from "./fixPairs";

const BASIC_MAP: Record<string, string> = {
  ",": "，",
  ";": "；",
  "?": "？",
  "!": "！",
};

const RE_SPLIT_PAR = /(\n[ \t]*\n+)/;

export function convertC(text: string, options: Options, stats: Stats): string {
  const parts = splitParagraphsByBlankLines(text);
  const out: string[] = [];

  let outPos = 0;

  for (const part of parts) {
    if (RE_SPLIT_PAR.test(part)) {
      out.push(part);
      outPos += part.length;
      continue;
    }

    let par = part;

    if (options.convert_quotes) {
      const r = convertQuotesInParagraph(par, stats);
      par = r.text;
      for (const s of r.localSkips) {
        stats.skip_ranges_tok.push({
          start: outPos + s.start,
          end: outPos + s.end,
          reason: s.reason,
        });
      }
    }

    const br = convertAsciiBracketsOddFallback(par);
    for (const s of br.localSkips) {
      stats.skip_ranges_tok.push({
        start: outPos + s.start,
        end: outPos + s.end,
        reason: s.reason,
      });
    }

    if (options.convert_parens) {
      par = convertParensSemantic(par, stats);
    }

    if (options.fix_paired_symbols) {
      par = fixPairedSymbolsInParagraph(par, stats);
    }

    if (options.convert_emphasis_punct) par = convertEmphasisPunct(par, stats);
    if (options.convert_ellipsis) par = convertEllipsis(par, stats);
    if (options.convert_dash) par = convertDash(par, stats);
    if (options.convert_basic_punct) par = convertBasic(par, stats);

    if (options.fix_md_bold_symbols) {
      par = fixMarkdownBoldSymbols(par, stats);
    }

    out.push(par);
    outPos += par.length;
  }

  return out.join("");
}

function splitParagraphsByBlankLines(text: string): string[] {
  return text.split(RE_SPLIT_PAR);
}

/** ---------- Markdown bold symbol fix ---------- */

function isAsciiLetterOrDigit(ch: string): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

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

type BoldPair = {
  leftOuter: string;
  inner: string;
  rightOuter: string;
};

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

function normalizeBoldPair(pair: BoldPair, stats: Stats): string {
  const inner = trimBoldInner(pair.inner, stats);
  const firstInner = inner[0] ?? "";
  const lastInner = inner[inner.length - 1] ?? "";

  let leftPad = "";
  let rightPad = "";

  if (firstInner && isNonWordLikeForBold(firstInner) && !isNonWordLikeForBold(pair.leftOuter)) {
    leftPad = " ";
    inc(stats, "md_bold_symbol_fix", 1);
  }

  if (lastInner && isNonWordLikeForBold(lastInner) && !isNonWordLikeForBold(pair.rightOuter)) {
    rightPad = " ";
    inc(stats, "md_bold_symbol_fix", 1);
  }

  return leftPad + "**" + inner + "**" + rightPad;
}

function fixMarkdownBoldSymbols(par: string, stats: Stats): string {
  if (!par || !par.includes("**")) return par;

  const out: string[] = [];
  let i = 0;

  while (i < par.length) {
    const open = par.indexOf("**", i);
    if (open < 0) {
      out.push(par.slice(i));
      break;
    }

    out.push(par.slice(i, open));

    const close = par.indexOf("**", open + 2);
    if (close < 0) {
      out.push(par.slice(open));
      break;
    }

    const pair: BoldPair = {
      leftOuter: open > 0 ? par[open - 1] : "",
      inner: par.slice(open + 2, close),
      rightOuter: close + 2 < par.length ? par[close + 2] : "",
    };

    out.push(normalizeBoldPair(pair, stats));
    i = close + 2;
  }

  return out.join("");
}

/** ---------- Parens semantic ---------- */

function looksTechnicalParenContent(s: string): boolean {
  if (!s) return false;
  if (s.includes("⟦") || s.includes("⟧")) return true;

  const techMarks = /[_=<>/*\\]|::|->|=>|\bHTTP\b|\bHTTPS\b|\bx64\b|\bAPI\b/;
  if (techMarks.test(s)) return true;

  let ascii = 0;
  for (const ch of s) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
  }
  if (ascii / Math.max(1, s.length) > 0.75 && /[A-Za-z0-9]/.test(s)) {
    return true;
  }

  return false;
}

function looksChineseExplanatory(s: string): boolean {
  if (!s) return false;

  let zh = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) zh += 1;
  }

  if (zh === 0) return false;
  return zh / Math.max(1, s.length) >= 0.35 && s.length <= 30;
}

function convertParensSemantic(text: string, stats: Stats): string {
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "(") {
      out.push(text[i]);
      i += 1;
      continue;
    }

    if (!shouldConvertAt(text, i)) {
      out.push(text[i]);
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < text.length && text[j] !== ")" && text[j] !== "\n") {
      if (text[j] === "⟦") break;
      j += 1;
    }

    if (j < text.length && text[j] === ")") {
      const inside = text.slice(i + 1, j);
      if (looksTechnicalParenContent(inside)) {
        out.push(text.slice(i, j + 1));
      } else if (looksChineseExplanatory(inside)) {
        out.push("（" + inside + "）");
        inc(stats, "parens_converted", 1);
      } else {
        out.push(text.slice(i, j + 1));
      }
      i = j + 1;
      continue;
    }

    out.push(text[i]);
    i += 1;
  }

  return out.join("");
}

/** ---------- Token split helper ---------- */

type SegPart = { kind: "text"; s: string } | { kind: "token"; s: string };
type LocalSkip = { start: number; end: number; reason: string };

function splitByTokens(par: string): SegPart[] {
  const parts: SegPart[] = [];
  let last = 0;

  TOKEN_RE_ANY.lastIndex = 0;
  for (const m of par.matchAll(TOKEN_RE_ANY)) {
    const s = m.index ?? 0;
    const tok = m[0];
    const e = s + tok.length;

    if (s > last) parts.push({ kind: "text", s: par.slice(last, s) });
    parts.push({ kind: "token", s: tok });
    last = e;
  }

  if (last < par.length) parts.push({ kind: "text", s: par.slice(last) });
  return parts;
}

function collectPositions(
  seg: string,
  ch: string,
  gate: (pos: number) => boolean,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === ch && gate(i)) out.push(i);
  }
  return out;
}

/** ---------- Quotes conversion with odd fallback ---------- */

function collectDoubleQuoteCandidates(seg: string, gate: (pos: number) => boolean): number[] {
  return collectPositions(seg, `"`, gate);
}

function collectApostrophePositions(seg: string): Set<number> {
  const apost = new Set<number>();

  for (let i = 0; i < seg.length - 2; i++) {
    const a = seg[i];
    const b = seg[i + 1];
    const c = seg[i + 2];

    if (/[A-Za-z]/.test(a) && b === "'" && /[A-Za-z]/.test(c)) {
      apost.add(i + 1);
    }
  }

  return apost;
}

function collectSingleQuoteCandidates(seg: string, gate: (pos: number) => boolean): number[] {
  const apost = collectApostrophePositions(seg);
  const candidates: number[] = [];

  for (let p = 0; p < seg.length; p++) {
    if (seg[p] !== "'") continue;
    if (apost.has(p)) continue;
    if (!gate(p)) continue;
    candidates.push(p);
  }

  return candidates;
}

function markOddFallback(
  positions: number[],
  segStart: number,
  reason: string,
  localSkips: LocalSkip[],
): Set<number> {
  if (!positions.length || positions.length % 2 === 0) return new Set<number>();

  const skipped = new Set<number>(positions);
  for (const p of positions) {
    localSkips.push({
      start: segStart + p,
      end: segStart + p + 1,
      reason,
    });
  }

  return skipped;
}

function applyAlternatingQuotes(
  chars: string[],
  positions: number[],
  leftQuote: string,
  rightQuote: string,
  stats: Stats,
  statKey: string,
) {
  let left = true;
  for (const p of positions) {
    chars[p] = left ? leftQuote : rightQuote;
    inc(stats, statKey, 1);
    left = !left;
  }
}

function convertQuotesInParagraph(
  par: string,
  stats: Stats,
): { text: string; localSkips: LocalSkip[] } {
  const parts = splitByTokens(par);
  const localSkips: LocalSkip[] = [];

  function convertSegment(seg: string, segStart: number): string {
    const gate = (pos: number) => shouldConvertAt(seg, pos);

    const dqPos = collectDoubleQuoteCandidates(seg, gate);
    const dqSkip = markOddFallback(
      dqPos,
      segStart,
      "奇数回退：双引号不成对，跳过该符号",
      localSkips,
    );
    if (dqPos.length && dqSkip.size > 0) {
      stats.skipped_quote_paragraphs_double += 1;
    }

    const sqPos = collectSingleQuoteCandidates(seg, gate);
    const sqSkip = markOddFallback(
      sqPos,
      segStart,
      "奇数回退：单引号不成对，跳过该符号",
      localSkips,
    );
    if (sqPos.length && sqSkip.size > 0) {
      stats.skipped_quote_paragraphs_single += 1;
    }

    const chars = seg.split("");

    if (dqPos.length && dqSkip.size === 0) {
      applyAlternatingQuotes(chars, dqPos, "“", "”", stats, "double_quotes");
    }

    if (sqPos.length && sqSkip.size === 0) {
      applyAlternatingQuotes(chars, sqPos, "‘", "’", stats, "single_quotes");
    }

    return chars.join("");
  }

  const out: string[] = [];
  let cur = 0;

  for (const p of parts) {
    if (p.kind === "token") {
      out.push(p.s);
      cur += p.s.length;
    } else {
      out.push(convertSegment(p.s, cur));
      cur += p.s.length;
    }
  }

  return { text: out.join(""), localSkips };
}

/** ---------- ASCII brackets odd fallback (mark only) ---------- */

function convertAsciiBracketsOddFallback(par: string): {
  localSkips: LocalSkip[];
} {
  const parts = splitByTokens(par);
  const localSkips: LocalSkip[] = [];

  const pairs: Array<[string, string, string]> = [
    ["(", ")", "奇数回退：圆括号不成对，跳过该符号"],
    ["[", "]", "奇数回退：方括号不成对，跳过该符号"],
    ["{", "}", "奇数回退：花括号不成对，跳过该符号"],
  ];

  function scanSeg(seg: string, segStart: number) {
    const gate = (pos: number) => shouldConvertAt(seg, pos);

    for (const [left, right, reason] of pairs) {
      const cands: number[] = [];
      cands.push(...collectPositions(seg, left, gate));
      cands.push(...collectPositions(seg, right, gate));
      cands.sort((a, b) => a - b);

      if (cands.length && cands.length % 2 === 1) {
        for (const p of cands) {
          localSkips.push({
            start: segStart + p,
            end: segStart + p + 1,
            reason,
          });
        }
      }
    }
  }

  let cur = 0;
  for (const p of parts) {
    if (p.kind === "token") {
      cur += p.s.length;
    } else {
      scanSeg(p.s, cur);
      cur += p.s.length;
    }
  }

  return { localSkips };
}

/** ---------- Ellipsis / emphasis / dash / basic punctuation ---------- */

function convertEllipsis(text: string, stats: Stats): string {
  const snap = text;
  return text.replace(/\.{3,}/g, (m, offset) => {
    if (!shouldConvertAt(snap, Number(offset))) return m;
    inc(stats, "ellipsis", 1);
    return "……";
  });
}

function convertEmphasisRun(run: string): string {
  let out = "";
  for (const ch of run) {
    out += ch === "!" ? "！" : ch === "?" ? "？" : ch;
  }
  return out;
}

function convertEmphasisPunct(text: string, stats: Stats): string {
  const snap = text;

  return text.replace(/[!?]{2,}/g, (m, offset) => {
    if (!shouldConvertAt(snap, Number(offset))) return m;

    const out = convertEmphasisRun(m);
    if (out === m) return m;

    if (/!{3,}/.test(m)) inc(stats, "exclaim_runs", 1);
    if (/\?{3,}/.test(m)) inc(stats, "question_runs", 1);
    if (m.includes("?!")) inc(stats, "?!", 1);
    if (m.includes("!?")) inc(stats, "!?", 1);

    return out;
  });
}

function convertDash(text: string, stats: Stats): string {
  return text.replace(/(?<!-)\-\-(?!-)/g, (m, offset) => {
    const idx = Number(offset);
    if (!shouldConvertAt(text, idx)) return m;

    const end = idx + m.length;
    if (end < text.length && /[A-Za-z0-9_]/.test(text[end])) return m;

    inc(stats, "dash", 1);
    return "——";
  });
}

function isDigit(ch: string): boolean {
  return !!ch && /[0-9]/.test(ch);
}

function isDotSentenceEndContext(text: string, idx: number): boolean {
  const next = idx + 1 < text.length ? text[idx + 1] : "";
  return next === "" || /\s/.test(next) || /[)\]}”’>]/.test(next);
}

function isStructuralAsciiDot(text: string, idx: number): boolean {
  const prev = idx - 1 >= 0 ? text[idx - 1] : "";
  const next = idx + 1 < text.length ? text[idx + 1] : "";

  if (isDigit(prev) && (next === "" || /\s/.test(next))) return true;
  if (isDigit(prev) && isDigit(next)) return true;

  return false;
}

function convertBasic(text: string, stats: Stats): string {
  for (const [k, v] of Object.entries(BASIC_MAP)) {
    const snap = text;
    text = replaceChar(text, k, (idx) => {
      if (!shouldConvertAt(snap, idx)) return null;
      inc(stats, `${k}->${v}`, 1);
      return v;
    });
  }

  {
    const snap = text;
    text = text.replace(/:(?![A-Za-z0-9_+\-]+:)/g, (m, offset) => {
      const idx = Number(offset);
      if (!shouldConvertAt(snap, idx)) return m;
      inc(stats, ":->：", 1);
      return "：";
    });
  }

  {
    const snap = text;
    text = replaceChar(text, ".", (idx) => {
      if (!isDotSentenceEndContext(snap, idx)) return null;
      if (isStructuralAsciiDot(snap, idx)) return null;
      if (!shouldConvertAt(snap, idx)) return null;
      inc(stats, ".->。", 1);
      return "。";
    });
  }

  return text;
}

function replaceChar(
  text: string,
  target: string,
  repl: (idx: number) => string | null,
): string {
  const out: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === target) {
      const r = repl(i);
      out.push(r === null ? ch : r);
    } else {
      out.push(ch);
    }
  }

  return out.join("");
}
