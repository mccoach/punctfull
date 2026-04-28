import {
  AMBIGUOUS_M,
  STRONG_NON_CN_N,
  isChineseSeedPunct,
  isInlineTransparentMarkerAt,
  type SideDecision,
} from "./rules";

export type PairCheckPointName = "left-left" | "left-right" | "right-left" | "right-right";

const RE_HAN = /[\u4e00-\u9fff]/;

function isWhitespace(ch: string): boolean {
  return !!ch && /\s/.test(ch);
}

export function isAsciiLetterOrDigit(ch: string): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

export function isChineseContextSeed(ch: string): boolean {
  if (!ch) return false;
  return RE_HAN.test(ch) || isChineseSeedPunct(ch);
}

export function isAmbiguousMappedChar(ch: string): boolean {
  return !!ch && AMBIGUOUS_M.has(ch);
}

export function isStrongNonChineseChar(ch: string): boolean {
  return !!ch && STRONG_NON_CN_N.has(ch);
}

export function getEffectiveCharLeft(text: string, idx: number): { ch: string; index: number } | null {
  let i = idx - 1;
  while (i >= 0) {
    const skip = isInlineTransparentMarkerAt(text, i - 1);
    if (skip === 2 && i - 1 >= 0) {
      i -= 2;
      continue;
    }

    if (isWhitespace(text[i])) {
      i -= 1;
      continue;
    }

    return { ch: text[i], index: i };
  }
  return null;
}

export function getEffectiveCharRight(text: string, idx: number): { ch: string; index: number } | null {
  let i = idx;
  while (i < text.length) {
    const skip = isInlineTransparentMarkerAt(text, i);
    if (skip > 0) {
      i += skip;
      continue;
    }

    if (isWhitespace(text[i])) {
      i += 1;
      continue;
    }

    return { ch: text[i], index: i };
  }
  return null;
}

export function decideByChar(ch: string, side: "left" | "right"): SideDecision {
  if (!ch) return "unknown";
  if (isChineseContextSeed(ch)) return "positive";
  if (isStrongNonChineseChar(ch)) return "negative";
  if (isAsciiLetterOrDigit(ch)) return side === "right" ? "negative" : "unknown";
  if (isAmbiguousMappedChar(ch)) return "unknown";
  return "unknown";
}

export function decideBasicContext(text: string, start: number, end: number): SideDecision {
  const left = getEffectiveCharLeft(text, start);
  const leftDecision = decideByChar(left?.ch ?? "", "left");
  if (leftDecision !== "unknown") return leftDecision;

  const right = getEffectiveCharRight(text, end);
  const rightDecision = decideByChar(right?.ch ?? "", "right");
  if (rightDecision !== "unknown") return rightDecision;

  return "unknown";
}

export function getBasicSeedDirection(text: string, start: number, end: number): "ltr" | "rtl" | "none" {
  const left = getEffectiveCharLeft(text, start);
  const leftDecision = decideByChar(left?.ch ?? "", "left");
  if (leftDecision === "positive") return "ltr";
  if (leftDecision === "negative") return "none";

  const right = getEffectiveCharRight(text, end);
  const rightDecision = decideByChar(right?.ch ?? "", "right");
  if (rightDecision === "positive") return "rtl";
  if (rightDecision === "negative") return "none";

  return "none";
}

export function decidePairContext(
  text: string,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): { decision: SideDecision; point: PairCheckPointName | "" } {
  const checks: Array<{ name: PairCheckPointName; ch: string; side: "left" | "right" }> = [
    { name: "left-left", ch: getEffectiveCharLeft(text, leftStart)?.ch ?? "", side: "left" },
    { name: "left-right", ch: getEffectiveCharRight(text, leftEnd)?.ch ?? "", side: "right" },
    { name: "right-left", ch: getEffectiveCharLeft(text, rightStart)?.ch ?? "", side: "left" },
    { name: "right-right", ch: getEffectiveCharRight(text, rightEnd)?.ch ?? "", side: "right" },
  ];

  for (const item of checks) {
    const d = decideByChar(item.ch, item.side);
    if (d !== "unknown") {
      return { decision: d, point: item.name };
    }
  }

  return { decision: "unknown", point: "" };
}
