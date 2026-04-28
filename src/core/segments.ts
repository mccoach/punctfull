import { detectBasicRunKind, isBasicAsciiCandidateChar } from "./rules";

export type Segment =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "punct"; text: string; compact: string; start: number; end: number; runKind: ReturnType<typeof detectBasicRunKind> }
  | { kind: "syntax"; text: string; start: number; end: number };

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function isSyntaxMarkerAt(text: string, idx: number): number {
  if (text.startsWith("**", idx)) return 2;
  return 0;
}

export function splitLineSegments(line: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;

  while (i < line.length) {
    const syntaxLen = isSyntaxMarkerAt(line, i);
    if (syntaxLen > 0) {
      out.push({
        kind: "syntax",
        text: line.slice(i, i + syntaxLen),
        start: i,
        end: i + syntaxLen,
      });
      i += syntaxLen;
      continue;
    }

    if (isBasicAsciiCandidateChar(line[i])) {
      const start = i;
      let end = i;
      let compact = "";
      let hasSpace = false;

      while (end < line.length) {
        const innerSyntaxLen = isSyntaxMarkerAt(line, end);
        if (innerSyntaxLen > 0) break;

        const ch = line[end];
        if (isBasicAsciiCandidateChar(ch)) {
          compact += ch;
          end += 1;
          continue;
        }

        if (isWhitespace(ch)) {
          hasSpace = true;
          end += 1;
          continue;
        }

        break;
      }

      out.push({
        kind: "punct",
        text: line.slice(start, end),
        compact,
        start,
        end,
        runKind: detectBasicRunKind(compact, hasSpace),
      });
      i = end;
      continue;
    }

    const start = i;
    let end = i + 1;

    while (end < line.length) {
      const innerSyntaxLen = isSyntaxMarkerAt(line, end);
      if (innerSyntaxLen > 0) break;
      if (isBasicAsciiCandidateChar(line[end])) break;
      end += 1;
    }

    out.push({
      kind: "text",
      text: line.slice(start, end),
      start,
      end,
    });
    i = end;
  }

  return out;
}
