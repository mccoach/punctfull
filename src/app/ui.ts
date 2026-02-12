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
  };
}

export function initUI(container: HTMLElement) {
  const topbar = el("div", "topbar");
  const main = el("div", "main");
  const footer = el("div", "footer");

  const grp1 = el("div", "group");
  const fileInput = el("input") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.accept = ".md,.markdown,.mdown,.mkd,.txt,*/*";

  const btnOpen = el("button") as HTMLButtonElement;
  btnOpen.textContent = "打开文件…";
  btnOpen.onclick = () => fileInput.click();

  const btnPreview = el("button") as HTMLButtonElement;
  btnPreview.textContent = "预览转换";

  const btnSave = el("button") as HTMLButtonElement;
  btnSave.textContent = "下载输出";

  grp1.append(btnOpen, btnPreview, btnSave);

  const grp2 = el("div", "group");
  grp2.innerHTML = `
  <label data-tip="把半角基础标点转换为全角：, . : ; ? !\n\n注意：仅在检测到中文语境（附近有中文/中文标点）时才触发；尽量避免影响纯英文段落。">
    <input id="opt_basic" type="checkbox" checked /> 基础标点
  </label>

  <label data-tip="把连续英文点号 ...（3 个或更多）转换为中文省略号 ……\n\n同样受中文语境触发限制；代码/链接等保护区不会动。">
    <input id="opt_ellipsis" type="checkbox" checked /> 省略号
  </label>

  <label data-tip="把连续强调标点做中文化：\n- !!! → ！！！\n- ??? → ？？？\n- ?! / !? → ？！ / ！？\n\n同样受中文语境触发限制。">
    <input id="opt_emph" type="checkbox" checked /> 连续/组合标点
  </label>

  <label data-tip="把恰好两个连字符 -- 转为中文破折号 ——\n\n并且做了一个保护：如果后面紧跟字母/数字/下划线（可能是参数/标识符），就不转换。">
    <input id="opt_dash" type="checkbox" checked /> 破折号
  </label>

  <label data-tip="把英文引号转换为中文引号：\n- \\" → “ ”（成对时）\n- '  → ‘ ’（更保守：排除英文缩写里的 apostrophe）\n\n奇数回退：如果某段候选引号数量为奇数，则该段一个都不转，只标记为“跳过原因”（右侧灰色并可悬浮查看）。">
    <input id="opt_quotes" type="checkbox" checked /> 引号
  </label>

  <label data-tip="括号语义转换（非常保守）：仅当括号内容看起来像“短中文解释”（例如：（术语））时，才把 ( ) 转为 （ ）\n\n技术性内容/链接/代码样式内容不会转换。">
    <input id="opt_parens" type="checkbox" checked /> 括号（语义）
  </label>

  <label data-tip="成对符号纠错（强保守，可选）：\n当检测到中文语境，并且段落不像技术文本时，尝试修正一些明显的成对符号错误，例如：\n- ““ → “”\n- ”” → “”\n- 段落内只出现两次同向符号时尝试补成对\n\n这是 legacy 修复器：有可能改到你不想改的地方，所以默认可开可关。">
    <input id="opt_fixpairs" type="checkbox" checked /> 成对符号纠错（保守）
  </label>
`;

  const grp3 = el("div", "group");
  const themeSel = el("select") as HTMLSelectElement;
  themeSel.innerHTML = `
    <option value="light">明亮</option>
    <option value="dark">暗色</option>
  `;
  const themeLabel = el("span");
  themeLabel.textContent = "配色：";
  grp3.append(themeLabel, themeSel);

  const status = el("div", "status");
  status.textContent =
    "就绪。提示：Monaco 自带 Ctrl+F 查找替换，F3 查找下一个。";

  topbar.append(grp1, grp2, grp3, status);

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

  footer.textContent =
    "离线说明：首次打开需要联网下载并缓存资源；之后断网也能打开并使用。本工具不上传任何内容。";

  container.append(topbar, main, footer);
  const tip = new Tooltip();
  tip.bindTo(topbar);


  function applyTheme(name: keyof typeof THEMES) {
    const t = THEMES[name];
    document.documentElement.dataset.theme = t.attr;
    monaco.editor.setTheme(t.monaco);
  }
  applyTheme("dark");
  themeSel.value = "dark";
  themeSel.onchange = () => applyTheme(themeSel.value as any);

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
    status.textContent = `已打开：${f.name}（${text.length} 字符）`;
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

    deco.setSkip(stats.skip_ranges_out);

    const outRanges = computeChangedRanges(src, out);
    const inRanges = computeChangedRanges(out, src);
    deco.setDiff(outRanges, inRanges);

    restoreRightViewState(view);

    status.textContent = `${stats.summary || "完成"} | 用时 ${(t1 - t0).toFixed(1)}ms`;
  };

  window.addEventListener("beforeunload", () => dispose());
}
