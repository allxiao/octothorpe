import { EditorView, keymap, drawSelection, rectangularSelection,
  highlightActiveLine } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdownLang } from "./markdownLang";
import { livePreview } from "./livePreview";

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
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}
