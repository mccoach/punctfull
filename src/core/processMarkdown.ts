import type { Options, Stats, SkipRange } from "./types";
import { makeEmptyStats } from "./types";
import { TokenStore } from "./tokenStore";
import { collectTokenSpans } from "./tokens";
import { protectA } from "./protectA";
import { protectTables } from "./protectTables";
import { protectB } from "./protectB";
import { convertC } from "./convertC";
import { formatStats } from "./formatStats";

function fmtSummary(stats: Stats): string {
  // Minimal summary for now; later we’ll port your _format_stats.
  const repCount = Object.values(stats.replaced).reduce((a, b) => a + b, 0);
  const prot = [
    stats.protected_A_blocks ? `A ${stats.protected_A_blocks}段` : "",
    stats.protected_table_blocks ? `表格 ${stats.protected_table_blocks}块` : "",
    stats.protected_B_fragments ? `B ${stats.protected_B_fragments}处` : ""
  ].filter(Boolean);

  const skips = [
    stats.skipped_quote_paragraphs_double ? `双引号奇数回退 ${stats.skipped_quote_paragraphs_double}段` : "",
    stats.skipped_quote_paragraphs_single ? `单引号奇数回退 ${stats.skipped_quote_paragraphs_single}段` : ""
  ].filter(Boolean);

  const fix = (stats.fixed_pairs_near + stats.fixed_pairs_two_same) || 0;

  const parts: string[] = [];
  parts.push(`转换：${repCount}处`);
  if (prot.length) parts.push(`保护：${prot.join("；")}`);
  if (skips.length) parts.push(`提示：${skips.join("；")}`);
  if (fix) parts.push(`修正：${fix}处`);
  return parts.join(" | ");
}

export function processMarkdown(input: string, options: Options): { text: string; stats: Stats } {
  const stats = makeEmptyStats();
  let text = input;

  // A-zone protection
  const a = protectA(text, stats);
  text = a.text;
  const storeA = a.store;

  // Table protection
  const t = protectTables(text, stats);
  text = t.text;
  const storeT = t.store;

  // B-zone protection
  let storeB = new TokenStore("B");
  if (options.protect_b_fragments) {
    const b = protectB(text, stats);
    text = b.text;
    storeB = b.store;
  }

  // Convert C-zone
  text = convertC(text, options, stats);

  // Collect token spans in tokenized coordinates (skip marking)
  const tokenSpans = collectTokenSpans(text);
  for (const sp of tokenSpans) {
    stats.skip_ranges_tok.push({ start: sp.start, end: sp.end, reason: sp.reason });
  }

  // Restore with coord maps: B -> T -> A (same order as Python)
  const rb = storeB.restoreWithCoordMap(text);
  text = rb.text;
  const mapB = rb.map;

  const rt = storeT.restoreWithCoordMap(text);
  text = rt.text;
  const mapT = rt.map;

  const ra = storeA.restoreWithCoordMap(text);
  text = ra.text;
  const mapA = ra.map;

  const mapThroughAll = (s: number, e: number) => {
    let r = mapB.mapRange(s, e);
    r = mapT.mapRange(r.s, r.e);
    r = mapA.mapRange(r.s, r.e);
    return r;
  };

  const outRanges: SkipRange[] = [];
  for (const r of stats.skip_ranges_tok) {
    const m = mapThroughAll(r.start, r.end);
    outRanges.push({ start: m.s, end: m.e, reason: r.reason });
  }
  stats.skip_ranges_out = outRanges;

  stats.summary = formatStats(stats);
  return { text, stats };
}
