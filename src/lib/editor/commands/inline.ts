// Inline formatting (Format menu): toggle bold/italic/underline/code/math/
// strike/comment/link and clear formatting, plus inlineState() for menu
// checkmarks. Toggles unwrap precisely via the syntax tree when the caret is
// inside a formatted span, and otherwise wrap/strip the selection.

import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";

export interface InlineState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
  link: boolean;
  linkUrl: string | null;
}

const LINK_RE = /^\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/;

/** Detect the inline formats enclosing the caret (for menu checkmarks / links). */
export function inlineState(state: EditorState): InlineState {
  const s: InlineState = {
    bold: false,
    italic: false,
    code: false,
    strike: false,
    link: false,
    linkUrl: null,
  };
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(state.selection.main.head, -1);
  while (node) {
    switch (node.name) {
      case "StrongEmphasis": s.bold = true; break;
      case "Emphasis": s.italic = true; break;
      case "InlineCode": s.code = true; break;
      case "Strikethrough": s.strike = true; break;
      case "Link": {
        s.link = true;
        s.linkUrl = LINK_RE.exec(state.sliceDoc(node.from, node.to))?.[2] ?? null;
        break;
      }
    }
    node = node.parent;
  }
  return s;
}

/** Nearest ancestor node with `name` at `pos`, or null. */
function findNode(state: EditorState, pos: number, name: string): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === name) return node;
    node = node.parent;
  }
  return null;
}

/** Remove a node's first and last marker children (e.g. the `**` of bold). */
function stripMarks(view: EditorView, node: SyntaxNode, mark: string): boolean {
  const marks = node.getChildren(mark);
  if (marks.length < 2) return false;
  const first = marks[0];
  const last = marks[marks.length - 1];
  view.dispatch({
    changes: [
      { from: first.from, to: first.to, insert: "" },
      { from: last.from, to: last.to, insert: "" },
    ],
  });
  view.focus();
  return true;
}

/** A toggle for a symmetric/asymmetric marker pair, with optional tree-based unwrap. */
function toggleMarker(open: string, close: string, node?: { name: string; mark: string }) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const sel = state.selection.main;

    // Caret inside a matching span → unwrap precisely.
    if (node) {
      const n = findNode(state, sel.head, node.name);
      if (n) return stripMarks(view, n, node.mark);
    }

    const { from, to } = sel;
    const inner = state.sliceDoc(from, to);
    const before = state.sliceDoc(Math.max(0, from - open.length), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + close.length));

    // Selection flanked by the markers → remove them.
    if (from !== to && before === open && after === close) {
      view.dispatch({
        changes: [
          { from: from - open.length, to: from, insert: "" },
          { from: to, to: to + close.length, insert: "" },
        ],
        selection: { anchor: from - open.length, head: to - open.length },
      });
      view.focus();
      return true;
    }
    // Selection already includes the markers → strip them.
    if (from !== to && inner.startsWith(open) && inner.endsWith(close) &&
        inner.length >= open.length + close.length) {
      const stripped = inner.slice(open.length, inner.length - close.length);
      view.dispatch({
        changes: { from, to, insert: stripped },
        selection: { anchor: from, head: from + stripped.length },
      });
      view.focus();
      return true;
    }
    // Otherwise wrap (collapsed caret → empty markers with the caret between).
    view.dispatch({
      changes: { from, to, insert: open + inner + close },
      selection: { anchor: from + open.length, head: to + open.length },
    });
    view.focus();
    return true;
  };
}

export const toggleBold = toggleMarker("**", "**", { name: "StrongEmphasis", mark: "EmphasisMark" });
export const toggleItalic = toggleMarker("*", "*", { name: "Emphasis", mark: "EmphasisMark" });
export const toggleCode = toggleMarker("`", "`", { name: "InlineCode", mark: "CodeMark" });
export const toggleStrike = toggleMarker("~~", "~~", { name: "Strikethrough", mark: "StrikethroughMark" });
export const toggleMath = toggleMarker("$", "$");
export const toggleUnderline = toggleMarker("<u>", "</u>");
export const toggleComment = toggleMarker("<!-- ", " -->");

export function toggleLink(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const n = findNode(state, sel.head, "Link");
  if (n) {
    const text = /^\[([^\]]*)\]/.exec(state.sliceDoc(n.from, n.to))?.[1] ?? "";
    view.dispatch({
      changes: { from: n.from, to: n.to, insert: text },
      selection: { anchor: n.from, head: n.from + text.length },
    });
    view.focus();
    return true;
  }
  const { from, to } = sel;
  const inner = state.sliceDoc(from, to);
  if (from !== to) {
    view.dispatch({
      changes: { from, to, insert: `[${inner}]()` },
      selection: { anchor: from + `[${inner}](`.length }, // caret in the ()
    });
  } else {
    view.dispatch({ changes: { from, to, insert: "[]()" }, selection: { anchor: from + 1 } });
  }
  view.focus();
  return true;
}

const INLINE_NODES = new Set(["Emphasis", "StrongEmphasis", "InlineCode", "Strikethrough", "Link"]);

function stripInlineMarkers(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/<\/?u>/g, "") // underline
    .replace(/(\*\*|__)([\s\S]+?)\1/g, "$2") // bold
    .replace(/(\*|_)([\s\S]+?)\1/g, "$2") // italic
    .replace(/~~([\s\S]+?)~~/g, "$1") // strike
    .replace(/`+([^`]+)`+/g, "$1") // inline code
    .replace(/\$([^$]+)\$/g, "$1"); // math
}

/** Remove inline formatting from the selection (or the enclosing span / line). */
export function clearFormat(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  let { from, to } = sel;
  if (from === to) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, -1);
    while (node && !INLINE_NODES.has(node.name)) node = node.parent;
    if (node) {
      from = node.from;
      to = node.to;
    } else {
      const line = state.doc.lineAt(from);
      from = line.from;
      to = line.to;
    }
  }
  const cleaned = stripInlineMarkers(state.sliceDoc(from, to));
  view.dispatch({
    changes: { from, to, insert: cleaned },
    selection: { anchor: from, head: from + cleaned.length },
  });
  view.focus();
  return true;
}
