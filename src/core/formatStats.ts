import type { Stats } from "./types";

function fmtCount(n: number): string {
  return `${n}处`;
}

export function formatStats(stats: Stats): string {
  const keyMap: Record<string, string> = {
    "ellipsis": "省略号（...→……）",
    "dash": "破折号（--→——）",
    "double_quotes": "双引号（\"→“”）",
    "single_quotes": "单引号（'→‘’）",
    "parens_converted": "括号（( )→（ ））",
    "exclaim_runs": "感叹号连写（!!!→！！！）",
    "question_runs": "问号连写（???→？？？）",
    "?!": "组合标点（?!→？！）",
    "!?": "组合标点（!?→！？）",
    ",->，": "逗号（,→，）",
    ";->；": "分号（;→；）",
    "?->？": "问号（?→？）",
    "!->！": "感叹号（!→！）",
    ":->：": "冒号（:→：）",
    ".->。": "句号（.→。）"
  };

  const order = [
    "，", "。", "：", "；", "？", "！",
    "ellipsis", "dash",
    "double_quotes", "single_quotes",
    "parens_converted",
    "exclaim_runs", "question_runs",
    "?!", "!?"
  ];

  const symbolToKey: Record<string, string> = {
    "，": ",->，",
    "。": ".->。",
    "：": ":->：",
    "；": ";->；",
    "？": "?->？",
    "！": "!->！"
  };

  const items: string[] = [];
  for (const it of order) {
    const k = symbolToKey[it] ?? it;
    const cnt = stats.replaced[k] ?? 0;
    if (cnt) {
      const title = keyMap[k] ?? k;
      items.push(`${title}${fmtCount(cnt)}`);
    }
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
