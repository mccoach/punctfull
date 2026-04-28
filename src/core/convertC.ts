import type { Options, Stats, TransformResult, ChangeEvent, SkipEvent } from "./types";
import { transformQuotes } from "./transformQuotes";
import { transformParens } from "./transformParens";
import { transformBasic } from "./transformBasic";
import { transformMarkdown } from "./transformMarkdown";

function appendResult(
  base: TransformResult,
  next: TransformResult,
): TransformResult {
  return {
    text: next.text,
    changes: [...base.changes, ...next.changes],
    skips: [...base.skips, ...next.skips],
  };
}

export function convertC(text: string, options: Options, stats: Stats): TransformResult {
  let result: TransformResult = {
    text,
    changes: [] as ChangeEvent[],
    skips: [] as SkipEvent[],
  };

  if (options.convert_quotes) {
    result = appendResult(result, transformQuotes(result.text, stats));
  }

  if (options.convert_parens) {
    result = appendResult(result, transformParens(result.text, stats));
  }

  if (options.convert_basic_punct) {
    result = appendResult(result, transformBasic(result.text, stats));
  }

  if (options.fix_md_bold_symbols) {
    result = appendResult(result, transformMarkdown(result.text, stats));
  }

  return result;
}
