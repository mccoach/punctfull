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

/**
 * 判定一个字符对中文语境的倾向性。
 * 规则：只要该字符本身能明确指示“是中文”或“不是中文”，就直接给出结论。
 * 汉字、中文标点种子 → positive
 * 强非中文符号（运算符等）、英文字母/数字 → negative
 * 其他无法判定的字符 → unknown
 */
export function decideByChar(ch: string): SideDecision {
  if (!ch) return "unknown";
  if (isChineseContextSeed(ch)) return "positive";
  if (isStrongNonChineseChar(ch)) return "negative";
  // 英文字母、数字直接认定为非中文语境
  if (isAsciiLetterOrDigit(ch)) return "negative";
  if (isAmbiguousMappedChar(ch)) return "unknown";
  return "unknown";
}

export function decideBasicContext(text: string, start: number, end: number): SideDecision {
  const left = getEffectiveCharLeft(text, start);
  const leftDecision = decideByChar(left?.ch ?? "");
  if (leftDecision !== "unknown") return leftDecision;

  const right = getEffectiveCharRight(text, end);
  const rightDecision = decideByChar(right?.ch ?? "");
  if (rightDecision !== "unknown") return rightDecision;

  return "unknown";
}

export function getBasicSeedDirection(text: string, start: number, end: number): "ltr" | "rtl" | "none" {
  const left = getEffectiveCharLeft(text, start);
  const leftDecision = decideByChar(left?.ch ?? "");
  if (leftDecision === "positive") return "ltr";
  if (leftDecision === "negative") return "none";

  const right = getEffectiveCharRight(text, end);
  const rightDecision = decideByChar(right?.ch ?? "");
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
  const checks: Array<{ name: PairCheckPointName; ch: string }> = [
    { name: "left-left", ch: getEffectiveCharLeft(text, leftStart)?.ch ?? "" },
    { name: "left-right", ch: getEffectiveCharRight(text, leftEnd)?.ch ?? "" },
    { name: "right-left", ch: getEffectiveCharLeft(text, rightStart)?.ch ?? "" },
    { name: "right-right", ch: getEffectiveCharRight(text, rightEnd)?.ch ?? "" },
  ];

  for (const item of checks) {
    const d = decideByChar(item.ch);
    if (d !== "unknown") {
      return { decision: d, point: item.name };
    }
  }

  return { decision: "unknown", point: "" };
}