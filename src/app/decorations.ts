import * as monaco from "monaco-editor";
import type { MarkRange, SkipRange } from "../core/types";

export type RangePair = { start: number; end: number };

function toMonacoRange(
  model: monaco.editor.ITextModel,
  startOffset: number,
  endOffset: number,
): monaco.Range {
  const s = model.getPositionAt(Math.max(0, startOffset));
  const e = model.getPositionAt(Math.max(0, endOffset));
  return new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column);
}

function buildInlineDecorations(
  model: monaco.editor.ITextModel,
  ranges: Array<RangePair & { tip?: string }>,
  className: string,
  fallbackTip?: string,
): monaco.editor.IModelDeltaDecoration[] {
  return ranges
    .filter((r) => r.end > r.start)
    .map((r) => ({
      range: toMonacoRange(model, r.start, r.end),
      options: {
        inlineClassName: className,
        hoverMessage: [{ value: r.tip || fallbackTip || "" }],
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));
}

export class Decorations {
  private left: monaco.editor.IStandaloneCodeEditor;
  private right: monaco.editor.IStandaloneCodeEditor;

  private leftDiffIds: string[] = [];
  private rightDiffIds: string[] = [];
  private rightNegativeIds: string[] = [];
  private rightUncertainIds: string[] = [];

  constructor(left: monaco.editor.IStandaloneCodeEditor, right: monaco.editor.IStandaloneCodeEditor) {
    this.left = left;
    this.right = right;
  }

  clearAll() {
    const leftModel = this.left.getModel();
    const rightModel = this.right.getModel();
    if (!leftModel || !rightModel) return;

    this.leftDiffIds = leftModel.deltaDecorations(this.leftDiffIds, []);
    this.rightDiffIds = rightModel.deltaDecorations(this.rightDiffIds, []);
    this.rightNegativeIds = rightModel.deltaDecorations(this.rightNegativeIds, []);
    this.rightUncertainIds = rightModel.deltaDecorations(this.rightUncertainIds, []);
  }

  setDiff(outRangesOnRight: MarkRange[], inRangesOnLeft: MarkRange[]) {
    const leftModel = this.left.getModel();
    const rightModel = this.right.getModel();
    if (!leftModel || !rightModel) return;

    const leftDecos = buildInlineDecorations(
      leftModel,
      inRangesOnLeft,
      "punctfull-diff-in",
      "已修改",
    );

    const rightDecos = buildInlineDecorations(
      rightModel,
      outRangesOnRight,
      "punctfull-diff-out",
      "已修改",
    );

    this.leftDiffIds = leftModel.deltaDecorations(this.leftDiffIds, leftDecos);
    this.rightDiffIds = rightModel.deltaDecorations(this.rightDiffIds, rightDecos);
  }

  setSkips(skips: SkipRange[]) {
    const model = this.right.getModel();
    if (!model) return;

    const negative = skips.filter((s) => s.kind === "negative");
    const uncertain = skips.filter((s) => s.kind === "uncertain");

    const toDecos = (
      ranges: SkipRange[],
      className: string,
    ): monaco.editor.IModelDeltaDecoration[] =>
      ranges
        .filter((s) => s.end > s.start)
        .map((s) => ({
          range: toMonacoRange(model, s.start, s.end),
          options: {
            inlineClassName: className,
            hoverMessage: [{ value: s.reason }],
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }));

    this.rightNegativeIds = model.deltaDecorations(
      this.rightNegativeIds,
      toDecos(negative, "punctfull-skip-negative"),
    );

    this.rightUncertainIds = model.deltaDecorations(
      this.rightUncertainIds,
      toDecos(uncertain, "punctfull-skip-uncertain"),
    );
  }
}
