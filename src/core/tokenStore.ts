export type CoordMapData = {
  breaksIn: number[];
  deltas: number[];
};

export class CoordMap {
  breaksIn: number[];
  deltas: number[];

  constructor(data?: Partial<CoordMapData>) {
    this.breaksIn = data?.breaksIn ?? [];
    this.deltas = data?.deltas ?? [];
  }

  mapPos(posIn: number): number {
    if (posIn <= 0) return 0;

    let delta = 0;
    for (let i = 0; i < this.breaksIn.length; i++) {
      if (posIn < this.breaksIn[i]) break;
      delta = this.deltas[i];
    }

    return posIn + delta;
  }

  mapRange(s: number, e: number): { s: number; e: number } {
    if (e <= s) return { s, e };
    return { s: this.mapPos(s), e: this.mapPos(e) };
  }
}

export class TokenStore {
  prefix: string;
  items: string[] = [];

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  put(s: string): string {
    const token = `⟦${this.prefix}${this.items.length}⟧`;
    this.items.push(s);
    return token;
  }

  restore(text: string): string {
    if (!this.items.length) return text;

    const re = this.getTokenRegex();
    return text.replace(re, (_m, g1) => this.getItemOrToken(Number(g1), `⟦${this.prefix}${g1}⟧`));
  }

  restoreWithCoordMap(text: string): { text: string; map: CoordMap } {
    if (!this.items.length) return { text, map: new CoordMap() };

    const re = this.getTokenRegex();
    let last = 0;
    let inCursor = 0;
    let outCursor = 0;

    const breaksIn: number[] = [];
    const deltas: number[] = [];
    const parts: string[] = [];

    for (const m of text.matchAll(re)) {
      const sIn = m.index ?? 0;
      const tokenText = m[0];
      const eIn = sIn + tokenText.length;

      const literal = text.slice(last, sIn);
      parts.push(literal);

      inCursor += sIn - last;
      outCursor += literal.length;

      const repl = this.getItemOrToken(Number(m[1]), tokenText);
      inCursor += eIn - sIn;
      parts.push(repl);
      outCursor += repl.length;

      breaksIn.push(inCursor);
      deltas.push(outCursor - inCursor);

      last = eIn;
    }

    parts.push(text.slice(last));
    return { text: parts.join(""), map: new CoordMap({ breaksIn, deltas }) };
  }

  private getTokenRegex(): RegExp {
    return new RegExp(`⟦${escapeRegExp(this.prefix)}(\\d+)⟧`, "g");
  }

  private getItemOrToken(index: number, fallbackToken: string): string {
    return index >= 0 && index < this.items.length ? this.items[index] : fallbackToken;
  }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
