import { WidgetType, type EditorView } from "@codemirror/view";
import { renderMath } from "../math/render";

/**
 * Inline `$…$` rendered in place of its source. Clicking it drops the caret just
 * inside the opening `$` so `isElementActive` reveals the raw source for editing
 * (the same gesture the image/link widgets use).
 */
export class InlineMathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: InlineMathWidget) {
    return other.latex === this.latex && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-md-inline-math";
    span.innerHTML = renderMath(this.latex, false);
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

/**
 * Display-mode block math. Serves two roles, keyed on `enterPos`:
 *   - idle full-block render (`enterPos >= 0`): replaces the whole `$$…$$` /
 *     ```` ```math ```` block; clicking it drops the caret inside so the source
 *     box appears for editing;
 *   - live preview (`enterPos < 0`): shown *below* the editable box while the
 *     caret is inside the block; not interactive.
 * `eq` keys on the LaTeX (and role) so it re-renders live as the body is edited
 * but doesn't churn when unrelated text changes.
 */
export class BlockMathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly enterPos = -1,
  ) {
    super();
  }
  eq(other: BlockMathWidget) {
    return other.latex === this.latex && other.enterPos === this.enterPos;
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    const rendered = this.enterPos >= 0;
    div.className = rendered ? "cm-md-math-block" : "cm-md-math-preview";
    div.innerHTML = renderMath(this.latex, true);
    if (rendered) {
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: this.enterPos } });
        view.focus();
      });
    }
    return div;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 40;
  }
}
