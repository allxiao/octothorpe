import { WidgetType, type EditorView } from "@codemirror/view";
import { gotoOrCreateFootnote } from "./footnotes";

/**
 * A footnote reference (`[^label]`) rendered as a superscript pill. Plain click
 * drops the caret at the reference so `isElementActive` reveals the raw source
 * for editing (like the emoji/link widgets); Ctrl/Cmd+click jumps to the
 * definition (creating an empty one if it's missing). References without a
 * definition carry a `missing` class so they read as unresolved.
 */
export class FootnoteRefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly from: number,
    readonly hasDef: boolean,
  ) {
    super();
  }
  eq(other: FootnoteRefWidget) {
    return other.label === this.label && other.from === this.from && other.hasDef === this.hasDef;
  }
  toDOM(view: EditorView) {
    const sup = document.createElement("sup");
    sup.className = "cm-md-footnote-ref" + (this.hasDef ? "" : " cm-md-footnote-ref-missing");
    sup.textContent = this.label;
    sup.setAttribute("data-label", this.label);
    sup.title = this.hasDef
      ? "Ctrl-click to jump to the definition"
      : "No definition — Ctrl-click to create one";
    sup.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        gotoOrCreateFootnote(view, this.label);
      } else {
        view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
        view.focus();
      }
    });
    return sup;
  }
  ignoreEvent() {
    return true;
  }
}
