const RE_HAN = /[\u4e00-\u9fff]/;
const RE_JP_KANA = /[\u3040-\u30ff]/; // Hiragana + Katakana
const RE_KR_HANGUL = /[\uac00-\ud7af]/; // Hangul syllables

const CN_CONTEXT_CHARS = new Set<string>([
  ..."，。；：？！、",
  ..."“”‘’「」『』《》〈〉",
  ..."（）【】〔〕〖〗［］｛｝",
  ..."—…",
  ..."＂＇，．：；？！（）［］｛｝"
]);

const RE_WS = /\s/;
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
  if (!ch) return false;
  return TRANSPARENT_CHARS.has(ch) || RE_WS.test(ch);
}

function scanSemanticNeighbor(text: string, start: number, direction: 1 | -1, maxSteps = MAX_CONTEXT_LOOK): string | null {
  const n = text.length;
  let steps = 0;
  let i = start + direction;

  while (i >= 0 && i < n && steps < maxSteps) {
    const ch = text[i];
    if (isSemanticCjk(ch)) return ch;
    if (isFormatNoise(ch)) {
      i += direction;
      steps += 1;
      continue;
    }
    break;
  }
  return null;
}

/**
 * Core gate: only convert when there is Chinese(-like) semantic neighbor around idx.
 * Mirrors your Python _should_convert_at.
 */
export function shouldConvertAt(text: string, idx: number): boolean {
  const left = scanSemanticNeighbor(text, idx, -1);
  if (left !== null) return true;
  const right = scanSemanticNeighbor(text, idx, +1);
  if (right !== null) return true;
  return false;
}
