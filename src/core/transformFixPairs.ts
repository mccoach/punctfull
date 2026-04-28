import { decideBasicContext } from "./context";
import { makeChangeEvent } from "./model";
import type { ChangeEvent, TransformResult, Stats } from "./types";
import { inc } from "./types";

const PAIR_FIX_RULES: Array<[string[], string[], string]> = [
  [["“", "\""], ["”", "\""], "double"],
  [["‘", "'"], ["’", "'"], "single"],
  [["（", "("], ["）", ")"], "paren"],
];

const CONNECTOR_RE = /^[ \t]*[，。；：？！、]*[ \t]*$/;

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

function allPositionsForAny(hay: string, needles: string[]): Array<{ pos: number; ch: string }> {
  const out: Array<{ pos: number; ch: string }> = [];
  for (const needle of needles) {
    let idx = 0;
    while (true) {
      const i = hay.indexOf(needle, idx);
      if (i < 0) break;
      out.push({ pos: i, ch: needle });
      idx = i + needle.length;
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

function replaceAt(text: string, pos: number, ch: string): string {
  const chars = text.split("");
  chars[pos] = ch;
  return chars.join("");
}

function canUseChineseContext(line: string, checkPos: number): boolean {
  return decideBasicContext(line, checkPos, checkPos + 1) === "positive";
}

function isConnectorText(s: string): boolean {
  return CONNECTOR_RE.test(s);
}

function fixNearDuplicateSameDirection(
  line: string,
  lineBase: number,
  leftForms: string[],
  rightForms: string[],
  leftCanonical: string,
  rightCanonical: string,
  stats: Stats,
  changes: ChangeEvent[],
): string {
  let out = line;

  const leftPos = allPositionsForAny(out, leftForms);
  for (let i = 0; i + 1 < leftPos.length; i++) {
    const p1 = leftPos[i].pos;
    const p2 = leftPos[i + 1].pos;
    const between = out.slice(p1 + 1, p2);

    if (!isConnectorText(between)) continue;
    if (!canUseChineseContext(out, p1)) continue;

    const before = out;
    out = replaceAt(out, p2, rightCanonical);
    inc(stats, "fixed_pairs_near", 1);
    changes.push(makeChangeEvent(lineBase, lineBase + before.length, lineBase, lineBase + out.length, "成对符号纠错"));
    i += 1;
  }

  const rightPos = allPositionsForAny(out, rightForms);
  for (let i = 0; i + 1 < rightPos.length; i++) {
    const p1 = rightPos[i].pos;
    const p2 = rightPos[i + 1].pos;
    const between = out.slice(p1 + 1, p2);

    if (!isConnectorText(between)) continue;
    if (!canUseChineseContext(out, p1)) continue;

    const before = out;
    out = replaceAt(out, p1, leftCanonical);
    inc(stats, "fixed_pairs_near", 1);
    changes.push(makeChangeEvent(lineBase, lineBase + before.length, lineBase, lineBase + out.length, "成对符号纠错"));
    i += 1;
  }

  return out;
}

function fixTwoSameInLineByParagraphScope(
  line: string,
  lineBase: number,
  par: string,
  leftForms: string[],
  rightForms: string[],
  kind: string,
  leftCanonical: string,
  rightCanonical: string,
  stats: Stats,
  changes: ChangeEvent[],
): string {
  const leftScoped = allPositionsForAny(par, leftForms);
  const rightScoped = allPositionsForAny(par, rightForms);
  const total = leftScoped.length + rightScoped.length;

  if (total !== 2) return line;

  if (kind === "single") {
    for (let i = 1; i < line.length - 1; i++) {
      if ((line[i] === "'" || line[i] === "‘" || line[i] === "’") && /[A-Za-z]/.test(line[i - 1]) && /[A-Za-z]/.test(line[i + 1])) {
        return line;
      }
    }
  }

  if (leftScoped.length === 2 && rightScoped.length === 0) {
    const [p1, p2] = leftScoped.map((x) => x.pos);
    const distance = p2 - p1;
    if (distance < 1 || distance > 220) return line;
    if (!(p1 >= 0 && p2 < line.length)) return line;

    if (canUseChineseContext(line, p2)) {
      const before = line;
      const next = replaceAt(line, p2, rightCanonical);
      inc(stats, "fixed_pairs_two_same", 1);
      changes.push(makeChangeEvent(lineBase, lineBase + before.length, lineBase, lineBase + next.length, "成对符号纠错"));
      return next;
    }
  }

  if (rightScoped.length === 2 && leftScoped.length === 0) {
    const [p1, p2] = rightScoped.map((x) => x.pos);
    const distance = p2 - p1;
    if (distance < 1 || distance > 220) return line;
    if (!(p1 >= 0 && p2 < line.length)) return line;

    if (canUseChineseContext(line, p1)) {
      const before = line;
      const next = replaceAt(line, p1, leftCanonical);
      inc(stats, "fixed_pairs_two_same", 1);
      changes.push(makeChangeEvent(lineBase, lineBase + before.length, lineBase, lineBase + next.length, "成对符号纠错"));
      return next;
    }
  }

  return line;
}

function applyPairFixRuleInParagraph(
  par: string,
  paragraphBase: number,
  leftForms: string[],
  rightForms: string[],
  kind: string,
  stats: Stats,
  changes: ChangeEvent[],
): string {
  const lines = splitLinesKeepEnds(par);
  const out: string[] = [];

  const leftCanonical = leftForms[0];
  const rightCanonical = rightForms[0];

  for (const line of lines) {
    let cur = line.text;
    const lineBase = paragraphBase + line.start;

    cur = fixNearDuplicateSameDirection(
      cur,
      lineBase,
      leftForms,
      rightForms,
      leftCanonical,
      rightCanonical,
      stats,
      changes,
    );

    cur = fixTwoSameInLineByParagraphScope(
      cur,
      lineBase,
      cur,
      leftForms,
      rightForms,
      kind,
      leftCanonical,
      rightCanonical,
      stats,
      changes,
    );

    out.push(cur);
  }

  return out.join("");
}

export function transformFixPairs(text: string, stats: Stats): TransformResult {
  const parts = splitParagraphsByBlankLines(text);
  const out: string[] = [];
  const changes: ChangeEvent[] = [];

  for (const part of parts) {
    if (part.isSep) {
      out.push(part.text);
      continue;
    }

    let cur = part.text;
    for (const [leftForms, rightForms, kind] of PAIR_FIX_RULES) {
      cur = applyPairFixRuleInParagraph(cur, part.start, leftForms, rightForms, kind, stats, changes);
    }
    out.push(cur);
  }

  return {
    text: out.join(""),
    changes,
    skips: [],
  };
}
