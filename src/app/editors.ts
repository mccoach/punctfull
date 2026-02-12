import * as monaco from "monaco-editor";

type ViewState = monaco.editor.ICodeEditorViewState | null;

export function createEditors(leftHost: HTMLElement, rightHost: HTMLElement) {
  // Monaco workers (minimal)
  (self as any).MonacoEnvironment = {
    getWorkerUrl(_moduleId: string, _label: string) {
      // Let Vite handle it
      return new URL("./monacoWorkerShim.js", import.meta.url).toString();
    }
  };

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

  const leftEditor = monaco.editor.create(leftHost, {
    ...baseOptions
  });

  const rightEditor = monaco.editor.create(rightHost, {
    ...baseOptions
  });

  // Scroll sync (two-way with lock)
  let syncing = false;

  function syncFrom(src: monaco.editor.IStandaloneCodeEditor, dst: monaco.editor.IStandaloneCodeEditor) {
    if (syncing) return;
    syncing = true;
    try {
      const top = src.getScrollTop();
      dst.setScrollTop(top);
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
