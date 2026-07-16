import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { markdownLang } from "../markdownLang";
import { livePreviewPlugin, livePreviewTheme } from "./index";
import {
  inlineOnly,
  imageBaseDir,
  inlineMathRender,
  inlineMathDisplayStyle,
  renderHtml,
  renderSubscript,
  renderSuperscript,
  renderHighlight,
  renderEmoji,
  revealSimpleSource,
} from "./config";
import { linkRefsOverride, type LinkRef } from "./linkRefs";

/**
 * A tiny, single-line CodeMirror editor mounted inside a focused table cell. It
 * runs the SAME live-preview decoration engine as the main document but in
 * `inlineOnly` mode (block markers stay literal), so a cell gets Typora-style
 * element-level reveal for free: only the inline element under the caret shows
 * its raw Markdown; the rest stays rendered. Its selection is cell-local, so
 * `isElementActive` works without touching the main document.
 *
 * Only inline extensions are included — none of the block StateFields, global
 * plugins, or block keymaps of the main editor — so it can't collide with it.
 */
export interface CellEditorOpts {
  baseDir: string;
  displaystyle: boolean;
  /** The main document's link reference definitions, so `[text][id]` in the cell
   *  resolves against the whole document rather than the cell's own (empty) doc. */
  linkRefs: Map<string, LinkRef>;
}

/** Callbacks the cell editor invokes; the TableWidget owns cell geometry. */
export interface CellEditorHandlers {
  onInput: (src: string) => void;
  tab: (back: boolean) => void; // Tab / Shift-Tab → next / previous cell
  enter: () => void; // Enter → cell below (append row at the end)
  escape: () => void; // Esc → leave the table into the document
  up: () => void;
  down: () => void;
  left: () => void; // only at the cell's start
  right: () => void; // only at the cell's end
}

const caretAtStart = (v: EditorView) => {
  const s = v.state.selection.main;
  return s.empty && s.head === 0;
};
const caretAtEnd = (v: EditorView) => {
  const s = v.state.selection.main;
  return s.empty && s.head === v.state.doc.length;
};

/**
 * Up/Down: a cell is a single source line but can span multiple *visual* rows
 * (word-wrap or a `<br/>` break). Move the caret to the previous/next visual row
 * when there is one; only step to the adjacent cell (`nav`) when the caret is
 * already on the cell's first (Up) / last (Down) visual row. The row is detected
 * by comparing the caret's coords to those of the cell's very start/end — robust
 * even when the caret's column is past the end of the target row.
 */
function moveWithinOrNav(v: EditorView, forward: boolean, nav: () => void): boolean {
  const sel = v.state.selection.main;
  const cur = v.coordsAtPos(sel.head);
  const edge = v.coordsAtPos(forward ? v.state.doc.length : 0);
  if (cur && edge) {
    const onEdgeRow = forward ? cur.bottom >= edge.bottom - 2 : cur.top <= edge.top + 2;
    if (!onEdgeRow) {
      v.dispatch({ selection: v.moveVertically(sel, forward), scrollIntoView: true });
      return true;
    }
  }
  nav();
  return true;
}

/** Keep the cell to one line: Enter navigates (handled below), and any edit that
 *  would introduce a newline (e.g. a multi-line paste) is flattened to spaces. */
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines <= 1) return tr;
  const flat = tr.newDoc.toString().replace(/\r?\n+/g, " ");
  return {
    changes: { from: 0, to: tr.startState.doc.length, insert: flat },
    selection: { anchor: flat.length },
  };
});

// Make the nested editor look like inline text inside the cell (no chrome, no
// line padding, inherit the cell's font/size). Highest precedence so it beats the
// main livePreviewTheme's `.cm-line` padding.
const cellChrome = Prec.highest(
  EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      fontSize: "inherit",
      fontFamily: "inherit",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible" },
    ".cm-content": { padding: "0", minHeight: "0", caretColor: "var(--text, currentColor)" },
    ".cm-line": { padding: "0" },
  }),
);

export function mountCellEditor(
  host: HTMLElement,
  source: string,
  opts: CellEditorOpts,
  handlers: CellEditorHandlers,
): EditorView {
  const cellKeymap = Prec.highest(
    keymap.of([
      { key: "Tab", run: () => (handlers.tab(false), true), shift: () => (handlers.tab(true), true) },
      { key: "Enter", run: () => (handlers.enter(), true) },
      // Shift-Enter → a hard line break inside the cell (rendered as `<br>`).
      { key: "Shift-Enter", run: (v) => (v.dispatch(v.state.replaceSelection("<br/>")), true) },
      { key: "Escape", run: () => (handlers.escape(), true) },
      { key: "ArrowUp", run: (v) => moveWithinOrNav(v, false, handlers.up) },
      { key: "ArrowDown", run: (v) => moveWithinOrNav(v, true, handlers.down) },
      { key: "ArrowLeft", run: (v) => (caretAtStart(v) ? (handlers.left(), true) : false) },
      { key: "ArrowRight", run: (v) => (caretAtEnd(v) ? (handlers.right(), true) : false) },
    ]),
  );

  return new EditorView({
    parent: host,
    doc: source,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle),
      markdownLang(),
      livePreviewPlugin,
      inlineOnly.of(true),
      imageBaseDir.of(opts.baseDir),
      linkRefsOverride.of(opts.linkRefs),
      inlineMathRender.of(true),
      inlineMathDisplayStyle.of(opts.displaystyle),
      renderHtml.of(true),
      renderSubscript.of(true),
      renderSuperscript.of(true),
      renderHighlight.of(true),
      renderEmoji.of(true),
      revealSimpleSource.of(true),
      livePreviewTheme,
      cellChrome,
      singleLine,
      cellKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) handlers.onInput(u.state.doc.toString());
      }),
    ],
  });
}
