// Shared helpers for the paragraph/edit commands. Kept as small, mostly-pure
// functions so the transforms are easy to reason about and test.

import type { EditorView } from "@codemirror/view";
import type { ChangeSpec, EditorState, Line } from "@codemirror/state";

/** The lines spanned by the primary selection (inclusive). */
export function selectedLines(state: EditorState): Line[] {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines: Line[] = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  return lines;
}

/** Leading whitespace of a line. */
export function indentOf(text: string): string {
  return /^\s*/.exec(text)?.[0] ?? "";
}

/**
 * Rewrite each selected line through `fn`. The selection is re-anchored to cover
 * the rewritten lines so a follow-up command still applies to the same block.
 */
export function mapLines(view: EditorView, fn: (text: string, index: number) => string): boolean {
  const { state } = view;
  const lines = selectedLines(state);
  const changes: ChangeSpec[] = [];
  lines.forEach((line, i) => {
    const next = fn(line.text, i);
    if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  });
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

/**
 * Replace the selection with `text`. If `caretOffset` is given, the caret is
 * placed that many characters into the inserted text; otherwise it goes to the end.
 */
export function insertText(view: EditorView, text: string, caretOffset?: number): boolean {
  const sel = view.state.selection.main;
  const anchor = sel.from + (caretOffset ?? text.length);
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
