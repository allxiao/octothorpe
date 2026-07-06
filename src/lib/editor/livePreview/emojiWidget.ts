import { WidgetType, type EditorView } from "@codemirror/view";

/**
 * A `:name:` shortcode rendered as its emoji glyph in place of the source.
 * Clicking it drops the caret just inside the opening `:` so `isElementActive`
 * reveals the raw shortcode for editing — the same gesture the inline-math and
 * link widgets use.
 */
export class EmojiWidget extends WidgetType {
  constructor(
    readonly glyph: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: EmojiWidget) {
    return other.glyph === this.glyph && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-md-emoji";
    span.textContent = this.glyph;
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from + 1 } });
      view.focus();
    });
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
