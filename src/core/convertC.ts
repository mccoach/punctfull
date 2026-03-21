import type { Options, Stats, SkipRange } from "./types";
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

    if (options.fix_md_bold_symbols) {
      par = fixMarkdownBoldSymbols(par, stats);
    }

    if (options.convert_emphasis_punct) par = convertEmphasisPunct(par, stats);
    if (options.convert_ellipsis) par = convertEllipsis(par, stats);
    if (options.convert_dash) par = convertDash(par, stats);

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

    // odd fallback mark for ASCII brackets () [] {}
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

    if (options.convert_basic_punct) {
      par = convertBasic(par, stats);
    }

    if (options.fix_paired_symbols) {
      par = fixPairedSymbolsInParagraph(par, stats);
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

function isWordLikeForBoldLeft(ch: string): boolean {
  return isAsciiLetterOrDigit(ch) || isHanChar(ch);
}

function isWhitespace(ch: string): boolean {
  return !!ch && /\s/.test(ch);
}

function isSymbolLike(ch: string): boolean {
  if (!ch) return false;
  if (isWhitespace(ch)) return false;
  if (isAsciiLetterOrDigit(ch)) return false;
  if (isHanChar(ch)) return false;
  return true;
}

function fixMarkdownBoldSymbols(par: string, stats: Stats): string {
  if (!par || !par.includes("**")) return par;

  const out: string[] = [];
  let i = 0;
  const n = par.length;

  while (i < n) {
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

    const leftNeighbor = open - 1 >= 0 ? par[open - 1] : "";
    let inner = par.slice(open + 2, close);

    let fixedThisPair = false;

    const trimmedLeft = inner.replace(/^[ \t]+/, "");
    if (trimmedLeft !== inner) {
      inner = trimmedLeft;
      fixedThisPair = true;
      inc(stats, "md_bold_symbol_fix", 1);
    }

    const trimmedRight = inner.replace(/[ \t]+$/, "");
    if (trimmedRight !== inner) {
      inner = trimmedRight;
      fixedThisPair = true;
      inc(stats, "md_bold_symbol_fix", 1);
    }

    let prefix = "";
    const firstInner = inner[0] ?? "";

    if (
      leftNeighbor &&
      !isWhitespace(leftNeighbor) &&
      isWordLikeForBoldLeft(leftNeighbor) &&
      firstInner &&
      isSymbolLike(firstInner)
    ) {
      prefix = " ";
      fixedThisPair = true;
      inc(stats, "md_bold_symbol_fix", 1);
    }

    out.push(prefix + "**" + inner + "**");

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
  for (const ch of s) if (ch.charCodeAt(0) < 128) ascii += 1;
  if (ascii / Math.max(1, s.length) > 0.75 && /[A-Za-z0-9]/.test(s))
    return true;

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

/**
 * Only convert (...) to （...） when Chinese-context gated and "short Chinese explanatory".
 */
function convertParensSemantic(text: string, stats: Stats): string {
  const out: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
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
    while (j < n && text[j] !== ")" && text[j] !== "\n") {
      if (text[j] === "⟦") break;
      j += 1;
    }

    if (j < n && text[j] === ")") {
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

type LocalSkip = { start: number; end: number; reason: string };

function convertQuotesInParagraph(
  par: string,
  stats: Stats,
): { text: string; localSkips: LocalSkip[] } {
  const parts = splitByTokens(par);
  const localSkips: LocalSkip[] = [];

  const QUOTE_BOUNDARY = new Set<string>([
    ..." \t\r\n",
    ..."([{<",
    ...")]}>",
    ..."，。；：？！、",
    ...',"-',
    ..."“”‘’",
  ]);

  function convertSegment(seg: string, segStart: number): string {
    const gate = (pos: number) => shouldConvertAt(seg, pos);

    const dqPos = collectPositions(seg, `"`, gate);
    let dqSkip = new Set<number>();
    if (dqPos.length && dqPos.length % 2 === 1) {
      stats.skipped_quote_paragraphs_double += 1;
      dqSkip = new Set(dqPos);
      for (const p of dqPos) {
        localSkips.push({
          start: segStart + p,
          end: segStart + p + 1,
          reason: "奇数回退：双引号不成对，跳过该符号",
        });
      }
    }

    // apostrophe in English word: [A-Za-z]('[A-Za-z])
    const apost = new Set<number>();
    for (let i = 0; i < seg.length - 2; i++) {
      const a = seg[i],
        b = seg[i + 1],
        c = seg[i + 2];
      if (/[A-Za-z]/.test(a) && b === "'" && /[A-Za-z]/.test(c))
        apost.add(i + 1);
    }

    const sqCandidates: number[] = [];
    for (let p = 0; p < seg.length; p++) {
      if (seg[p] !== "'") continue;
      if (apost.has(p)) continue;
      if (!gate(p)) continue;
      const prevc = p - 1 >= 0 ? seg[p - 1] : "";
      const nextc = p + 1 < seg.length ? seg[p + 1] : "";
      if (
        prevc === "" ||
        QUOTE_BOUNDARY.has(prevc) ||
        nextc === "" ||
        QUOTE_BOUNDARY.has(nextc)
      ) {
        sqCandidates.push(p);
      }
    }

    let sqSkip = new Set<number>();
    if (sqCandidates.length && sqCandidates.length % 2 === 1) {
      stats.skipped_quote_paragraphs_single += 1;
      sqSkip = new Set(sqCandidates);
      for (const p of sqCandidates) {
        localSkips.push({
          start: segStart + p,
          end: segStart + p + 1,
          reason: "奇数回退：单引号不成对，跳过该符号",
        });
      }
    }

    const chars = seg.split("");

    if (dqPos.length && dqSkip.size === 0) {
      let left = true;
      for (const p of dqPos) {
        chars[p] = left ? "“" : "”";
        inc(stats, "double_quotes", 1);
        left = !left;
      }
    }

    if (sqCandidates.length && sqSkip.size === 0) {
      let left = true;
      for (const p of sqCandidates) {
        chars[p] = left ? "‘" : "’";
        inc(stats, "single_quotes", 1);
        left = !left;
      }
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

function convertEmphasisPunct(text: string, stats: Stats): string {
  {
    const snap = text;
    text = text.replace(/!{3,}/g, (m, offset) => {
      if (!shouldConvertAt(snap, Number(offset))) return m;
      inc(stats, "exclaim_runs", 1);
      return "！".repeat(m.length);
    });
  }

  {
    const snap = text;
    text = text.replace(/\?{3,}/g, (m, offset) => {
      if (!shouldConvertAt(snap, Number(offset))) return m;
      inc(stats, "question_runs", 1);
      return "？".repeat(m.length);
    });
  }

  {
    const snap = text;
    text = text.replace(/(\?!|!\?)/g, (m, offset) => {
      if (!shouldConvertAt(snap, Number(offset))) return m;
      if (m === "?!") {
        inc(stats, "?!", 1);
        return "？！";
      }
      inc(stats, "!?", 1);
      return "！？";
    });
  }

  return text;
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

function convertBasic(text: string, stats: Stats): string {
  // 1) , ; ? !
  for (const [k, v] of Object.entries(BASIC_MAP)) {
    const snap = text;
    text = replaceChar(text, k, (idx) => {
      if (!shouldConvertAt(snap, idx)) return null;
      inc(stats, `${k}->${v}`, 1);
      return v;
    });
  }

  // 2) colon (avoid :tag:), gate on snapshot
  {
    const snap = text;
    text = text.replace(/:(?![A-Za-z0-9_+\-]+:)/g, (m, offset) => {
      const idx = Number(offset);
      if (!shouldConvertAt(snap, idx)) return m;
      inc(stats, ":->：", 1);
      return "：";
    });
  }

  // 3) ordered-list dot positions, computed on current text
  const olDot = new Set<number>();
  {
    const re = /(\d{1,9})(\.)[ \t]+/g;
    for (const mm of text.matchAll(re)) {
      const dotIdx = (mm.index ?? 0) + mm[1].length;
      olDot.add(dotIdx);
    }
  }

  // 4) dot to 。 at end-ish, gate on snapshot
  {
    const snap = text;
    text = text.replace(/\.(?=(\s|$|[)\]}”’>]))/g, (m, offset) => {
      const idx = Number(offset);
      if (olDot.has(idx)) return ".";
      if (!shouldConvertAt(snap, idx)) return ".";
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
