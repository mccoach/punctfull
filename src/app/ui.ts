import * as monaco from "monaco-editor";
import { createEditors } from "./editors";
import { Decorations } from "./decorations";
import { Tooltip } from "./tooltip";
import { computeChangedMarks } from "../core/diff";
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
      "修正基础标点、省略号、连续问叹、破折号。",
  },
  {
    id: "opt_quotes",
    checked: true,
    label: "引号",
    tip:
      "英文引号配对后按中文规则转换。",
  },
  {
    id: "opt_parens",
    checked: true,
    label: "括号",
    tip:
      "英文圆括号配对后按中文规则转换。",
  },
  {
    id: "opt_fixpairs",
    checked: true,
    label: "成对符号纠错",
    tip:
      "纠正中文引号、括号方向错误。",
  },
  {
    id: "opt_boldsym",
    checked: true,
    label: "加粗符号修复",
    tip:
      "修正 Markdown 加粗符号 **。",
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
    convert_quotes: q("#opt_quotes").checked,
    convert_parens: q("#opt_parens").checked,
    fix_paired_symbols: q("#opt_fixpairs").checked,
    fix_md_bold_symbols: q("#opt_boldsym").checked,
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
  const topbar = el("div", "topbar");

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

  const statusBar = el("div", "status-bar");
  statusBar.textContent =
    "就绪。黄色/蓝色为修改；红色为判非跳过；灰色为无法判定或不符合规范。";

  const main = el("div", "main");

  const leftPane = el("div", "pane");
  const rightPane = el("div", "pane");

  const leftTitle = el("div", "title");
  leftTitle.textContent = "原文（可编辑）";
  leftPane.append(leftTitle);

  const rightTitle = el("div", "title");
  rightTitle.textContent = "转换后（可编辑）";
  rightPane.append(rightTitle);

  const leftEdHost = el("div", "editor");
  const rightEdHost = el("div", "editor");
  leftPane.append(leftEdHost);
  rightPane.append(rightEdHost);

  main.append(leftPane, rightPane);

  const footer = el("div", "footer");
  footer.textContent =
    "说明：本工具直接基于原文规则处理，保留中文符号清洗、成对符号纠错与 Markdown 加粗修正。";

  container.append(topbar, statusBar, main, footer);

  const tip = new Tooltip();
  tip.bindTo(topbar);

  function applyTheme(name: keyof typeof THEMES) {
    const t = THEMES[name];
    document.documentElement.dataset.theme = t.attr;
    monaco.editor.setTheme(t.monaco);
  }

  applyTheme("dark");
  themeSel.value = "dark";
  themeSel.onchange = () => applyTheme(themeSel.value as keyof typeof THEMES);

  const {
    leftEditor,
    rightEditor,
    dispose,
    getRightViewState,
    restoreRightViewState,
  } = createEditors(leftEdHost, rightEdHost);

  const deco = new Decorations(leftEditor, rightEditor);

  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    leftEditor.setValue(text);
    rightEditor.setValue("");
    deco.clearAll();
    statusBar.textContent = `已打开：${f.name}（${text.length} 字符）`;
    fileInput.value = "";
  };

  btnSave.onclick = () => {
    const out = rightEditor.getValue();
    downloadText("output.fullwidth.md", out);
  };

  btnPreview.onclick = () => {
    const src = leftEditor.getValue();
    const options = getOptionsFromUI(container);
    const view = getRightViewState();

    const t0 = performance.now();
    const { text: out, stats } = processMarkdown(src, options);
    const t1 = performance.now();

    rightEditor.setValue(out);
    deco.setSkips(stats.skip_ranges_out);

    const { rightMarks, leftMarks } = computeChangedMarks(src, out, stats.change_marks_out);
    deco.setDiff(rightMarks, leftMarks);

    restoreRightViewState(view);

    statusBar.textContent = `${stats.summary || "完成"} | 用时 ${(t1 - t0).toFixed(1)}ms`;
  };

  window.addEventListener("beforeunload", () => dispose());
}
