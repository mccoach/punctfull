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
  let out = text;

  out = protectYamlFrontMatter(out, store, stats);
  out = protectFencedCodeBlocks(out, store, stats);
  out = protectInlineCode(out, store, stats);
  out = protectMath(out, store, stats);
  out = protectHtml(out, store, stats);

  return { text: out, store };
}

function protectYamlFrontMatter(text: string, store: TokenStore, stats: Stats): string {
  // Mimic Python:
  // m = re.match(r"(\ufeff)?([ \t]*\n)*", text)
  // start = m.end()
  // if not re.match(r"^[ \t]*---[ \t]*\n", text[start:]): return
  const m = text.match(/^(\ufeff)?([ \t]*\n)*/);
  const start = m ? m[0].length : 0;

  if (!/^[ \t]*---[ \t]*\n/.test(text.slice(start))) return text;

  const lines = splitLinesKeepEnds(text);
  let pos = 0;
  let startLine: number | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    if (pos >= start) {
      startLine = idx;
      break;
    }
    pos += lines[idx].length;
  }
  if (startLine === null) return text;

  if (!/^[ \t]*---[ \t]*\n?$/.test(lines[startLine])) return text;

  let endLine: number | null = null;
  for (let j = startLine + 1; j < lines.length; j++) {
    if (/^[ \t]*(---|\.\.\.)[ \t]*\n?$/.test(lines[j])) {
      endLine = j;
      break;
    }
  }
  if (endLine === null) return text;

  const block = lines.slice(startLine, endLine + 1).join("");
  const token = store.put(block);
  stats.protected_A_blocks += 1;

  return lines.slice(0, startLine).join("") + token + lines.slice(endLine + 1).join("");
}

function protectFencedCodeBlocks(text: string, store: TokenStore, stats: Stats): string {
  const lines = splitLinesKeepEnds(text);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const m = RE_FENCE_START.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const fence = (m.groups?.fence ?? "");
    const fenceChar = fence[0];
    const fenceLen = fence.length;

    let j = i + 1;
    while (j < lines.length) {
      const mEnd = RE_FENCE_END.exec(lines[j]);
      if (mEnd) {
        const f2 = (mEnd.groups?.fence ?? "");
        if (f2 && f2[0] === fenceChar && f2.length >= fenceLen) {
          j += 1;
          break;
        }
      }
      j += 1;
    }

    const block = lines.slice(i, j).join("");
    out.push(store.put(block));
    stats.protected_A_blocks += 1;
    i = j;
  }

  return out.join("");
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

    let j = i;
    while (j < n && text[j] === "`") j += 1;
    const tickLen = j - i;

    let k = j;
    let found = false;

    while (k < n) {
      if (text[k] !== "`") {
        k += 1;
        continue;
      }
      let k2 = k;
      while (k2 < n && text[k2] === "`") k2 += 1;
      if (k2 - k === tickLen) {
        const frag = text.slice(i, k2);
        out.push(store.put(frag));
        stats.protected_A_blocks += 1;
        i = k2;
        found = true;
        break;
      }
      k = k2;
    }

    if (!found) {
      out.push(text[i]);
      i += 1;
    }
  }

  return out.join("");
}

function protectMath(text: string, store: TokenStore, stats: Stats): string {
  // $$...$$ blocks (DOTALL)
  text = text.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  // inline $...$ with constraints: \$(?!\s)([^\n$]*?)(?<!\s)\$
  // JS supports lookbehind in modern browsers; GitHub Pages users are on modern engines.
  const inlineRe = /\$(?!\s)([^\n$]*?)(?<!\s)\$/g;
  text = text.replace(inlineRe, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  return text;
}

function protectHtml(text: string, store: TokenStore, stats: Stats): string {
  // <!-- ... -->
  text = text.replace(/<!--[\s\S]*?-->/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  // <...> but not spanning lines
  text = text.replace(/<[^>\n]+?>/g, (m) => {
    stats.protected_A_blocks += 1;
    return store.put(m);
  });

  return text;
}

function splitLinesKeepEnds(s: string): string[] {
  // Equivalent to Python splitlines(keepends=True)
  // Handles \n and \r\n
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\n") {
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  // If s ends with \n, above will have pushed that line; start == len => no extra
  return out;
}
