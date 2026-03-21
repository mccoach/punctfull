export const TOKEN_RE_ANY = /⟦[ATB]\d+⟧/g;

export type TokenSpan = { start: number; end: number; reason: string };

function getTokenReason(tok: string): string {
  const prefix = tok[1];

  if (prefix === "A") return "保护区：A（YAML/代码/公式/HTML）";
  if (prefix === "T") return "保护区：表格";
  if (prefix === "B") return "保护区：链接/邮箱/IP/路径等";
  return `保护区：${prefix}`;
}

export function collectTokenSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  TOKEN_RE_ANY.lastIndex = 0;

  for (const m of text.matchAll(TOKEN_RE_ANY)) {
    const s = m.index ?? 0;
    const tok = m[0];
    const e = s + tok.length;

    spans.push({
      start: s,
      end: e,
      reason: getTokenReason(tok),
    });
  }

  return spans;
}
