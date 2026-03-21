import type { Stats } from "./types";
import { TokenStore } from "./tokenStore";

const RE_TABLE_SEP = /^[ \t]*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isTableRow(line: string): boolean {
  return (line.split("|").length - 1) >= 2;
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    i + 1 < lines.length &&
    isTableRow(lines[i]) &&
    RE_TABLE_SEP.test(lines[i + 1])
  );
}

function findTableEnd(lines: string[], start: number): number {
  let end = start + 2;
  while (end < lines.length && isTableRow(lines[end]) && lines[end].trim() !== "") {
    end += 1;
  }
  return end;
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

/**
 * Protect GitHub-flavored Markdown tables:
 *   header row (|...|...|)
 *   separator row (| --- | --- |)
 *   optional body rows
 *
 * We replace the whole table block with ONE token.
 */
export function protectTables(text: string, stats: Stats): { text: string; store: TokenStore } {
  const store = new TokenStore("T");
  const lines = splitLinesKeepEnds(text);

  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!isTableStart(lines, i)) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const end = findTableEnd(lines, i);
    const block = lines.slice(i, end).join("");
    out.push(store.put(block));
    stats.protected_table_blocks += 1;
    i = end;
  }

  return { text: out.join(""), store };
}
