import type { Stats } from "./types";
import { shouldConvertAt } from "./context";
import { escapeRegExp } from "./tokenStore";

const PAIR_FIX_RULES: Array<[string, string]> = [
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
  ["《", "》"],
  ["〈", "〉"],
  ["（", "）"],
  ["【", "】"],
  ["〔", "〕"],
  ["〖", "〗"],
  ["［", "］"],
  ["｛", "｝"]
];

function isFixParagraphTooTechnical(par: string): boolean {
  if (!par) return true;
  if (par.includes("⟦")) return true;

  const techMarks = /(<[^>\n]+?>|\\|::|->|=>|==|!=|>=|<=|\/\/|\/\*|\*\/|`|\bclass\b|\bdef\b|\breturn\b)/;
  if (techMarks.test(par)) return true;

  let ascii = 0;
  for (const ch of par) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
  }
  if (ascii / Math.max(1, par.length) > 0.8 && /[A-Za-z0-9]/.test(par)) {
    return true;
  }

  return false;
}

function allPositions(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;

  let idx = 0;
  while (true) {
    const i = hay.indexOf(needle, idx);
    if (i < 0) break;
    out.push(i);
    idx = i + needle.length;
  }

  return out;
}

function fixNearDuplicateSameDirection(par: string, left: string, right: string, stats: Stats): string {
  const connector = String.raw`[ \t]*[、，。；：？！]*[ \t]*`;
  const patLL = new RegExp(escapeRegExp(left) + connector + escapeRegExp(left), "g");
  const patRR = new RegExp(escapeRegExp(right) + connector + escapeRegExp(right), "g");

  const replLL = (m: string, offset: number) => {
    if (!shouldConvertAt(par, offset)) return m;
    stats.fixed_pairs_near += 1;
    const mid = m.slice(left.length, m.length - left.length);
    return left + mid + right;
  };

  const replRR = (m: string, offset: number) => {
    if (!shouldConvertAt(par, offset)) return m;
    stats.fixed_pairs_near += 1;
    const mid = m.slice(right.length, m.length - right.length);
    return left + mid + right;
  };

  let out = par.replace(patLL, replLL);
  out = out.replace(patRR, replRR);
  return out;
}

function canFixTwoSame(pos1: number, pos2: number, par: string, checkPos: number): boolean {
  return 1 <= (pos2 - pos1) && (pos2 - pos1) <= 220 && shouldConvertAt(par, checkPos);
}

function replaceAt(par: string, pos: number, ch: string): string {
  const chars = par.split("");
  chars[pos] = ch;
  return chars.join("");
}

function fixTwoSameInParagraph(par: string, left: string, right: string, stats: Stats): string {
  const posLeft = allPositions(par, left);
  const posRight = allPositions(par, right);
  const total = posLeft.length + posRight.length;
  if (total !== 2) return par;

  if (posLeft.length === 2 && posRight.length === 0) {
    const [p1, p2] = posLeft;
    if (canFixTwoSame(p1, p2, par, p2)) {
      stats.fixed_pairs_two_same += 1;
      return replaceAt(par, p2, right);
    }
  }

  if (posRight.length === 2 && posLeft.length === 0) {
    const [p1, p2] = posRight;
    if (canFixTwoSame(p1, p2, par, p1)) {
      stats.fixed_pairs_two_same += 1;
      return replaceAt(par, p1, left);
    }
  }

  return par;
}

function applyPairFixRule(par: string, left: string, right: string, stats: Stats): string {
  let out = par;
  out = fixNearDuplicateSameDirection(out, left, right, stats);
  out = fixTwoSameInParagraph(out, left, right, stats);
  return out;
}

export function fixPairedSymbolsInParagraph(par: string, stats: Stats): string {
  if (isFixParagraphTooTechnical(par)) {
    stats.skipped_fix_paragraphs += 1;
    return par;
  }

  let out = par;
  for (const [left, right] of PAIR_FIX_RULES) {
    out = applyPairFixRule(out, left, right, stats);
  }
  return out;
}
