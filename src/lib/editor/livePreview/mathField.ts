import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";
import { BlockMathWidget } from "./mathWidgets";

interface MathDecos {
  /** All math block decorations (idle renders + editing previews). */
  all: DecorationSet;
  /** Only the idle renders — these are atomic so the caret steps over them. The
   *  editing previews are NOT atomic (they sit below an editable box and must not
   *  interfere with clicking/typing in it). */
  atomic: DecorationSet;
}

/**
 * Idle block-math rendering: a `$$…$$` or ```` ```math ```` block whose caret is
 * *outside* it is replaced by its rendered display math. Block/line-crossing
 * replace decorations must come from a StateField (a ViewPlugin can't provide
 * them) — the same constraint that puts table rendering in a StateField. When
 * the caret is inside a block this field emits a live preview below the (plugin-
 * rendered) editable box.
 */
function build(state: EditorState): MathDecos {
  const doc = state.doc;
  const slice = (from: number, to: number) => doc.sliceString(from, to);
  const renders: Range<Decoration>[] = [];
  const previews: Range<Decoration>[] = [];

  // Idle: replace the whole block with its rendered display math (atomic).
  const pushRender = (
    from: number,
    to: number,
    latex: string,
    enterPos: number,
    insertLine: boolean,
    hoverable: boolean,
  ) => {
    renders.push(
      Decoration.replace({
        widget: new BlockMathWidget(latex, enterPos, insertLine, hoverable),
        block: true,
      }).range(from, to),
    );
  };
  // Editing: a live preview rendered *below* the block. A non-atomic block widget
  // (not an inline one anchored to a content line) keeps it off the last line's
  // caret position and out of the way of clicks/typing in the box above it.
  // `caretTarget` is where a click on the preview drops the caret (the body's
  // end) so it never resolves to the invisible collapsed closing fence.
  const pushPreview = (pos: number, latex: string, caretTarget: number) => {
    previews.push(
      Decoration.widget({
        widget: new BlockMathWidget(latex, -1, false, false, caretTarget),
        block: true,
        side: 1,
      }).range(pos),
    );
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      const name = node.name;

      if (name === "BlockMath") {
        const marks = node.node.getChildren("BlockMathMark");
        if (marks.length < 2) return false; // still being typed
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);
        const first = startLine.number + 1;
        const last = endLine.number - 1;
        const latex = first <= last ? slice(doc.line(first).from, doc.line(last).to) : "";
        if (isElementActive(state, node.from, node.to)) {
          if (latex.trim()) pushPreview(endLine.to, latex, doc.line(last).to); // editing → preview below
          return false;
        }
        // Non-empty: click drops the caret into the first body line. Empty
        // (`$$\n$$`): click inserts a blank line after the opener to type into.
        const enterPos = first <= last ? doc.line(first).from : startLine.to;
        pushRender(startLine.from, endLine.to, latex, enterPos, first > last, true);
        return false;
      }

      // ```` ```math ```` renders as math when idle (like `$$`), but WITHOUT the
      // hover box/marker — it's a plain code block whose only extra is a preview
      // below its edit area while the caret is inside.
      if (name === "FencedCode") {
        const n = node.node;
        const marks = n.getChildren("CodeMark");
        if (marks.length < 2) return false;
        const info = n.getChild("CodeInfo");
        if (!info || slice(info.from, info.to).trim() !== "math") return false;
        const openLine = doc.lineAt(node.from);
        const closeLine = doc.lineAt(marks[marks.length - 1].from);
        const first = openLine.number + 1;
        const last = closeLine.number - 1;
        const latex = first <= last ? slice(doc.line(first).from, doc.line(last).to) : "";
        if (isElementActive(state, node.from, node.to)) {
          // Editing: the code box is rendered by the live-preview plugin; add
          // only the preview below it.
          if (latex.trim()) pushPreview(closeLine.to, latex, doc.line(last).to);
          return false;
        }
        const enterPos = first <= last ? doc.line(first).from : openLine.to;
        pushRender(openLine.from, closeLine.to, latex, enterPos, first > last, false);
        return false;
      }

      return undefined;
    },
  });

  return {
    all: Decoration.set([...renders, ...previews], true),
    atomic: Decoration.set(renders, true),
  };
}

export const mathField = StateField.define<MathDecos>({
  create: (state) => build(state),
  // Rebuild on edits and on caret moves (the caret entering/leaving a block
  // toggles between the rendered form and the editable box).
  update(value, tr) {
    return tr.docChanged || tr.selection ? build(tr.state) : value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.all),
    // Only the idle renders are atomic (the caret steps over them); previews are
    // not, so they never interfere with editing the box above them.
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

/** Document ranges currently covered by an idle math render (for the inline
 *  pass / tag scan to skip). */
export function mathBlockRanges(state: EditorState): { from: number; to: number }[] {
  const value = state.field(mathField, false);
  if (!value) return [];
  const out: { from: number; to: number }[] = [];
  const it = value.atomic.iter();
  while (it.value) {
    out.push({ from: it.from, to: it.to });
    it.next();
  }
  return out;
}
