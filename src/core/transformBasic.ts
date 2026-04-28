import { decideBasicContext, getBasicSeedDirection } from "./context";
import { makeChangeEvent, makeSkipEvent } from "./model";
import { splitLineSegments } from "./segments";
import {
  detectBasicRunKind,
  isBasicRunFinalValid,
  isBasicRunProgressValid,
  type BasicRunKind,
} from "./rules";
import type { ChangeEvent, SkipEvent, TransformResult, Stats } from "./types";
import { inc } from "./types";

const BASIC_MAP: Record<string, string> = {
  ",": "，",
  ":": "：",
  ";": "；",
  "?": "？",
  "!": "！",
  ".": "。",
};

type RunEval =
  | { ok: true; tip: string }
  | { ok: false; reason: string; kind: "negative" | "uncertain"; key: SkipEvent["key"] };

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

function buildLtrFragment(compact: string, step: number): string {
  return compact.slice(0, step);
}

function buildRtlResultFragment(kind: BasicRunKind, compact: string, step: number): string {
  if (kind === "single") {
    const ch = compact[compact.length - 1];
    return ch === "?" ? "？" : ch === "!" ? "！" : ch === "." ? "。" : ch;
  }

  if (kind === "emphasis") {
    const suffix = compact.slice(compact.length - step);
    let out = "";
    for (const ch of suffix) {
      out += ch === "?" ? "？" : "！";
    }
    return out;
  }

  if (kind === "dash") {
    return "—".repeat(Math.min(2, step));
  }

  if (kind === "dot_family") {
    const firstTail = compact.search(/[?!]/);

    if (firstTail < 0) {
      if (compact === ".") return "。";
      return "……";
    }

    const tails = compact.slice(firstTail);
    const takeTail = Math.min(step, tails.length);
    const tailPart = tails.slice(tails.length - takeTail);

    let out = "";
    for (const ch of tailPart) {
      out += ch === "?" ? "？" : "！";
    }

    if (step > tails.length) {
      out = "……" + out;
    }

    return out || "……";
  }

  return compact.slice(Math.max(0, compact.length - step));
}

function isRtlResultFragmentValid(kind: BasicRunKind, fragment: string): boolean {
  if (!fragment) return false;

  if (kind === "single") return /^[，：；。？！]$/.test(fragment);
  if (kind === "emphasis") return /^[？！]+$/.test(fragment);
  if (kind === "dash") return /^—{1,2}$/.test(fragment);

  if (kind === "dot_family") {
    if (fragment === "。") return true;
    if (fragment === "……") return true;
    if (/^[？！]+$/.test(fragment)) return true;
    if (/^……[？！]+$/.test(fragment)) return true;
    return false;
  }

  return false;
}

function getRunTip(kind: BasicRunKind, compact: string): string {
  if (kind === "single") return compact === "." ? "句号修正" : "基础标点符号修正";
  if (kind === "dash") return "破折号修正";
  if (kind === "emphasis") return "连续问叹符号修正";
  if (kind === "dot_family") {
    return compact.includes("?") || compact.includes("!") ? "省略号与问叹符号修正" : compact === "." ? "句号修正" : "省略号修正";
  }
  return "基础标点符号修正";
}

function evaluateRun(line: string, start: number, end: number, compact: string, kind: BasicRunKind): RunEval {
  if (kind === "invalid") {
    return {
      ok: false,
      kind: "uncertain",
      key: "basic_invalid_norm",
      reason: "跳过：不符合中文标点符号用法规范",
    };
  }

  const contextDecision = decideBasicContext(line, start, end);
  const direction = getBasicSeedDirection(line, start, end);

  if (contextDecision === "negative" || direction === "none") {
    return {
      ok: false,
      kind: "negative",
      key: "basic_non_chinese",
      reason: "跳过：非中文标点符号",
    };
  }

  if (contextDecision === "unknown") {
    return {
      ok: false,
      kind: "uncertain",
      key: "basic_context_unknown",
      reason: "跳过：无法判定中文语境",
    };
  }

  for (let step = 1; step <= compact.length; step++) {
    if (direction === "ltr") {
      const fragment = buildLtrFragment(compact, step);
      if (!isBasicRunProgressValid(kind, fragment)) {
        return {
          ok: false,
          kind: "uncertain",
          key: "basic_invalid_norm",
          reason: "跳过：不符合中文标点符号用法规范",
        };
      }
    } else {
      const fragment = buildRtlResultFragment(kind, compact, step);
      if (!isRtlResultFragmentValid(kind, fragment)) {
        return {
          ok: false,
          kind: "uncertain",
          key: "basic_invalid_norm",
          reason: "跳过：不符合中文标点符号用法规范",
        };
      }
    }
  }

  if (!isBasicRunFinalValid(kind, compact)) {
    return {
      ok: false,
      kind: "uncertain",
      key: "basic_invalid_norm",
      reason: "跳过：不符合中文标点符号用法规范",
    };
  }

  return { ok: true, tip: getRunTip(kind, compact) };
}

