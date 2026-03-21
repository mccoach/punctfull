import type { Options, Stats, SkipRange } from "./types";
import { makeEmptyStats } from "./types";
import { TokenStore } from "./tokenStore";
import { collectTokenSpans } from "./tokens";
import { protectA } from "./protectA";
import { protectTables } from "./protectTables";
import { protectB } from "./protectB";
import { convertC } from "./convertC";
import { formatStats } from "./formatStats";

const DEBUG_PROCESS = true;

function dbg(message: string, data?: unknown) {
  if (!DEBUG_PROCESS) return;
  if (data === undefined) console.log(`[PFDBG:P] ${message}`);
  else console.log(`[PFDBG:P] ${message}`, data);
}

export function processMarkdown(input: string, options: Options): { text: string; stats: Stats } {
  const stats = makeEmptyStats();
  let text = input;

  dbg("input head", text.slice(0, 1200));

  // A-zone protection
  const a = protectA(text, stats);
  text = a.text;
  const storeA = a.store;
  dbg("after protectA", text.slice(0, 1200));

  // Table protection
  const t = protectTables(text, stats);
  text = t.text;
  const storeT = t.store;
  dbg("after protectTables", text.slice(0, 1200));

  // B-zone protection
  let storeB = new TokenStore("B");
  if (options.protect_b_fragments) {
    const b = protectB(text, stats);
    text = b.text;
    storeB = b.store;
  }
  dbg("after protectB", text.slice(0, 1200));

  // Convert C-zone
  text = convertC(text, options, stats);
  dbg("after convertC", text.slice(0, 1200));

  // Collect token spans in tokenized coordinates (skip marking)
  const tokenSpans = collectTokenSpans(text);
  dbg("tokenSpans", tokenSpans);
  for (const sp of tokenSpans) {
    stats.skip_ranges_tok.push({ start: sp.start, end: sp.end, reason: sp.reason });
  }

  // Restore with coord maps: B -> T -> A
  const rb = storeB.restoreWithCoordMap(text);
  text = rb.text;
  const mapB = rb.map;
  dbg("after restore B", text.slice(0, 1200));

  const rt = storeT.restoreWithCoordMap(text);
  text = rt.text;
  const mapT = rt.map;
  dbg("after restore T", text.slice(0, 1200));

  const ra = storeA.restoreWithCoordMap(text);
  text = ra.text;
  const mapA = ra.map;
  dbg("after restore A(final)", text.slice(0, 1200));

  const outRanges: SkipRange[] = [];
  for (const r of stats.skip_ranges_tok) {
    let mapped = mapB.mapRange(r.start, r.end);
    mapped = mapT.mapRange(mapped.s, mapped.e);
    mapped = mapA.mapRange(mapped.s, mapped.e);
    outRanges.push({ start: mapped.s, end: mapped.e, reason: r.reason });
  }
  stats.skip_ranges_out = outRanges;

  dbg("skip_ranges_out", outRanges);

  stats.summary = formatStats(stats);
  return { text, stats };
}
