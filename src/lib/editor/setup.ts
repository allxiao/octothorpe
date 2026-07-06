import { EditorView, keymap, drawSelection, rectangularSelection,
  highlightActiveLine } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { EditorState, EditorSelection } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdownLang } from "./markdownLang";
import { htmlTagComplete } from "./htmlComplete";
import { COMMANDS } from "./commands";
import { autoTable, enterTableUp, enterTableDown } from "./commands/table";
import { autoCodeFence, autoMathBlock, autoHtmlBlock, codeFenceBackspace, codeLangDown, codeLangRight, mathBlockDown, mathBlockUp, htmlBlockDown, htmlBlockUp, MATH_FENCE_RE } from "./commands/block";
import { FENCE_RE } from "./commands/code";
import { isRowLine, isDelimiterRow } from "./commands/table";

/**
 * Keep a caret-reachable line after a code block or table that ends the
 * document: both render as collapsed/atomic blocks, so without a trailing line
 * there'd be nowhere below them to place the caret.
 */
const ensureLineAfterTrailingBlock = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const doc = tr.newDoc;
  const lastN = doc.lines;
  const lastText = doc.line(lastN).text;
  let needsLine = false;
  if (FENCE_RE.test(lastText)) {
    // Code fence: append only when it closes a block (even number of fences).
    let fences = 0;
    for (let n = 1; n <= lastN; n++) if (FENCE_RE.test(doc.line(n).text)) fences++;
    needsLine = fences % 2 === 0;
  } else if (MATH_FENCE_RE.test(lastText)) {
    // `$$` math block: append when it closes a block (even number of delimiters).
    let marks = 0;
    for (let n = 1; n <= lastN; n++) if (MATH_FENCE_RE.test(doc.line(n).text)) marks++;
    needsLine = marks % 2 === 0;
  } else if (isRowLine(lastText)) {
    // GFM table: a contiguous run of rows ending the doc, with a delimiter row.
    let top = lastN;
    while (top > 1 && isRowLine(doc.line(top - 1).text)) top--;
    let hasDelim = false;
    for (let k = top; k <= lastN; k++)
      if (isDelimiterRow(doc.line(k).text)) {
        hasDelim = true;
        break;
      }
    needsLine = hasDelim && lastN - top >= 1;
  } else if (/^\s*(<\/[a-zA-Z][\w-]*>|-->|<(?:hr|br|img)\b[^>]*>)\s*$/i.test(lastText)) {
    // Block HTML ending the document: a lone closing tag (`</div>`), a comment
    // end (`-->`), or a self-contained void block (`<hr>`) renders as an atomic
    // widget — keep a line below it to place the caret. (Conservative: a lone
    // line, so inline `</kbd>` inside a paragraph isn't matched.)
    needsLine = true;
  }
  if (!needsLine) return tr;
  return [tr, { changes: { from: doc.length, insert: "\n" }, sequential: true }];
});

// On a link reference definition line `[name]: url `, typing the first title
// character after the URL's trailing space auto-wraps it in quotes, leaving the
// caret inside — so `… url ` + `T` becomes `… url "T|"`.
const DEF_AWAITING_TITLE = /^\s*\[[^\]]*\]:[ \t]*\S+[ \t]+$/;
const autoQuoteRefTitle = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || text.length !== 1 || text === '"' || /\s/.test(text)) return false;
  const line = view.state.doc.lineAt(from);
  if (from !== line.to || !DEF_AWAITING_TITLE.test(line.text)) return false;
  view.dispatch({
    changes: { from, insert: `"${text}"` },
    selection: { anchor: from + 1 + text.length },
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
});

// Paragraph-menu keybindings (editor-scoped). Placed before defaultKeymap so
// list Indent/Outdent override CodeMirror's Mod-]/Mod-[.
const PARAGRAPH_KEYS: { key: string; id: string }[] = [
  { key: "Mod-1", id: "heading1" },
  { key: "Mod-2", id: "heading2" },
  { key: "Mod-3", id: "heading3" },
  { key: "Mod-4", id: "heading4" },
  { key: "Mod-5", id: "heading5" },
  { key: "Mod-6", id: "heading6" },
  { key: "Mod-0", id: "paragraph" },
  { key: "Mod-=", id: "headingIncrease" },
  { key: "Mod--", id: "headingDecrease" },
  { key: "Mod-Shift-m", id: "mathBlock" },
  { key: "Mod-Shift-k", id: "codeFence" },
  { key: "Mod-Shift-q", id: "quote" },
  { key: "Mod-Shift-[", id: "listOrdered" },
  { key: "Mod-Shift-]", id: "listUnordered" },
  { key: "Mod-Shift-x", id: "listTask" },
  { key: "Mod-]", id: "indent" },
  { key: "Mod-[", id: "outdent" },
  { key: "Mod-t", id: "tableInsert" },
];

