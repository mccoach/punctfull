import type { Stats } from "./types";

function fmtCount(n: number): string {
  return `${n}处`;
}

const CONVERSION_ITEMS: Array<{ key: string; label: string }> = [
  { key: ",->，", label: "逗号" },
  { key: ".->。", label: "句号" },
  { key: ":->：", label: "冒号" },
  { key: ";->；", label: "分号" },
  { key: "?->？", label: "问号" },
  { key: "!->！", label: "叹号" },
  { key: "ellipsis", label: "省略号" },
  { key: "dash", label: "破折号" },
  { key: "double_quotes", label: "双引号" },
  { key: "single_quotes", label: "单引号" },
  { key: "parens_converted", label: "括号" },
  { key: "exclaim_runs", label: "连写叹号" },
  { key: "question_runs", label: "连写问号" },
  { key: "?!", label: "组合标点?!" },
  { key: "!?", label: "组合标点!?" },
  { key: "md_bold_symbol_fix", label: "加粗修正" }
];

const SKIP_REASON_LABELS: Record<string, string> = {
  quote_odd_fallback: "引号不成对",
  quote_whitelist_miss: "引号不合规范",
  quote_context_negative: "引号判非",
  quote_context_unknown: "引号无法判定",

  paren_odd_fallback: "括号不成对",
  paren_whitelist_miss: "括号不合规范",
  paren_context_negative: "括号判非",
  paren_context_unknown: "括号无法判定",

  basic_non_chinese: "基础标点判非",
  basic_invalid_norm: "基础标点不合规范",
  basic_context_unknown: "基础标点无法判定",
};

export function formatStats(stats: Stats): string {
  const items: string[] = [];

  for (const item of CONVERSION_ITEMS) {
    const cnt = stats.replaced[item.key] ?? 0;
    if (cnt) items.push(`${item.label}${fmtCount(cnt)}`);
  }

  const fixCount = (stats.replaced["fixed_pairs_near"] ?? 0) + (stats.replaced["fixed_pairs_two_same"] ?? 0);
  const fixParts: string[] = [];
  if (fixCount) fixParts.push(`成对纠错${fmtCount(fixCount)}`);

  const skipClassParts: string[] = [];
  if (stats.skip_negative_count) skipClassParts.push(`判非${fmtCount(stats.skip_negative_count)}`);
  if (stats.skip_uncertain_count) skipClassParts.push(`跳过${fmtCount(stats.skip_uncertain_count)}`);

  const skipReasonParts = Object.entries(stats.skip_reason_counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, count]) => `${SKIP_REASON_LABELS[key] ?? key}${fmtCount(count)}`);

  const maxShow = 8;
  const convShow = items.slice(0, maxShow);
  if (items.length > maxShow) convShow.push(`等${items.length}项`);

  const blocks: string[] = [];
  blocks.push("转换：" + (convShow.length ? convShow.join("，") : "无"));
  if (fixParts.length) blocks.push("修正：" + fixParts.join("；"));
  if (skipClassParts.length) blocks.push("跳过：" + skipClassParts.join("；"));
  if (skipReasonParts.length) blocks.push("原因：" + skipReasonParts.join("；"));

  const line = blocks.join(" | ");
  return line.length > 220 ? (line.slice(0, 219) + "…") : line;
}
