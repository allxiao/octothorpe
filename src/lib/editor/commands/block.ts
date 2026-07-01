// Block-level commands: blockquote toggle, and inserting math/code/alert/rule/
// TOC/front-matter/link-reference/footnote/paragraph blocks.

import type { EditorView } from "@codemirror/view";
import { insertText, mapLines, selectedLines } from "./util";

const QUOTE_RE = /^(\s*)>\s?/;

export function quote(view: EditorView): boolean {
  const allOn = selectedLines(view.state).every((l) => QUOTE_RE.test(l.text));
  return mapLines(view, (text) => (allOn ? text.replace(QUOTE_RE, "$1") : "> " + text));
}

export function mathBlock(view: EditorView): boolean {
  return insertText(view, "$$\n\n$$", 3); // caret on the empty middle line
}

export function codeFence(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) {
    const inner = state.sliceDoc(sel.from, sel.to);
    return insertText(view, "```\n" + inner + "\n```", 4);
  }
  return insertText(view, "```\n\n```", 4);
}

/** GFM alert block, e.g. `> [!NOTE]\n> `. */
export function alert(kind: string) {
  return (view: EditorView): boolean => insertText(view, `> [!${kind}]\n> `);
}

export function horizontalRule(view: EditorView): boolean {
  return insertText(view, "\n---\n\n");
}

export function tableOfContents(view: EditorView): boolean {
  return insertText(view, "[TOC]\n");
}

export function yamlFrontMatter(view: EditorView): boolean {
  const { state } = view;
  if (state.doc.sliceString(0, 3) === "---") {
    view.focus();
    return true;
  }
  view.dispatch({
    changes: { from: 0, insert: "---\n\n---\n\n" },
    selection: { anchor: 4 },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function linkReference(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const label = sel.empty ? "text" : state.sliceDoc(sel.from, sel.to);
  const ref = `[${label}][1]`;
  const def = `\n\n[1]: https://`;
  view.dispatch({
    changes: [
      { from: sel.from, to: sel.to, insert: ref },
      { from: state.doc.length, insert: def },
    ],
    selection: { anchor: sel.from + 1, head: sel.from + 1 + label.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function footnote(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  view.dispatch({
    changes: [
      { from: sel.from, to: sel.to, insert: "[^1]" },
      { from: state.doc.length, insert: "\n\n[^1]: " },
    ],
    selection: { anchor: state.doc.length + "\n\n[^1]: ".length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function insertParagraphBefore(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  view.dispatch({
    changes: { from: line.from, insert: "\n" },
    selection: { anchor: line.from },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function insertParagraphAfter(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  view.dispatch({
    changes: { from: line.to, insert: "\n" },
    selection: { anchor: line.to + 1 },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
