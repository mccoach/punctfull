import type { Stats } from "./types";

function fmtCount(n: number): string {
  return `${n}处`;
}

const CONVERSION_ITEMS: Array<{ key: string; label: string }> = [
  { key: ",->，", label: "逗号（,→，）" },
  { key: ".->。", label: "句号（.→。）" },
  { key: ":->：", label: "冒号（:→：）" },
  { key: ";->；", label: "分号（;→；）" },
  { key: "?->？", label: "问号（?→？）" },
  { key: "!->！", label: "感叹号（!→！）" },
  { key: "ellipsis", label: "省略号（...→……）" },
  { key: "dash", label: "破折号（--→——）" },
  { key: "double_quotes", label: "双引号（\"→“”）" },
  { key: "single_quotes", label: "单引号（'→‘’）" },
  { key: "parens_converted", label: "括号（( )→（ ））" },
  { key: "exclaim_runs", label: "感叹号连写（!!!→！！！）" },
  { key: "question_runs", label: "问号连写（???→？？？）" },
  { key: "?!", label: "组合标点（?!→？！）" },
  { key: "!?", label: "组合标点（!?→！？）" },
  { key: "md_bold_unescape", label: "加粗符号反转义（\\*\\*→**）" },
  { key: "md_bold_symbol_fix", label: "Markdown 加粗符号修复" }
];

export function formatStats(stats: Stats): string {
  const items: string[] = [];

  for (const item of CONVERSION_ITEMS) {
    const cnt = stats.replaced[item.key] ?? 0;
    if (cnt) items.push(`${item.label}${fmtCount(cnt)}`);
  }

  const protectionParts: string[] = [];
  if (stats.protected_A_blocks) protectionParts.push(`已跳过：代码/公式/HTML等${stats.protected_A_blocks}段`);
  if (stats.protected_table_blocks) protectionParts.push(`已跳过：表格${stats.protected_table_blocks}块`);
  if (stats.protected_B_fragments) protectionParts.push(`已跳过：链接/邮箱/IP/路径等${stats.protected_B_fragments}处`);

  const skipParts: string[] = [];
  if (stats.skipped_quote_paragraphs_double) skipParts.push(`双引号奇数回退${stats.skipped_quote_paragraphs_double}段`);
  if (stats.skipped_quote_paragraphs_single) skipParts.push(`单引号奇数回退${stats.skipped_quote_paragraphs_single}段`);

  const fixCount = (stats.fixed_pairs_near ?? 0) + (stats.fixed_pairs_two_same ?? 0);
  const fixParts: string[] = [];
  if (fixCount) fixParts.push(`成对符号纠错${fixCount}处`);

  const maxShow = 8;
  const convShow = items.slice(0, maxShow);
  if (items.length > maxShow) convShow.push(`…等${items.length}项`);

  const blocks: string[] = [];
  blocks.push("转换：" + (convShow.length ? convShow.join("，") : "无"));
  if (protectionParts.length) blocks.push("保护：" + protectionParts.join("；"));
  if (skipParts.length) blocks.push("提示：" + skipParts.join("；"));
  if (fixParts.length) blocks.push("修正：" + fixParts.join("；"));

  const line = blocks.join(" | ");
  return line.length > 220 ? (line.slice(0, 219) + "…") : line;
}
