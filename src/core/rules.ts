export type SideDecision = "positive" | "negative" | "unknown";
export type BasicRunKind = "single" | "dot_family" | "emphasis" | "dash" | "invalid";

export const STRONG_CN_SEEDS = new Set<string>([
  ..."，、。；：？！",
  ..."“”‘’",
  ..."（）",
  ..."《》【】「」『』〈〉〔〕〖〗",
  ..."……",
  ..."￥",
  ..."　",
]);

export const AMBIGUOUS_M = new Set<string>([...`.,;:?!-"'()`]);
export const STRONG_NON_CN_N = new Set<string>([..."=[]{}/\\|$#@^`~%*+"]);

export function isChineseSeedPunct(ch: string): boolean {
  return !!ch && STRONG_CN_SEEDS.has(ch);
}

export function isBasicPunctChar(ch: string): boolean {
  return !!ch && /[.,;:?!-，。；：？！…—]/.test(ch);
}

export function isBasicAsciiCandidateChar(ch: string): boolean {
  return !!ch && /[.,;:?!-]/.test(ch);
}

export function isInlineTransparentMarkerAt(text: string, idx: number): number {
  if (text.startsWith("**", idx)) return 2;
  return 0;
}

export function isWhitespace(ch: string): boolean {
  return !!ch && /[ \t]/.test(ch);
}

export function detectBasicRunKind(compact: string, hasSpace: boolean): BasicRunKind {
  if (/^\.+[?!]*$/.test(compact)) return "dot_family";
  if (/^[?!]+$/.test(compact)) return compact.length === 1 && !hasSpace ? "single" : "emphasis";
  if (/^-+$/.test(compact)) return "dash";
  if (/^[,:;]$/.test(compact) && !hasSpace) return "single";
  return "invalid";
}

function getPrevNonSpace(line: string, idx: number): string {
  let i = idx - 1;
  while (i >= 0) {
    const skip = isInlineTransparentMarkerAt(line, i - 1);
    if (skip === 2 && i - 1 >= 0) {
      i -= 2;
      continue;
    }

    if (!/\s/.test(line[i])) return line[i];
    i -= 1;
  }
  return "";
}

function getNextNonSpace(line: string, idx: number): string {
  let i = idx;
  while (i < line.length) {
    const skip = isInlineTransparentMarkerAt(line, i);
    if (skip > 0) {
      i += skip;
      continue;
    }

    if (!/\s/.test(line[i])) return line[i];
    i += 1;
  }
  return "";
}

function isHanChar(ch: string): boolean {
  return !!ch && /[\u4e00-\u9fff]/.test(ch);
}

function isChinesePunctChar(ch: string): boolean {
  return !!ch && STRONG_CN_SEEDS.has(ch);
}

function isAllowedQuoteNeighborChar(ch: string): boolean {
  return isHanChar(ch) || isChinesePunctChar(ch);
}

export function isQuoteWhitelistHit(
  line: string,
  leftPos: number,
  rightPos: number,
  _quoteChar: `"` | `'`,
): boolean {
  const beforeLeft = getPrevNonSpace(line, leftPos);
  const afterLeft = getNextNonSpace(line, leftPos + 1);
  const beforeRight = getPrevNonSpace(line, rightPos);
  const afterRight = getNextNonSpace(line, rightPos + 1);

  const leftAtLineStart = beforeLeft === "";
  const rightAtLineEnd = afterRight === "";

  const leftNeighborAllowed =
    leftAtLineStart ||
    isAllowedQuoteNeighborChar(beforeLeft) ||
    isAllowedQuoteNeighborChar(afterLeft);

  const rightNeighborAllowed =
    rightAtLineEnd ||
    isAllowedQuoteNeighborChar(beforeRight) ||
    isAllowedQuoteNeighborChar(afterRight);

  return leftNeighborAllowed || rightNeighborAllowed;
}

export function isParenWhitelistHit(line: string, leftPos: number, rightPos: number): boolean {
  const beforeLeft = getPrevNonSpace(line, leftPos);
  const afterRight = getNextNonSpace(line, rightPos + 1);

  const leftInner = leftPos + 1 < line.length ? line[leftPos + 1] : "";
  const rightInner = rightPos - 1 >= 0 ? line[rightPos - 1] : "";

  const hitW10 = /^(\.{3,}|……|[.!?。？！])$/.test(afterRight);
  const hitW11 = /^([,;:，；：])$/.test(afterRight);
  const localCnWrap =
    /[\u4e00-\u9fff]/.test(beforeLeft) ||
    /[\u4e00-\u9fff]/.test(leftInner) ||
    /[\u4e00-\u9fff]/.test(rightInner);

  return hitW10 || hitW11 || localCnWrap;
}

export function isBasicRunProgressValid(kind: BasicRunKind, fragment: string): boolean {
  if (!fragment) return false;

  if (kind === "single") {
    return /^[,:;?!.]$/.test(fragment);
  }

  if (kind === "dash") {
    return /^-+$/.test(fragment) && fragment.length <= 2;
  }

  if (kind === "emphasis") {
    return /^[?!]+$/.test(fragment);
  }

  if (kind === "dot_family") {
    if (!/^[.?!]+$/.test(fragment)) return false;

    const firstTail = fragment.search(/[?!]/);
    if (firstTail < 0) {
      return /^\.+$/.test(fragment);
    }

    const dots = fragment.slice(0, firstTail);
    const tails = fragment.slice(firstTail);

    if (!/^\.+$/.test(dots)) return false;
    if (dots.length < 3) return false;
    if (!/^[?!]+$/.test(tails)) return false;

    return true;
  }

  return false;
}

export function isBasicRunFinalValid(kind: BasicRunKind, compact: string): boolean {
  if (!isBasicRunProgressValid(kind, compact)) return false;

  if (kind === "single") {
    return /^[,:;?!.]$/.test(compact);
  }

  if (kind === "dash") {
    return compact === "--";
  }

  if (kind === "emphasis") {
    return /^[?!]{2,}$/.test(compact);
  }

  if (kind === "dot_family") {
    if (/^\.$/.test(compact)) return true;
    if (/^\.+$/.test(compact)) return compact.length >= 3;

    const firstTail = compact.search(/[?!]/);
    if (firstTail < 0) return false;

    const dots = compact.slice(0, firstTail);
    const tails = compact.slice(firstTail);
    return dots.length >= 3 && /^[?!]+$/.test(tails);
  }

  return false;
}
