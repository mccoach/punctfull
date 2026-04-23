import * as monaco from "monaco-editor";
import { createEditors } from "./editors";
import { Decorations } from "./decorations";
import { Tooltip } from "./tooltip";
import { computeChangedRanges } from "../core/diff";
import { processMarkdown } from "../core/processMarkdown";
import type { Options } from "../core/types";

const THEMES = {
  light: { monaco: "vs", attr: "light" },
  dark: { monaco: "vs-dark", attr: "dark" },
} as const;

const OPTION_ITEMS = [
  {
    id: "opt_basic",
    checked: true,
    label: "基础标点",
    tip:
      "把半角基础标点转换为全角：, . : ; ? !\n\n注意：仅在检测到中文语境（附近有中文/中文标点）时才触发；尽量避免影响纯英文段落。",
  },
  {
    id: "opt_ellipsis",
    checked: true,
    label: "省略号",
    tip:
      "把连续英文点号 ...（3 个或更多）转换为中文省略号 ……\n\n同样受中文语境触发限制；代码/链接等保护区不会动。",
  },
  {
    id: "opt_emph",
    checked: true,
    label: "连续/组合标点",
    tip:
      "把连续强调标点做中文化：\n- !!! → ！！！\n- ??? → ？？？\n- ?! / !? → ？！ / ！？\n\n同样受中文语境触发限制。",
  },
  {
    id: "opt_dash",
    checked: true,
    label: "破折号",
    tip:
      "把恰好两个连字符 -- 转为中文破折号 ——\n\n并且做了一个保护：如果后面紧跟字母/数字/下划线（可能是参数/标识符），就不转换。",
  },
  {
    id: "opt_quotes",
    checked: true,
    label: "引号",
    tip:
      "把英文引号转换为中文引号：\n- \\\" → “ ”（成对时）\n- '  → ‘ ’（更保守：排除英文缩写里的 apostrophe）\n\n奇数回退：如果某段候选引号数量为奇数，则该段一个都不转，只标记为“跳过原因”（右侧灰色并可悬浮查看）。",
  },
  {
    id: "opt_parens",
    checked: true,
    label: "括号（语义）",
    tip:
      "括号语义转换（非常保守）：仅当括号内容看起来像“短中文解释”（例如：（术语））时，才把 ( ) 转为 （ ）\n\n技术性内容/链接/代码样式内容不会转换。",
  },
  {
    id: "opt_fixpairs",
    checked: true,
    label: "成对符号纠错",
    tip:
      "成对符号纠错（强保守，可选）：\n当检测到中文语境，并且段落不像技术文本时，尝试修正一些明显的成对符号错误，例如：\n- ““ → ”\n- ”” → “”\n- 段落内只出现两次同向符号时尝试补成对\n\n这是 legacy 修复器：有可能改到你不想改的地方，所以默认可开可关。",
  },
  {
    id: "opt_boldsym",
    checked: true,
    label: "加粗符号修复",
    tip:
      "修复 Markdown 加粗符号 ** 的兼容性问题：\n1. 去掉 **内容** 两侧内部的非法空格；\n2. 当左 ** 左侧紧邻字母/数字/汉字，且加粗内容首字符是符号时，在左 ** 前补一个空格。\n3. 当右 ** 左侧紧邻非文字，而右侧紧邻文字时，在右 ** 后补一个空格。\n\n仅处理正文区，代码/链接/表格/公式等保护区不会动。",
  },
  {
    id: "opt_backslash",
    checked: true,
    label: "转义符\\",
    tip:
      "删除正文区中多余的 Markdown 转义反斜杠 \\。\n\n会保留行首用于防止标题、引用、列表触发的必要转义；代码、公式、HTML、表格、链接、URL、路径等保护区不处理。",
  },
] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getOptionsFromUI(root: HTMLElement): Options {
  const q = (sel: string) => root.querySelector(sel) as HTMLInputElement;
  return {
    convert_basic_punct: q("#opt_basic").checked,
    convert_ellipsis: q("#opt_ellipsis").checked,
    convert_emphasis_punct: q("#opt_emph").checked,
    convert_dash: q("#opt_dash").checked,
    convert_quotes: q("#opt_quotes").checked,
    convert_parens: q("#opt_parens").checked,
    protect_b_fragments: true,
    fix_paired_symbols: q("#opt_fixpairs").checked,
    fix_md_bold_symbols: q("#opt_boldsym").checked,
    remove_md_backslash_escapes: q("#opt_backslash").checked,
  };
}

function buildOptionLabel(item: typeof OPTION_ITEMS[number]): HTMLLabelElement {
  const label = document.createElement("label");
  label.setAttribute("data-tip", item.tip);

  const input = document.createElement("input");
  input.id = item.id;
  input.type = "checkbox";
  input.checked = item.checked;

  label.append(input, ` ${item.label}`);
  return label;
}

