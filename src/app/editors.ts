import * as monaco from "monaco-editor";

type ViewState = monaco.editor.ICodeEditorViewState | null;

function ensureMonacoWorkerEnvironment() {
  (self as any).MonacoEnvironment = {
    getWorkerUrl(_moduleId: string, _label: string) {
      return new URL("./monacoWorkerShim.js", import.meta.url).toString();
    }
  };
}

function syncScrollTop(
  src: monaco.editor.IStandaloneCodeEditor,
  dst: monaco.editor.IStandaloneCodeEditor,
) {
  dst.setScrollTop(src.getScrollTop());
}

export function createEditors(leftHost: HTMLElement, rightHost: HTMLElement) {
  ensureMonacoWorkerEnvironment();

  const baseOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    language: "markdown",
    wordWrap: "on",
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 14,
    scrollBeyondLastLine: false,
    renderWhitespace: "selection",
    bracketPairColorization: { enabled: false }
  };

  const leftEditor = monaco.editor.create(leftHost, baseOptions);
  const rightEditor = monaco.editor.create(rightHost, baseOptions);

  let syncing = false;

  function syncFrom(src: monaco.editor.IStandaloneCodeEditor, dst: monaco.editor.IStandaloneCodeEditor) {
    if (syncing) return;

    syncing = true;
    try {
      syncScrollTop(src, dst);
    } finally {
      syncing = false;
    }
  }

  const d1 = leftEditor.onDidScrollChange(() => syncFrom(leftEditor, rightEditor));
  const d2 = rightEditor.onDidScrollChange(() => syncFrom(rightEditor, leftEditor));

  function getRightViewState(): ViewState {
    return rightEditor.saveViewState();
  }

  function restoreRightViewState(v: ViewState) {
    if (!v) return;
    rightEditor.restoreViewState(v);
    rightEditor.focus();
  }

  function dispose() {
    d1.dispose();
    d2.dispose();
    leftEditor.dispose();
    rightEditor.dispose();
  }

  return { leftEditor, rightEditor, getRightViewState, restoreRightViewState, dispose };
}