const paragraphKeymap = PARAGRAPH_KEYS.map(({ key, id }) => ({
  key,
  preventDefault: true,
  run: (view: EditorView) => COMMANDS[id](view),
}));

/**
 * Tab inserts spaces up to the next tab stop — a multiple of the indent size
 * (Editor / Indent Size) measured from the line start. Mid-line it aligns the
 * caret to the next stop (e.g. size 4: `abc` + Tab → `abc `, then → `abc     `);
 * at the line start it inserts a full unit, i.e. one indentation level. With a
 * non-empty selection it indents the covered lines instead (`indentMore`);
 * Shift-Tab outdents.
 *
 * This replaces `indentWithTab`, whose Tab always indented the whole line
 * regardless of caret position.
 */
function insertIndentAtCaret(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  const size = state.tabSize;
  view.dispatch(
    state.changeByRange((range) => {
      const col = range.head - state.doc.lineAt(range.head).from;
      const n = size - (col % size); // spaces to the next tab stop (1..size)
      return {
        changes: { from: range.head, insert: " ".repeat(n) },
        range: EditorSelection.cursor(range.head + n),
      };
    }),
    { scrollIntoView: true, userEvent: "input" },
  );
  return true;
}

// Table-navigation keys: only consume the key when the caret is in a table (the
// command returns false otherwise), so they fall through to CodeMirror defaults.
const TABLE_KEYS: { key: string; id: string }[] = [
  { key: "Mod-Enter", id: "tableAddRowBelow" },
  { key: "Alt-ArrowLeft", id: "tableMoveColLeft" },
  { key: "Alt-ArrowRight", id: "tableMoveColRight" },
  { key: "Mod-Shift-Backspace", id: "tableDeleteRow" },
];

const tableKeymap = TABLE_KEYS.map(({ key, id }) => ({
  key,
  run: (view: EditorView) => COMMANDS[id](view),
}));

// Format-menu keybindings. Before defaultKeymap so Mod-i overrides its
// selectParentSyntax binding.
const FORMAT_KEYS: { key: string; id: string }[] = [
  { key: "Mod-b", id: "toggleBold" },
  { key: "Mod-i", id: "toggleItalic" },
  { key: "Mod-u", id: "toggleUnderline" },
  { key: "Mod-Shift-`", id: "toggleCode" },
  { key: "Alt-Shift-5", id: "toggleStrike" },
  { key: "Mod-k", id: "toggleLink" },
  { key: "Mod-\\", id: "clearFormat" },
];

const formatKeymap = FORMAT_KEYS.map(({ key, id }) => ({
  key,
  preventDefault: true,
  run: (view: EditorView) => COMMANDS[id](view),
}));

/**
 * Base CodeMirror extensions shared by the editor. The live-preview decoration
 * layer (M1) will be layered on top of this; for M0 this is a plain, wrapped
 * Markdown source editor.
 */
/**
 * Base CodeMirror extensions shared by the editor. The live-preview layer is
 * added separately by EditorHost (via a compartment, so source-code mode can
 * toggle it).
 */
export function baseExtensions(onSave?: () => void): Extension[] {
  return [
    history(),
    drawSelection(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdownLang(),
    ensureLineAfterTrailingBlock,
    autoQuoteRefTitle,
    htmlTagComplete,
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          onSave?.();
          return true;
        },
      },
      { key: "Tab", run: insertIndentAtCaret, shift: indentLess },
      { key: "Backspace", run: codeFenceBackspace },
      { key: "Enter", run: autoMathBlock },
      { key: "Enter", run: autoCodeFence },
      { key: "Enter", run: autoHtmlBlock },
      { key: "Enter", run: autoTable },
      { key: "ArrowUp", run: enterTableUp },
      { key: "ArrowDown", run: enterTableDown },
      { key: "ArrowDown", run: mathBlockDown },
      { key: "ArrowUp", run: mathBlockUp },
      { key: "ArrowDown", run: htmlBlockDown },
      { key: "ArrowUp", run: htmlBlockUp },
      { key: "ArrowDown", run: codeLangDown },
      { key: "ArrowRight", run: codeLangRight },
      ...paragraphKeymap,
      ...formatKeymap,
      ...tableKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}
