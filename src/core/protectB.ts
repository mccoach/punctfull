import type { Stats } from "./types";
import { TokenStore } from "./tokenStore";
import { TOKEN_RE_ANY } from "./tokens";
import { hasAnyTokenInRange } from "./tokenUtils";

// 与 Python 保持一致的右侧裁剪字符集合
const TRIM_CHARS = `.,;:!?)}]>\'"”’，。；：？！】）》）`;
const TRIM_RE = new RegExp(`[${escapeForCharClass(TRIM_CHARS)}]+$`);

function escapeForCharClass(s: string) {
  return s.replace(/[-\\\]^]/g, "\\$&");
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.host;
  } catch {
    return false;
  }
}

function isValidIpv4(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (p === "" || p.length > 3) return false;
    if (!/^\d+$/.test(p)) return false;
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return false;
  }
  return true;
}

function trimFragIfNeeded(name: string, frag: string): string {
  if (name === "URL" || name === "PATH" || name === "DOMAIN" || name === "FILENAME") {
    const trimmed = frag.replace(TRIM_RE, "");
    if (trimmed) return trimmed;
  }
  return frag;
}

/**
 * Parse !?[...](...) and return (start, end, addrStart, addrEnd), else null.
 * Mirrors Python _parse_md_link_at.
 */
function parseMdLinkAt(text: string, i: number):
  | { start: number; end: number; addrStart: number; addrEnd: number }
  | null {
  const n = text.length;
  const start = i;

  if (i < n && text[i] === "!") i += 1;
  if (i >= n || text[i] !== "[") return null;

  let j = i + 1;
  while (j < n) {
    if (text[j] === "\\" && j + 1 < n) { j += 2; continue; }
    if (text[j] === "]") break;
    j += 1;
  }
  if (j >= n || text[j] !== "]") return null;
  if (j + 1 >= n || text[j + 1] !== "(") return null;

  const addrStart = j + 2;
  let k = addrStart;
  let depth = 1;

  while (k < n) {
    const ch = text[k];
    if (ch === "\\" && k + 1 < n) { k += 2; continue; }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        const addrEnd = k;
        const end = k + 1;
        return { start, end, addrStart, addrEnd };
      }
    }
    k += 1;
  }

  return null;
}

/**
 * PATH (no lookbehind) — compatibility-first.
 * We intentionally approximate Python patterns but avoid lookbehind:
 *  1) starts with ./ ../ ~/ or drive:\  (anchored by boundary in scan)
 *  2) contains at least one / or \  and looks like path-ish segments
 *
 * We scan with a broad regex and then apply boundary checks in code.
 */
const RE_PATH_BROAD = /(?:\.\/|\.\.\/|~\/|[A-Za-z]:\\)[^\s<>()\]]+|[A-Za-z0-9._~\-]+(?:[\\/][A-Za-z0-9._~\-]+)+/g;

const PATTERNS: Array<[string, RegExp]> = [
  ["URL", /https?:\/\/[^\s<>()\]]+/g],
  ["EMAIL", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["EMOJI", /:[A-Za-z0-9_+\-]+:/g],
  ["IPV4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ["TIME_RATIO", /\b(?:\d{1,2}:){1,2}\d{1,2}\b|\b\d+:\d+\b/g],
  ["DATE", /\b\d{4}[.-]\d{2}[.-]\d{2}\b/g],
  ["THOUSANDS", /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g],
  ["DECIMAL", /\b\d+\.\d+\b/g],
  ["PATH", RE_PATH_BROAD],
  ["DOMAIN", /\b(?:[A-Za-z0-9-]+\.)+(?:[A-Za-z]{2,24})\b/g],
  ["FILENAME", /\b[\w\-]+\.[A-Za-z0-9]{1,6}(?:\.[A-Za-z0-9]{1,6})*\b/g],
  ["VERSION", /\bv?\d+(?:\.\d+){1,}(?:[-+][0-9A-Za-z.\-]+)?\b/g]
];

function isWordChar(ch: string): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function isBoundaryBefore(text: string, idx: number): boolean {
  if (idx <= 0) return true;
  return !isWordChar(text[idx - 1]);
}

function isForbiddenPathFraction(text: string, start: number, end: number): boolean {
  // mimic: (?!\d+/\d+\b) in the python PATH second alternative
  // If entire match is like 12/34 (ratio), don't treat as path.
  const frag = text.slice(start, end);
  return /^\d+\/\d+\b/.test(frag);
}

export function protectB(text: string, stats: Stats): { text: string; store: TokenStore } {
  const store = new TokenStore("B");
  if (!text) return { text, store };

  // 1) Protect markdown link addresses
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "!" && text[i] !== "[") {
      out.push(text[i]);
      i += 1;
      continue;
    }

    const parsed = parseMdLinkAt(text, i);
    if (!parsed) {
      out.push(text[i]);
      i += 1;
      continue;
    }

    const { start, end, addrStart, addrEnd } = parsed;
    if (start > i) out.push(text.slice(i, start));

    const whole = text.slice(start, end);
    const addr = text.slice(addrStart, addrEnd);

    // exactly mirror python: if addr already contains tokens/brackets, don't touch
    if (addr.includes("⟦") || addr.includes("⟧") || /⟦[ATB]\d+⟧/.test(addr)) {
      out.push(whole);
    } else {
      stats.protected_B_fragments += 1;
      const token = store.put(addr);
      out.push(text.slice(start, addrStart) + token + text.slice(addrEnd, end));
    }

    i = end;
  }

  text = out.join("");

  // 2) Protect common technical fragments
  for (const [name, re] of PATTERNS) {
    const parts: string[] = [];
    let last = 0;

    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      let s = m.index ?? 0;
      let frag = m[0];
      let e = s + frag.length;

      // Skip any region that already contains token markers (python: if "⟦" in frag or "⟧" in frag)
      if (frag.includes("⟦") || frag.includes("⟧")) continue;

      // Skip if tokens appear inside this range
      if (hasAnyTokenInRange(text, s, e)) continue;

      // PATH boundary rules (no lookbehind substitute)
      if (name === "PATH") {
        if (!isBoundaryBefore(text, s)) continue;
        if (isForbiddenPathFraction(text, s, e)) continue;
      }

      // Trim punctuation for certain types
      const trimmed = trimFragIfNeeded(name, frag);
      if (trimmed !== frag) {
        frag = trimmed;
        e = s + frag.length;
        if (e <= s) continue;
      }

      // extra validations
      if (name === "URL" && !isValidUrl(frag)) continue;
      if (name === "IPV4" && !isValidIpv4(frag)) continue;

      parts.push(text.slice(last, s));
      parts.push(store.put(frag));
      stats.protected_B_fragments += 1;
      last = e;
    }

    parts.push(text.slice(last));
    text = parts.join("");
  }

  return { text, store };
}
