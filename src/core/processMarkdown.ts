import type { Options } from "./types";
import { makeEmptyStats } from "./types";
import { convertC } from "./convertC";
import { transformFixPairs } from "./transformFixPairs";
import { projectEvents } from "./projectEvents";
import { formatStats } from "./formatStats";

export function processMarkdown(input: string, options: Options) {
  const stats = makeEmptyStats();

  let result = convertC(input, options, stats);

  if (options.fix_paired_symbols) {
    const fixed = transformFixPairs(result.text, stats);
    result = {
      text: fixed.text,
      changes: [...result.changes, ...fixed.changes],
      skips: [...result.skips, ...fixed.skips],
    };
  }

  const projected = projectEvents(result);

  stats.change_marks_out = projected.marks;
  stats.skip_ranges_out = projected.skipRanges;
  stats.skip_negative_count = stats.skip_ranges_out.filter((s) => s.kind === "negative").length;
  stats.skip_uncertain_count = stats.skip_ranges_out.filter((s) => s.kind === "uncertain").length;
  stats.summary = formatStats(stats);

  return {
    text: projected.text,
    stats,
  };
}
