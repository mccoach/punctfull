import type { Stats } from "./types";
import { TokenStore } from "./tokenStore";

/**
 * A-zone protection: YAML front matter / fenced code / inline code / math / HTML
 * Mirrors your Python behavior closely.
 */

const RE_FENCE_START = /^(?<indent>[ \t]*)(?<fence>`{3,}|~{3,})(?<info>.*)$/;
const RE_FENCE_END = /^(?<indent>[ \t]*)(?<fence>`{3,}|~{3,})[ \t]*$/;

export function protectA(text: string, stats: Stats): { text: string; store: TokenStore } {
  const store = new TokenStore("A");

  text = protectYamlFrontMatter(text, store, stats);
  text = protectFencedCodeBlocks(text, store, stats);
  text = protectInlineCode(text, store, stats);
  text = protectMath(text, store, stats);
  text = protectHtml(text, store, stats);

  return { text, store };
}

function protectYamlFrontMatter(text: string, store: TokenStore, stats: Stats): string {
  const m = text.match(/^(\ufeff)?([ \t]*\n)*/);
  const start = m ? m[0].length : 0;

  if (!/^[ \t]*---[ \t]*\n/.test(text.slice(start))) return text;

  const lines = splitLinesKeepEnds(text);
  const startLine = findLineIndexAtOrAfter(lines, start);
  if (startLine < 0) return text;
  if (!/^[ \t]*---[ \t]*\n?$/.test(lines[startLine])) return text;

  const endLine = findYamlFrontMatterEnd(lines, startLine);
  if (endLine < 0) return text;

  const block = lines.slice(startLine, endLine + 1).join("");
  const token = store.put(block);
  stats.protected_A_blocks += 1;

  return lines.slice(0, startLine).join("") + token + lines.slice(endLine + 1).join("");
}

function findLineIndexAtOrAfter(lines: string[], offset: number): number {
  let pos = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    if (pos >= offset) return idx;
    pos += lines[idx].length;
  }
  return -1;
}

function findYamlFrontMatterEnd(lines: string[], startLine: number): number {
  for (let j = startLine + 1; j < lines.length; j++) {
    if (/^[ \t]*(---|\.\.\.)[ \t]*\n?$/.test(lines[j])) {
      return j;
    }
  }
  return -1;
}

function protectFencedCodeBlocks(text: string, store: TokenStore, stats: Stats): string {
  const lines = splitLinesKeepEnds(text);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const start = parseFenceStart(lines[i]);
    if (!start) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const end = findFenceBlockEnd(lines, i + 1, start.fenceChar, start.fenceLen);
    const block = lines.slice(i, end).join("");
    out.push(store.put(block));
    stats.protected_A_blocks += 1;
    i = end;
  }

  return out.join("");
}

function parseFenceStart(line: string): { fenceChar: string; fenceLen: number } | null {
  const m = RE_FENCE_START.exec(line);
  if (!m) return null;

  const fence = m.groups?.fence ?? "";
  if (!fence) return null;

  return { fenceChar: fence[0], fenceLen: fence.length };
}

function findFenceBlockEnd(
  lines: string[],
  startIndex: number,
  fenceChar: string,
  fenceLen: number,
): number {
  let j = startIndex;

  while (j < lines.length) {
    const mEnd = RE_FENCE_END.exec(lines[j]);
    if (mEnd) {
      const f2 = mEnd.groups?.fence ?? "";
      if (f2 && f2[0] === fenceChar && f2.length >= fenceLen) {
        return j + 1;
      }
    }
    j += 1;
  }

  return j;
}

function protectInlineCode(text: string, store: TokenStore, stats: Stats): string {
  const out: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text[i] !== "`") {
      out.push(text[i]);
      i += 1;
      continue;
    }

    const tickLen = countRun(text, i, "`");
    const end = findMatchingTickRun(text, i + tickLen, tickLen);

    if (end < 0) {
      out.push(text[i]);
      i += 1;
      continue;
    }

    const frag = text.slice(i, end);
    out.push(store.put(frag));
    stats.protected_A_blocks += 1;
    i = end;
  }

  return out.join("");
}

function countRun(text: string, start: number, ch: string): number {
  let i = start;
  while (i < text.length && text[i] === ch) i += 1;
  return i - start;
}

function findMatchingTickRun(text: string, start: number, tickLen: number): number {
  let k = start;
  while (k < text.length) {
    if (text[k] !== "`") {
      k += 1;
      continue;
    }

    const runLen = countRun(text, k, "`");
    if (runLen === tickLen) return k + runLen;
    k += runLen;
  }
  return -1;
}

function protectMath(text: string, store: TokenStore, stats: Stats): string {
  text = text.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  const inlineRe = /\$(?!\s)([^\n$]*?)(?<!\s)\$/g;
  text = text.replace(inlineRe, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  return text;
}

function protectHtml(text: string, store: TokenStore, stats: Stats): string {
  text = text.replace(/<!--[\s\S]*?-->/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  text = text.replace(/<[^>\n]+?>/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  return text;
}

function splitLinesKeepEnds(s: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") {
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }

  if (start < s.length) out.push(s.slice(start));
  return out;
}
