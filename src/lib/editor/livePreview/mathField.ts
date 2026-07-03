import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";
import { BlockMathWidget } from "./mathWidgets";

/**
 * Idle block-math rendering: a `$$…$$` or ```` ```math ```` block whose caret is
 * *outside* it is replaced by its rendered display math. Block/line-crossing
 * replace decorations must come from a StateField (a ViewPlugin can't provide
 * them) — the same constraint that puts table rendering in a StateField. When
 * the caret is inside a block this field emits nothing; the live-preview plugin
 * then shows the editable code box plus a live preview below it.
 */
function build(state: EditorState): DecorationSet {
  const doc = state.doc;
  const slice = (from: number, to: number) => doc.sliceString(from, to);
  const ranges: Range<Decoration>[] = [];

  const push = (from: number, to: number, latex: string, enterPos: number, insertLine: boolean) => {
    ranges.push(
      Decoration.replace({
        widget: new BlockMathWidget(latex, enterPos, insertLine),
        block: true,
      }).range(from, to),
    );
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      const name = node.name;

      if (name === "BlockMath") {
        const marks = node.node.getChildren("BlockMathMark");
        if (marks.length < 2) return false; // still being typed
        if (isElementActive(state, node.from, node.to)) return false; // editing
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);
        const first = startLine.number + 1;
        const last = endLine.number - 1;
        const empty = first > last;
        const latex = empty ? "" : slice(doc.line(first).from, doc.line(last).to);
        // Non-empty: click drops the caret into the first body line. Empty
        // (`$$\n$$`): click inserts a blank line after the opener to type into.
        const enterPos = empty ? startLine.to : doc.line(first).from;
        push(startLine.from, endLine.to, latex, enterPos, empty);
        return false;
      }

      if (name === "FencedCode") {
        const n = node.node;
        const marks = n.getChildren("CodeMark");
        if (marks.length < 2) return false;
        const info = n.getChild("CodeInfo");
        if (!info || slice(info.from, info.to).trim() !== "math") return false;
        if (isElementActive(state, node.from, node.to)) return false;
        const openLine = doc.lineAt(node.from);
        const closeLine = doc.lineAt(marks[marks.length - 1].from);
        const first = openLine.number + 1;
        const last = closeLine.number - 1;
        const empty = first > last;
        const latex = empty ? "" : slice(doc.line(first).from, doc.line(last).to);
        const enterPos = empty ? openLine.to : doc.line(first).from;
        push(openLine.from, closeLine.to, latex, enterPos, empty);
        return false;
      }

      return undefined;
    },
  });

  return Decoration.set(ranges, true);
}

export const mathField = StateField.define<DecorationSet>({
  create: (state) => build(state),
  // Rebuild on edits and on caret moves (the caret entering/leaving a block
  // toggles between the rendered form and the editable box).
  update(deco, tr) {
    return tr.docChanged || tr.selection ? build(tr.state) : deco;
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    // A rendered block is atomic so the caret steps over it (click to edit).
    EditorView.atomicRanges.of((view) => view.state.field(f)),
  ],
});

/** Document ranges currently covered by an idle math render (for the inline
 *  pass / tag scan to skip). */
export function mathBlockRanges(state: EditorState): { from: number; to: number }[] {
  const set = state.field(mathField, false);
  if (!set) return [];
  const out: { from: number; to: number }[] = [];
  const it = set.iter();
  while (it.value) {
    out.push({ from: it.from, to: it.to });
    it.next();
  }
  return out;
}
