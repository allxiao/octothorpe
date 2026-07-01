import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { findTables } from "../commands/table";
import { TableWidget } from "./TableWidget";

// Tables are replaced by editable block widgets. Block/line-crossing replace
// decorations must come from a StateField (a ViewPlugin can't provide them).
function build(state: EditorState): DecorationSet {
  const ranges = findTables(state, 0, state.doc.length).map((t) =>
    Decoration.replace({ widget: new TableWidget(t.md, t.from, t.to), block: true }).range(
      t.from,
      t.to,
    ),
  );
  return Decoration.set(ranges, true);
}

export const tableField = StateField.define<DecorationSet>({
  create: (state) => build(state),
  update(deco, tr) {
    return tr.docChanged ? build(tr.state) : deco;
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    // Make the whole table atomic so the caret steps over it (edit via cells).
    EditorView.atomicRanges.of((view) => view.state.field(f)),
  ],
});

/** The document ranges currently covered by table widgets (for the inline pass to skip). */
export function tableRanges(state: EditorState): { from: number; to: number }[] {
  const set = state.field(tableField, false);
  if (!set) return [];
  const out: { from: number; to: number }[] = [];
  const it = set.iter();
  while (it.value) {
    out.push({ from: it.from, to: it.to });
    it.next();
  }
  return out;
}
