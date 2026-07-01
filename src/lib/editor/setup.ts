import { EditorView, keymap, drawSelection, rectangularSelection,
  highlightActiveLine } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdownLang } from "./markdownLang";
import { livePreview } from "./livePreview";
import { COMMANDS } from "./commands";
import { autoTable } from "./commands/table";

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

/**
 * Base CodeMirror extensions shared by the editor. The live-preview decoration
 * layer (M1) will be layered on top of this; for M0 this is a plain, wrapped
 * Markdown source editor.
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
    livePreview(),
    EditorView.lineWrapping,
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          onSave?.();
          return true;
        },
      },
      indentWithTab,
      { key: "Enter", run: autoTable },
      ...paragraphKeymap,
      ...tableKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}
