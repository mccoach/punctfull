export type Options = {
  convert_basic_punct: boolean;
  convert_quotes: boolean;
  convert_parens: boolean;
  fix_paired_symbols: boolean;
  fix_md_bold_symbols: boolean;
};

export type SkipKind = "negative" | "uncertain";

export type SkipReasonKey =
  | "quote_odd_fallback"
  | "quote_whitelist_miss"
  | "quote_context_negative"
  | "quote_context_unknown"
  | "paren_odd_fallback"
  | "paren_whitelist_miss"
  | "paren_context_negative"
  | "paren_context_unknown"
  | "basic_non_chinese"
  | "basic_invalid_norm"
  | "basic_context_unknown";

export type Range = {
  start: number;
  end: number;
};

export type MarkRange = Range & {
  tip: string;
};

export type SkipRange = Range & {
  reason: string;
  kind: SkipKind;
  key: SkipReasonKey;
};

export type ChangeEvent = {
  source: Range;
  target: Range;
  tip: string;
};

export type SkipEvent = {
  range: Range;
  reason: string;
  kind: SkipKind;
  key: SkipReasonKey;
};

export type TransformResult = {
  text: string;
  changes: ChangeEvent[];
  skips: SkipEvent[];
};

export type Stats = {
  replaced: Record<string, number>;

  skipped_quote_paragraphs_double: number;
  skipped_quote_paragraphs_single: number;

  skip_ranges_out: SkipRange[];
  skip_negative_count: number;
  skip_uncertain_count: number;
  skip_reason_counts: Record<string, number>;

  change_marks_out: MarkRange[];

  summary?: string;
};

export function makeEmptyStats(): Stats {
  return {
    replaced: {},

    skipped_quote_paragraphs_double: 0,
    skipped_quote_paragraphs_single: 0,

    skip_ranges_out: [],
    skip_negative_count: 0,
    skip_uncertain_count: 0,
    skip_reason_counts: {},

    change_marks_out: [],
    summary: "",
  };
}

export function inc(stats: Stats, key: string, n = 1) {
  stats.replaced[key] = (stats.replaced[key] ?? 0) + n;
}

export function incSkipReason(stats: Stats, key: SkipReasonKey, n = 1) {
  stats.skip_reason_counts[key] = (stats.skip_reason_counts[key] ?? 0) + n;
}
