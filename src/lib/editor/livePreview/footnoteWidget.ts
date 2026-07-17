import { WidgetType, type EditorView } from "@codemirror/view";
import { gotoOrCreateFootnote } from "./footnotes";

/**
 * A footnote reference (`[^label]`) rendered as a superscript pill. Plain click
 * drops the caret at the reference so `isElementActive` reveals the raw source
 * for editing (like the emoji/link widgets); Ctrl/Cmd+click jumps to the
 * definition (creating an empty one if it's missing). The definition's text (when
 * present) rides in the native `title`, so hovering shows a built-in tooltip like
 * a link title; references without a definition carry a `missing` class instead.
 */
export class FootnoteRefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly from: number,
    /** The definition's content text, or null when the footnote is undefined. */
    readonly content: string | null,
  ) {
    super();
  }
  eq(other: FootnoteRefWidget) {
    return other.label === this.label && other.from === this.from && other.content === this.content;
  }
  toDOM(view: EditorView) {
    const sup = document.createElement("sup");
    sup.className = "cm-md-footnote-ref" + (this.content === null ? " cm-md-footnote-ref-missing" : "");
    sup.textContent = this.label;
    sup.setAttribute("data-label", this.label);
    // Native tooltip shows the footnote text, mirroring a link's title.
    if (this.content && this.content.trim()) sup.title = this.content;
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
