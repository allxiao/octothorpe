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
 *     ```` ```math ```` block; clicking it puts the caret inside so the source
 *     box appears for editing. For an empty block (no body line) `insertLine` is
 *     set, so the click first inserts a blank line to type into;
 *   - live preview (`enterPos < 0`): shown *below* the editable box while the
 *     caret is inside the block; not interactive.
 * `eq` keys on the LaTeX (and role) so it re-renders live as the body is edited
 * but doesn't churn when unrelated text changes.
 */
export class BlockMathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly enterPos = -1,
    readonly insertLine = false,
  ) {
    super();
  }
  eq(other: BlockMathWidget) {
    return (
      other.latex === this.latex &&
      other.enterPos === this.enterPos &&
      other.insertLine === this.insertLine
    );
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    const rendered = this.enterPos >= 0;
    div.className = rendered ? "cm-md-math-block" : "cm-md-math-preview";
    if (rendered && this.latex.trim() === "") {
      // Empty block: a clickable placeholder (KaTeX would render nothing).
      div.classList.add("cm-md-math-empty");
      div.textContent = "Empty math block — click to edit";
    } else {
      div.innerHTML = renderMath(this.latex, true);
      // Idle render: a small "Math" hint on hover signals it's editable math.
      if (rendered) {
        const hint = document.createElement("span");
        hint.className = "cm-md-math-hint";
        hint.textContent = "Math";
        div.appendChild(hint);
      }
    }
    if (rendered) {
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (this.insertLine) {
          // No body line to type into (e.g. `$$\n$$`): open one up.
          view.dispatch({
            changes: { from: this.enterPos, insert: "\n" },
            selection: { anchor: this.enterPos + 1 },
            scrollIntoView: true,
          });
        } else {
          view.dispatch({ selection: { anchor: this.enterPos } });
        }
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

/**
 * A small static "Math" badge shown at the top-right of a `$$…$$` block while it
 * is being edited (the `$$` fences stay visible, so this labels the block the way
 * the language picker labels a fenced code block).
 */
export class MathBadgeWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-math-badge";
    span.textContent = "Math";
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
