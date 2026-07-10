import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";
import { BlockMermaidWidget } from "./mermaidWidgets";
import { mermaidReadyEffect } from "../mermaid/render";

interface MermaidDecos {
  /** All decorations (idle renders + editing previews). */
  all: DecorationSet;
  /** Only the idle renders — atomic so the caret steps over them. */
  atomic: DecorationSet;
}

/**
 * Idle ```` ```mermaid ```` rendering, modelled on `mathField`: a block whose
 * caret is *outside* it is replaced by its rendered diagram (a block-crossing
 * replace decoration, which only a StateField can provide). When the caret is
 * inside, the plugin renders the editable code box and this field emits a live
 * preview below it.
 */
function build(state: EditorState): MermaidDecos {
  const doc = state.doc;
  const slice = (from: number, to: number) => doc.sliceString(from, to);
  const renders: Range<Decoration>[] = [];
  const previews: Range<Decoration>[] = [];

  // Idle: replace the whole block with its rendered diagram (atomic).
  const pushRender = (
    from: number,
    to: number,
    source: string,
    enterPos: number,
    insertLine: boolean,
  ) => {
    renders.push(
      Decoration.replace({
        widget: new BlockMermaidWidget(source, enterPos, insertLine),
        block: true,
      }).range(from, to),
    );
  };
  // Editing: a live preview rendered *below* the block (non-atomic block widget,
  // side 1, so it stays off the last line's caret position). `caretTarget` is
  // where a click on the preview drops the caret (the body's end).
  const pushPreview = (pos: number, source: string, caretTarget: number) => {
    previews.push(
      Decoration.widget({
        widget: new BlockMermaidWidget(source, -1, false, caretTarget),
        block: true,
        side: 1,
      }).range(pos),
    );
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return undefined;
      const n = node.node;
      const marks = n.getChildren("CodeMark");
      if (marks.length < 2) return false;
      const info = n.getChild("CodeInfo");
      if (!info || slice(info.from, info.to).trim() !== "mermaid") return false;
      const openLine = doc.lineAt(node.from);
      const closeLine = doc.lineAt(marks[marks.length - 1].from);
      const first = openLine.number + 1;
      const last = closeLine.number - 1;
      const source = first <= last ? slice(doc.line(first).from, doc.line(last).to) : "";
      if (isElementActive(state, node.from, node.to)) {
        // Editing: the code box is drawn by the live-preview plugin; add only the
        // preview below it.
        if (source.trim()) pushPreview(closeLine.to, source, doc.line(last).to);
        return false;
      }
      const enterPos = first <= last ? doc.line(first).from : openLine.to;
      pushRender(openLine.from, closeLine.to, source, enterPos, first > last);
      return false;
    },
  });

  return {
    all: Decoration.set([...renders, ...previews], true),
    atomic: Decoration.set(renders, true),
  };
}

export const mermaidField = StateField.define<MermaidDecos>({
  create: (state) => build(state),
  // Rebuild on edits, caret moves, and when an async render lands (the ready
  // effect) so the placeholder is swapped for the finished diagram.
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.some((e) => e.is(mermaidReadyEffect))
    ) {
      return build(tr.state);
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.all),
    // Only idle renders are atomic (the caret steps over them); previews are not,
    // so they never interfere with editing the box above them.
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

/** Document ranges currently covered by an idle mermaid render (for keyboard
 *  entry / passes that should skip them). */
export function mermaidBlockRanges(state: EditorState): { from: number; to: number }[] {
  const value = state.field(mermaidField, false);
  if (!value) return [];
  const out: { from: number; to: number }[] = [];
  const it = value.atomic.iter();
  while (it.value) {
    out.push({ from: it.from, to: it.to });
    it.next();
  }
  return out;
}
