import { WidgetType, type EditorView } from "@codemirror/view";

/**
 * Inline HTML rendered in place of its source, for tags a CSS class can't express
 * (`<ruby>`, `<bdo>`, …) and void elements (`<br>`). The HTML is already
 * sanitized (see `sanitizeInlineHtml`). Clicking drops the caret at the tag's
 * start so `isElementActive` reveals the raw source for editing — the same
 * gesture the inline-math/image widgets use.
 */
export class InlineHtmlWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: InlineHtmlWidget) {
    return other.html === this.html && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-html-inline";
    span.innerHTML = this.html;
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
