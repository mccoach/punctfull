import type { Stats } from "./types";
import { TokenStore } from "./tokenStore";
import { hasAnyTokenInRange } from "./tokenUtils";

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

type ParsedMdLink = {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  addrStart: number;
  addrEnd: number;
  isImage: boolean;
};

function parseMdLinkAt(text: string, start: number): ParsedMdLink | null {
  let i = start;
  let isImage = false;

  if (text[i] === "!") {
    isImage = true;
    i += 1;
  }

  if (i >= text.length || text[i] !== "[") return null;
  const labelStart = i + 1;

  let j = labelStart;
  while (j < text.length) {
    if (text[j] === "\\" && j + 1 < text.length) {
      j += 2;
      continue;
    }
    if (text[j] === "]") break;
    j += 1;
  }

  if (j >= text.length || text[j] !== "]") return null;
  if (j + 1 >= text.length || text[j + 1] !== "(") return null;

  const labelEnd = j;
  const addrStart = j + 2;
  let k = addrStart;
  let depth = 1;

  while (k < text.length) {
    const ch = text[k];
    if (ch === "\\" && k + 1 < text.length) {
      k += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          start,
          end: k + 1,
          labelStart,
          labelEnd,
          addrStart,
          addrEnd: k,
          isImage,
        };
      }
    }
    k += 1;
  }

  return null;
}

function containsTokenMarker(s: string): boolean {
  return s.includes("⟦") || s.includes("⟧");
}

function protectMarkdownLinksAndImages(text: string, stats: Stats, store: TokenStore): string {
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

    const whole = text.slice(parsed.start, parsed.end);
    const label = text.slice(parsed.labelStart, parsed.labelEnd);
    const addr = text.slice(parsed.addrStart, parsed.addrEnd);

    if (containsTokenMarker(whole) || containsTokenMarker(label) || containsTokenMarker(addr)) {
      out.push(whole);
      i = parsed.end;
      continue;
    }

    if (parsed.isImage) {
      const prefixToken = store.put("![");
      const suffixToken = store.put(`](${addr})`);
      out.push(prefixToken + label + suffixToken);
      stats.protected_B_fragments += 2;
    } else {
      const addrToken = store.put(addr);
      out.push("[" + label + "](" + addrToken + ")");
      stats.protected_B_fragments += 1;
    }

    i = parsed.end;
  }

  return out.join("");
}

const RE_PATH_BROAD =
  /(?:\.\/|\.\.\/|~\/|[A-Za-z]:\\)[^\s<>()\]]+|[A-Za-z0-9._~\-]+(?:[\\/][A-Za-z0-9._~\-]+)+/g;

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
  return /^\d+\/\d+\b/.test(text.slice(start, end));
}

function isPatternMatchAllowed(name: string, text: string, start: number, end: number, frag: string): boolean {
  if (containsTokenMarker(frag)) return false;
  if (hasAnyTokenInRange(text, start, end)) return false;

  if (name === "PATH") {
    if (!isBoundaryBefore(text, start)) return false;
    if (isForbiddenPathFraction(text, start, end)) return false;
  }

  if (name === "URL" && !isValidUrl(frag)) return false;
  if (name === "IPV4" && !isValidIpv4(frag)) return false;

  return true;
}

function protectCommonTechnicalFragments(text: string, stats: Stats, store: TokenStore): string {
  for (const [name, re] of PATTERNS) {
    const parts: string[] = [];
    let last = 0;

    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      let s = m.index ?? 0;
      let frag = m[0];
      let e = s + frag.length;

      const trimmed = trimFragIfNeeded(name, frag);
      if (trimmed !== frag) {
        frag = trimmed;
        e = s + frag.length;
        if (e <= s) continue;
      }

      if (!isPatternMatchAllowed(name, text, s, e, frag)) continue;

      parts.push(text.slice(last, s));
      parts.push(store.put(frag));
      stats.protected_B_fragments += 1;
      last = e;
    }

    parts.push(text.slice(last));
    text = parts.join("");
  }

  return text;
}

export function protectB(text: string, stats: Stats): { text: string; store: TokenStore } {
  const store = new TokenStore("B");
  if (!text) return { text, store };

  text = protectMarkdownLinksAndImages(text, stats, store);
  text = protectCommonTechnicalFragments(text, stats, store);

  return { text, store };
}
