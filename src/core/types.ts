export type Options = {
  convert_basic_punct: boolean;
  convert_ellipsis: boolean;
  convert_emphasis_punct: boolean;
  convert_dash: boolean;
  convert_quotes: boolean;
  convert_parens: boolean;

  protect_b_fragments: boolean;
  fix_paired_symbols: boolean; // legacy conservative fixer
};

export type SkipRange = {
  start: number;
  end: number;
  reason: string;
};

export type Stats = {
  replaced: Record<string, number>;

  skipped_quote_paragraphs_double: number;
  skipped_quote_paragraphs_single: number;

  protected_A_blocks: number;
  protected_table_blocks: number;
  protected_B_fragments: number;

  fixed_pairs_near: number;
  fixed_pairs_two_same: number;
  skipped_fix_paragraphs: number;

  // tokenized coordinates then output coordinates
  skip_ranges_tok: SkipRange[];
  skip_ranges_out: SkipRange[];

  summary?: string;
};

export function makeEmptyStats(): Stats {
  return {
    replaced: {},

    skipped_quote_paragraphs_double: 0,
    skipped_quote_paragraphs_single: 0,

    protected_A_blocks: 0,
    protected_table_blocks: 0,
    protected_B_fragments: 0,

    fixed_pairs_near: 0,
    fixed_pairs_two_same: 0,
    skipped_fix_paragraphs: 0,

    skip_ranges_tok: [],
    skip_ranges_out: [],
    summary: ""
  };
}

export function inc(stats: Stats, key: string, n = 1) {
  stats.replaced[key] = (stats.replaced[key] ?? 0) + n;
}
