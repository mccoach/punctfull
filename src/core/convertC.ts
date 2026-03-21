import type { Options, Stats } from "./types";
import { inc } from "./types";
import { shouldConvertAt } from "./context";
import { TOKEN_RE_ANY } from "./tokens";
import { fixPairedSymbolsInParagraph } from "./fixPairs";

const BASIC_MAP: Record<string, string> = {
  ",": "，",
  ";": "；",
  ":": "：",
  "?": "？",
  "!": "！",
};

const RE_SPLIT_PAR = /(\n[ \t]*\n+)/;
const RE_LINE_WITH_END = /.*(?:\r?\n|$)/g;

type LocalSkip = { start: number; end: number; reason: string };
type SegPart = { kind: "text"; s: string } | { kind: "token"; s: string };

type MdInlineSegment =
  | { kind: "text"; s: string }
  | { kind: "mdlink"; isImage: boolean; label: string; addr: string };

type ParsedMdLinkLike = {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  addrStart: number;
  addrEnd: number;
  isImage: boolean;
};

type BoldPairFix = {
  start: number;
  end: number;
  replacement: string;
};

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

    if (options.convert_emphasis_punct) par = convertByMdInlineSegments(par, stats, convertEmphasisPunctPlain);
    if (options.convert_ellipsis) par = convertByMdInlineSegments(par, stats, convertEllipsisPlain);
    if (options.convert_dash) par = convertByMdInlineSegments(par, stats, convertDashPlain);
    if (options.convert_basic_punct) par = convertByMdInlineSegments(par, stats, convertBasicPlain);

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

/** ---------- Markdown inline structure split ---------- */

function parseMdLinkLikeAt(text: string, start: number): ParsedMdLinkLike | null {
  let i = start;
  let isImage = false;

  if (text[i] === "!") {
    isImage = true;
    i += 1;
  }
  if (i >= text.length || text[i] !== "[") return null;

  const labelStart = i + 1;
  let j = labelStart;
  while (j < text.length) {
    if (text[j] === "\\" && j + 1 < text.length) {
      j += 2;
      continue;
    }
    if (text[j] === "]") break;
    j += 1;
  }
  if (j >= text.length || text[j] !== "]") return null;
  if (j + 1 >= text.length || text[j + 1] !== "(") return null;

  const labelEnd = j;
  const addrStart = j + 2;

  let k = addrStart;
  let depth = 1;
  while (k < text.length) {
    const ch = text[k];
    if (ch === "\\" && k + 1 < text.length) {
      k += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          start,
          end: k + 1,
          labelStart,
          labelEnd,
          addrStart,
          addrEnd: k,
          isImage,
        };
      }
    }
    k += 1;
  }

  return null;
}

function splitMdInlineSegments(text: string): MdInlineSegment[] {
  const out: MdInlineSegment[] = [];
  let i = 0;
  let last = 0;

  while (i < text.length) {
    if (text[i] !== "!" && text[i] !== "[") {
      i += 1;
      continue;
    }

    const parsed = parseMdLinkLikeAt(text, i);
    if (!parsed) {
      i += 1;
      continue;
    }

    if (parsed.start > last) {
      out.push({ kind: "text", s: text.slice(last, parsed.start) });
    }

    out.push({
      kind: "mdlink",
      isImage: parsed.isImage,
      label: text.slice(parsed.labelStart, parsed.labelEnd),
      addr: text.slice(parsed.addrStart, parsed.addrEnd),
    });

    i = parsed.end;
    last = parsed.end;
  }

  if (last < text.length) {
    out.push({ kind: "text", s: text.slice(last) });
  }

  return out;
}

function convertByMdInlineSegments(
  text: string,
  stats: Stats,
  convertPlain: (s: string, stats: Stats) => string,
): string {
  const segs = splitMdInlineSegments(text);
  const out: string[] = [];

  for (const seg of segs) {
    if (seg.kind === "text") {
      out.push(convertPlain(seg.s, stats));
      continue;
    }

    const label = convertPlain(seg.label, stats);
    if (seg.isImage) out.push(`![${label}](${seg.addr})`);
    else out.push(`[${label}](${seg.addr})`);
  }

  return out.join("");
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
      fixes.push({
        start: open,
        end: close + 2,
        replacement,
      });
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

function fixMarkdownBoldSymbols(par: string, stats: Stats): string {
  if (!par || !par.includes("**")) return par;

  const lines = par.match(RE_LINE_WITH_END) ?? [par];
  const out: string[] = [];

  for (const line of lines) {
    if (!line.includes("**")) {
      out.push(line);
      continue;
    }

    const fixes = collectBoldPairFixesInLine(line, stats);
    out.push(applyBoldPairFixes(line, fixes));
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

/** ---------- Quotes conversion with odd fallback ---------- */

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

function convertEllipsisPlain(text: string, stats: Stats): string {
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

function convertEmphasisPunctPlain(text: string, stats: Stats): string {
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

function convertDashPlain(text: string, stats: Stats): string {
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

function convertBasicPlain(text: string, stats: Stats): string {
  if (!text) return text;

  text = text.replace(/[,:;?!]+/g, (m, offset) => {
    const base = Number(offset);
    let out = "";

    for (let i = 0; i < m.length; i++) {
      const ch = m[i];
      const idx = base + i;
      const mapped = BASIC_MAP[ch];

      if (!mapped) {
        out += ch;
        continue;
      }

      if (!shouldConvertAt(text, idx)) {
        out += ch;
        continue;
      }

      inc(stats, `${ch}->${mapped}`, 1);
      out += mapped;
    }

    return out;
  });

  const snap = text;
  text = replaceChar(text, ".", (idx) => {
    if (!isDotSentenceEndContext(snap, idx)) return null;
    if (isStructuralAsciiDot(snap, idx)) return null;
    if (!shouldConvertAt(snap, idx)) return null;
    inc(stats, ".->。", 1);
    return "。";
  });

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