export function initUI(container: HTMLElement) {
  /* ===== Top bar ===== */
  const topbar = el("div", "topbar");

  /* -- Left: open file button -- */
  const topLeft = el("div", "topbar-left");
  const fileInput = el("input") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.accept = ".md,.markdown,.mdown,.mkd,.txt,*/*";
  fileInput.style.display = "none";

  const btnOpen = el("button") as HTMLButtonElement;
  btnOpen.className = "btn-secondary";
  btnOpen.textContent = "打开文件…";
  btnOpen.onclick = () => fileInput.click();

  topLeft.append(fileInput, btnOpen);

  /* -- Center: options fieldset -- */
  const topCenter = el("div", "topbar-center");
  const optBox = document.createElement("fieldset");
  optBox.className = "options-box";

  const optLegend = document.createElement("legend");
  optLegend.textContent = "转换选项";
  optBox.appendChild(optLegend);

  for (const item of OPTION_ITEMS) {
    optBox.appendChild(buildOptionLabel(item));
  }

  topCenter.append(optBox);

  /* -- Right: preview, download, theme -- */
  const topRight = el("div", "topbar-right");

  const btnPreview = el("button") as HTMLButtonElement;
  btnPreview.className = "btn-primary";
  btnPreview.textContent = "预览转换";

  const btnSave = el("button") as HTMLButtonElement;
  btnSave.className = "btn-secondary";
  btnSave.textContent = "下载输出";

  const themeGroup = el("div", "theme-group");
  const themeLabel = el("span");
  themeLabel.textContent = "配色";
  const themeSel = el("select") as HTMLSelectElement;
  themeSel.innerHTML = `
    <option value="light">明亮</option>
    <option value="dark">暗色</option>
  `;
  themeGroup.append(themeLabel, themeSel);

  topRight.append(btnPreview, btnSave, themeGroup);

  topbar.append(topLeft, topCenter, topRight);

  /* ===== Status bar (full-width row between topbar and editors) ===== */
  const statusBar = el("div", "status-bar");
  statusBar.textContent =
    "就绪。提示：Monaco 自带 Ctrl+F 查找替换，F3 查找下一个。";

  /* ===== Main editor area ===== */
  const main = el("div", "main");

  const leftPane = el("div", "pane");
  const rightPane = el("div", "pane");

  const leftTitle = el("div", "title");
  leftTitle.textContent = "原文（可编辑，差异高亮）";
  leftPane.append(leftTitle);

  const rightTitle = el("div", "title");
  rightTitle.textContent = "转换后（可编辑，差异高亮 / 跳过原因 tooltip）";
  rightPane.append(rightTitle);

  const leftEdHost = el("div", "editor");
  const rightEdHost = el("div", "editor");
  leftPane.append(leftEdHost);
  rightPane.append(rightEdHost);

  main.append(leftPane, rightPane);

  /* ===== Footer ===== */
  const footer = el("div", "footer");
  footer.textContent =
    "离线说明：首次打开需要联网下载并缓存资源；之后断网也能打开并使用。本工具不上传任何内容。";

  /* ===== Assemble ===== */
  container.append(topbar, statusBar, main, footer);

  /* ===== Tooltip ===== */
  const tip = new Tooltip();
  tip.bindTo(topbar);

  /* ===== Theme ===== */
  function applyTheme(name: keyof typeof THEMES) {
    const t = THEMES[name];
    document.documentElement.dataset.theme = t.attr;
    monaco.editor.setTheme(t.monaco);
  }
  applyTheme("dark");
  themeSel.value = "dark";
  themeSel.onchange = () => applyTheme(themeSel.value as any);

  /* ===== Editors ===== */
  const {
    leftEditor,
    rightEditor,
    dispose,
    getRightViewState,
    restoreRightViewState,
  } = createEditors(leftEdHost, rightEdHost);

  const deco = new Decorations(leftEditor, rightEditor);

  /* ===== File open ===== */
  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    leftEditor.setValue(text);
    statusBar.textContent = `已打开：${f.name}（${text.length} 字符）`;
    fileInput.value = "";
  };

  /* ===== Download ===== */
  btnSave.onclick = () => {
    const out = rightEditor.getValue();
    downloadText("output.fullwidth.md", out);
  };

  /* ===== Preview ===== */
  btnPreview.onclick = () => {
    const src = leftEditor.getValue();
    const options = getOptionsFromUI(container);

    const view = getRightViewState();

    const t0 = performance.now();
    const { text: out, stats } = processMarkdown(src, options);
    const t1 = performance.now();

    rightEditor.setValue(out);

    deco.setSkip(stats.skip_ranges_out);

    const outRanges = computeChangedRanges(src, out);
    const inRanges = computeChangedRanges(out, src);
    deco.setDiff(outRanges, inRanges);

    restoreRightViewState(view);

    statusBar.textContent = `${stats.summary || "完成"} | 用时 ${(t1 - t0).toFixed(1)}ms`;
  };

  window.addEventListener("beforeunload", () => dispose());
}