function convertRun(compact: string, kind: BasicRunKind, stats: Stats): string {
  if (kind === "single") {
    const mapped = BASIC_MAP[compact] ?? compact;
    if (mapped !== compact && BASIC_MAP[compact]) inc(stats, `${compact}->${mapped}`, 1);
    return mapped;
  }

  if (kind === "dash") {
    inc(stats, "dash", 1);
    return "——";
  }

  if (kind === "emphasis") {
    let out = "";
    if (/!{3,}/.test(compact)) inc(stats, "exclaim_runs", 1);
    if (/\?{3,}/.test(compact)) inc(stats, "question_runs", 1);
    if (compact.includes("?!")) inc(stats, "?!", 1);
    if (compact.includes("!?")) inc(stats, "!?", 1);

    for (const ch of compact) {
      out += ch === "?" ? "？" : "！";
      if (ch === "?") inc(stats, "?->？", 1);
      if (ch === "!") inc(stats, "!->！", 1);
    }
    return out;
  }

  if (kind === "dot_family") {
    if (compact === ".") {
      inc(stats, ".->。", 1);
      return "。";
    }

    const firstTail = compact.search(/[?!]/);
    if (firstTail < 0) {
      inc(stats, "ellipsis", 1);
      return "……";
    }

    const tails = compact.slice(firstTail);
    let out = "……";
    inc(stats, "ellipsis", 1);

    for (const ch of tails) {
      out += ch === "?" ? "？" : "！";
      if (ch === "?") inc(stats, "?->？", 1);
      if (ch === "!") inc(stats, "!->！", 1);
    }

    if (/!{3,}/.test(tails)) inc(stats, "exclaim_runs", 1);
    if (/\?{3,}/.test(tails)) inc(stats, "question_runs", 1);
    if (tails.includes("?!")) inc(stats, "?!", 1);
    if (tails.includes("!?")) inc(stats, "!?", 1);

    return out;
  }

  return compact;
}

function trimConvertedRunOuterSpaces(raw: string, converted: string, start: number): string {
  let leftDrop = 0;
  while (leftDrop < raw.length && /[ \t]/.test(raw[leftDrop])) {
    leftDrop += 1;
  }

  const isLineIndent = start === 0 && leftDrop > 0;
  if (isLineIndent) leftDrop = 0;

  return converted;
}

function transformLine(line: string, lineBase: number, stats: Stats): TransformResult {
  const segments = splitLineSegments(line);
  const out: string[] = [];
  const changes: ChangeEvent[] = [];
  const skips: SkipEvent[] = [];
  let cursor = 0;

  for (const seg of segments) {
    if (seg.kind !== "punct") {
      out.push(seg.text);
      cursor += seg.text.length;
      continue;
    }

    const kind = detectBasicRunKind(seg.compact, seg.text !== seg.compact);
    const decision = evaluateRun(line, seg.start, seg.end, seg.compact, kind);

    if (decision.ok) {
      const converted = trimConvertedRunOuterSpaces(seg.text, convertRun(seg.compact, kind, stats), seg.start);
      const targetStart = cursor;
      out.push(converted);
      cursor += converted.length;
      changes.push(
        makeChangeEvent(
          lineBase + seg.start,
          lineBase + seg.end,
          lineBase + targetStart,
          lineBase + targetStart + converted.length,
          decision.tip,
        ),
      );
    } else {
      const targetStart = cursor;
      out.push(seg.text);
      cursor += seg.text.length;
      skips.push(
        makeSkipEvent(
          lineBase + targetStart,
          lineBase + targetStart + seg.text.length,
          decision.reason,
          decision.kind,
          decision.key,
        ),
      );
    }
  }

  return {
    text: out.join(""),
    changes,
    skips,
  };
}

export function transformBasic(text: string, stats: Stats): TransformResult {
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
