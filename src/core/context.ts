const RE_HAN = /[\u4e00-\u9fff]/;
const RE_JP_KANA = /[\u3040-\u30ff]/;
const RE_KR_HANGUL = /[\uac00-\ud7af]/;
const RE_WS = /\s/;

const CN_CONTEXT_CHARS = new Set<string>([
  ..."，。；：？！、",
  ..."“”‘’「」『』《》〈〉",
  ..."（）【】〔〕〖〗［］｛｝",
  ..."—…",
  ..."＂＇，．：；？！（）［］｛｝"
]);

const MD_NOISE_CHARS = new Set<string>([..."*_~"]);
const TRANSPARENT_CHARS = new Set<string>([..."'\"`", ...MD_NOISE_CHARS]);
const MAX_CONTEXT_LOOK = 24;

export function isCjkLetter(ch: string): boolean {
  if (!ch) return false;
  return RE_HAN.test(ch) || RE_JP_KANA.test(ch) || RE_KR_HANGUL.test(ch);
}

export function isCnContextChar(ch: string): boolean {
  return !!ch && CN_CONTEXT_CHARS.has(ch);
}

export function isSemanticCjk(ch: string): boolean {
  return isCjkLetter(ch) || isCnContextChar(ch);
}

export function isFormatNoise(ch: string): boolean {
  return !!ch && (TRANSPARENT_CHARS.has(ch) || RE_WS.test(ch));
}

function scanSemanticNeighbor(
  text: string,
  start: number,
  direction: 1 | -1,
  maxSteps = MAX_CONTEXT_LOOK,
): string | null {
  let i = start + direction;
  let steps = 0;

  while (i >= 0 && i < text.length && steps < maxSteps) {
    const ch = text[i];
    if (isSemanticCjk(ch)) return ch;
    if (!isFormatNoise(ch)) return null;

    i += direction;
    steps += 1;
  }

  return null;
}

/**
 * Only convert when there is nearby Chinese-like semantic context.
 */
export function shouldConvertAt(text: string, idx: number): boolean {
  return (
    scanSemanticNeighbor(text, idx, -1) !== null ||
    scanSemanticNeighbor(text, idx, +1) !== null
  );
}
