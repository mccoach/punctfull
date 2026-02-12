export const TOKEN_RE_ANY = /⟦[ATB]\d+⟧/g;

export type TokenSpan = { start: number; end: number; reason: string };

export function collectTokenSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  TOKEN_RE_ANY.lastIndex = 0;

  for (const m of text.matchAll(TOKEN_RE_ANY)) {
    const s = m.index ?? 0;
    const tok = m[0];
    const e = s + tok.length;
    const prefix = tok[1]; // tok = "⟦A0⟧" => 'A'

    let reason = "保护区";
    if (prefix === "A") reason = "保护区：A（YAML/代码/公式/HTML）";
    else if (prefix === "T") reason = "保护区：表格";
    else if (prefix === "B") reason = "保护区：链接/邮箱/IP/路径等";
    else reason = `保护区：${prefix}`;

    spans.push({ start: s, end: e, reason });
  }

  return spans;
}
