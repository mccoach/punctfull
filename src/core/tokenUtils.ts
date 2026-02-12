import { TOKEN_RE_ANY } from "./tokens";

export function hasAnyTokenInRange(text: string, start: number, end: number): boolean {
  if (end <= start) return false;
  TOKEN_RE_ANY.lastIndex = 0;
  const slice = text.slice(start, end);
  TOKEN_RE_ANY.lastIndex = 0;
  return TOKEN_RE_ANY.test(slice);
}
