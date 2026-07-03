// Block-level commands: blockquote toggle, and inserting math/code/alert/rule/
// TOC/front-matter/link-reference/footnote/paragraph blocks.

import type { EditorView } from "@codemirror/view";
import { insertText, mapLines, markerGap, selectedLines } from "./util";
import { detectFence, FENCE_RE } from "./code";

const QUOTE_RE = /^(\s*)>\s?/;

export function quote(view: EditorView): boolean {
  const allOn = selectedLines(view.state).every((l) => QUOTE_RE.test(l.text));
  return mapLines(view, (text) => (allOn ? text.replace(QUOTE_RE, "$1") : ">" + markerGap(1) + text));
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

// A line that opens a fence: leading indent, the fence run, and an info string
// with no further fence chars (so a bare closing ``` on its own line isn't matched).
const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})([^`~]*)$/;

/** A line that is exactly a `$$` math-block delimiter (optional surrounding space). */
export const MATH_FENCE_RE = /^\s*\$\$\s*$/;

/**
 * Pressing Enter at the end of a just-typed opening `$$` auto-completes the
 * block: keep the opener, add a blank middle line (caret lands here), and a
 * closing `$$` — mirroring autoCodeFence. Returns false (so the default newline
 * applies) when the line isn't an unclosed `$$` opener.
 */
export function autoMathBlock(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false; // only at end of line
  if (!MATH_FENCE_RE.test(line.text)) return false;

  // Opening position? An even number of `$$` lines strictly above means this one
  // opens (odd would mean the caret sits inside an already-open block).
  let above = 0;
  for (let n = 1; n < line.number; n++) {
    if (MATH_FENCE_RE.test(state.doc.line(n).text)) above++;
  }
  if (above % 2 !== 0) return false;

  // Already closed by a `$$` somewhere below? Then just insert a normal newline.
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    if (MATH_FENCE_RE.test(state.doc.line(n).text)) return false;
  }

  const indent = /^\s*/.exec(line.text)![0];
  // The closing `$$` lands at EOF here; a transaction filter guarantees a line
  // after it so the caret can still leave the block downward.
  const insert = "\n" + indent + "\n" + indent + "$$";
  const anchor = line.to + 1 + indent.length; // start of the blank middle line
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor }, scrollIntoView: true });
  view.focus();
  return true;
}

/**
 * Pressing Enter at the end of a just-typed opening fence (``` or ```lang)
 * auto-completes the block: keep the opener, add a blank middle line (caret
 * lands here), and a closing fence — all at the opener's indentation so a fence
 * opened inside an indented list nests correctly. Returns false (falling through
 * to autoTable / the default newline) when the line isn't an unclosed opener.
 */
export function autoCodeFence(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false; // only at end of line
  const m = OPEN_FENCE_RE.exec(line.text);
  if (!m) return false;

  // Opening position? An even number of fence lines strictly above means this
  // one opens (odd would mean the caret sits inside an already-open block).
  let above = 0;
  for (let n = 1; n < line.number; n++) {
    if (FENCE_RE.test(state.doc.line(n).text)) above++;
  }
  if (above % 2 !== 0) return false;

  // Already closed by a fence somewhere below? Then just insert a normal newline.
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    if (FENCE_RE.test(state.doc.line(n).text)) return false;
  }

  const indent = m[1];
  const fence = m[2];
  // The closing fence lands at EOF here; a transaction filter guarantees a line
  // after it so the caret can still leave the block downward.
  const insert = "\n" + indent + "\n" + indent + fence;
  const anchor = line.to + 1 + indent.length; // start of the blank middle line
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor }, scrollIntoView: true });
  view.focus();
  return true;
}

/**
 * Focus the language picker input of the terminated fenced block on line
 * `closeLine`. Returns false if no picker is rendered there (e.g. not yet
 * terminated), letting the arrow key fall through to its default.
 */
function focusCodeLang(view: EditorView, closeLine: number): boolean {
  const pos = view.state.doc.line(closeLine).from;
  const { node } = view.domAtPos(pos);
  const start = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
  const input = (start?.closest?.(".cm-md-code-lang")?.querySelector(".cm-md-code-lang-input") ??
    start?.closest?.(".cm-line")?.querySelector(".cm-md-code-lang-input")) as
    | HTMLInputElement
    | null;
  if (!input) return false;
  input.focus();
  const n = input.value.length;
  try {
    input.setSelectionRange(n, n);
  } catch {
    /* not selectable */
  }
  return true;
}

/** True when the caret is on the last content line of a terminated fenced block. */
function onLastCodeLine(state: EditorView["state"]): number | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const f = detectFence(state);
  if (!f || f.closeLine === f.openLine) return null;
  if (!FENCE_RE.test(state.doc.line(f.closeLine).text)) return null; // unterminated
  if (state.doc.lineAt(sel.head).number !== f.closeLine - 1) return null;
  return f.closeLine;
}

/** Down on the last code line jumps into the language picker. */
export function codeLangDown(view: EditorView): boolean {
  const closeLine = onLastCodeLine(view.state);
  if (closeLine == null) return false;
  return focusCodeLang(view, closeLine);
}

/** Right at the end of the last code line jumps into the language picker. */
export function codeLangRight(view: EditorView): boolean {
  const closeLine = onLastCodeLine(view.state);
  if (closeLine == null) return false;
  const sel = view.state.selection.main;
  if (sel.head !== view.state.doc.lineAt(sel.head).to) return false;
  return focusCodeLang(view, closeLine);
}

/**
 * Backspace at the very start of a fenced block's first content line: if the
 * block holds a single content line, strip the fences and leave that line as
 * plain text; if it holds several, do nothing (swallow the key) so the hidden
 * opening fence can't be merged into the content.
 */
export function codeFenceBackspace(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const f = detectFence(state);
  if (!f) return false;

  const line = state.doc.lineAt(sel.head);
  if (line.number !== f.openLine + 1) return false; // only the first content line
  if (sel.head !== line.from) return false; // only at its very start

  const closeText = state.doc.line(f.closeLine).text;
  const closed = f.closeLine !== f.openLine && FENCE_RE.test(closeText);
  const contentLines = closed ? f.closeLine - f.openLine - 1 : state.doc.lines - f.openLine;

  if (contentLines > 1) return true; // swallow: leave the block intact

  // Single content line → remove the fences, keep the line as plain text.
  const openLine = state.doc.line(f.openLine);
  const contentLine = state.doc.line(f.openLine + 1);
  const changes: { from: number; to: number }[] = [
    { from: openLine.from, to: contentLine.from }, // opener line + its newline
  ];
  if (closed) {
    const closeLine = state.doc.line(f.closeLine);
    changes.push({ from: contentLine.to, to: closeLine.to }); // newline + closing fence
  }
  view.dispatch({ changes, selection: { anchor: openLine.from }, scrollIntoView: true });
  view.focus();
  return true;
}
