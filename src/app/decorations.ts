import * as monaco from "monaco-editor";
import type { SkipRange } from "../core/types";

export type RangePair = { start: number; end: number };

function toMonacoRange(model: monaco.editor.ITextModel, startOffset: number, endOffset: number): monaco.Range {
  const s = model.getPositionAt(Math.max(0, startOffset));
  const e = model.getPositionAt(Math.max(0, endOffset));
  return new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column);
}

export class Decorations {
  private left: monaco.editor.IStandaloneCodeEditor;
  private right: monaco.editor.IStandaloneCodeEditor;

  private leftDiffIds: string[] = [];
  private rightDiffIds: string[] = [];
  private rightSkipIds: string[] = [];

  constructor(left: monaco.editor.IStandaloneCodeEditor, right: monaco.editor.IStandaloneCodeEditor) {
    this.left = left;
    this.right = right;
  }

  setDiff(outRangesOnRight: RangePair[], inRangesOnLeft: RangePair[]) {
    const leftModel = this.left.getModel();
    const rightModel = this.right.getModel();
    if (!leftModel || !rightModel) return;

    const leftDecos: monaco.editor.IModelDeltaDecoration[] = inRangesOnLeft
      .filter(r => r.end > r.start)
      .map(r => ({
        range: toMonacoRange(leftModel, r.start, r.end),
        options: {
          inlineClassName: "punctfull-diff-in",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }));

    const rightDecos: monaco.editor.IModelDeltaDecoration[] = outRangesOnRight
      .filter(r => r.end > r.start)
      .map(r => ({
        range: toMonacoRange(rightModel, r.start, r.end),
        options: {
          inlineClassName: "punctfull-diff-out",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }));

    this.leftDiffIds = leftModel.deltaDecorations(this.leftDiffIds, leftDecos);
    this.rightDiffIds = rightModel.deltaDecorations(this.rightDiffIds, rightDecos);
  }

  setSkip(skips: SkipRange[]) {
    const model = this.right.getModel();
    if (!model) return;

    const decos: monaco.editor.IModelDeltaDecoration[] = (skips || [])
      .filter(s => s.end > s.start)
      .map(s => ({
        range: toMonacoRange(model, s.start, s.end),
        options: {
          inlineClassName: "punctfull-skip",
          hoverMessage: [{ value: s.reason || "跳过区域（原因未知）" }],
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }));

    this.rightSkipIds = model.deltaDecorations(this.rightSkipIds, decos);
  }
}
