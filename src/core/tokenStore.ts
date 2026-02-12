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
      const b = this.breaksIn[i];
      const d = this.deltas[i];
      if (posIn < b) break;
      delta = d;
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
    const re = new RegExp(`⟦${escapeRegExp(this.prefix)}(\\d+)⟧`, "g");
    return text.replace(re, (m, g1) => {
      const i = Number(g1);
      return i >= 0 && i < this.items.length ? this.items[i] : m;
    });
  }

  restoreWithCoordMap(text: string): { text: string; map: CoordMap } {
    if (!this.items.length) return { text, map: new CoordMap() };

    const re = new RegExp(`⟦${escapeRegExp(this.prefix)}(\\d+)⟧`, "g");

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

      inCursor += (sIn - last);
      outCursor += literal.length;

      const i = Number(m[1]);
      const repl = i >= 0 && i < this.items.length ? this.items[i] : tokenText;

      inCursor += (eIn - sIn);
      parts.push(repl);
      outCursor += repl.length;

      const delta = outCursor - inCursor;
      breaksIn.push(inCursor);
      deltas.push(delta);

      last = eIn;
    }

    parts.push(text.slice(last));
    return { text: parts.join(""), map: new CoordMap({ breaksIn, deltas }) };
  }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
