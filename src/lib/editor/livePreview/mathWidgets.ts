import { WidgetType, type EditorView } from "@codemirror/view";
import { renderMath, renderInlineMath, measuredMathHeight, mathRenderGeneration } from "../math/render";

/**
 * Inline `$…$` rendered in place of its source. Clicking it drops the caret just
 * inside the opening `$` so `isElementActive` reveals the raw source for editing
 * (the same gesture the image/link widgets use).
 */
export class InlineMathWidget extends WidgetType {
  // Folded into `eq` so a math-engine switch re-renders (see mathRenderGeneration).
  readonly gen = mathRenderGeneration();
  constructor(
    readonly latex: string,
    readonly from: number,
    readonly displaystyle = false,
  ) {
    super();
  }
  eq(other: InlineMathWidget) {
    return (
      other.latex === this.latex &&
      other.from === this.from &&
      other.displaystyle === this.displaystyle &&
      other.gen === this.gen
    );
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-md-inline-math";
    span.innerHTML = renderInlineMath(this.latex, this.displaystyle);
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
  // Folded into `eq` so a math-engine switch re-renders (see mathRenderGeneration).
  readonly gen = mathRenderGeneration();
  constructor(
    readonly latex: string,
    readonly enterPos = -1,
    readonly insertLine = false,
    readonly hoverable = false,
    readonly previewCaret = -1,
  ) {
    super();
  }
  eq(other: BlockMathWidget) {
    return (
      other.latex === this.latex &&
      other.enterPos === this.enterPos &&
      other.insertLine === this.insertLine &&
      other.hoverable === this.hoverable &&
      other.previewCaret === this.previewCaret &&
      other.gen === this.gen
    );
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    const rendered = this.enterPos >= 0;
    div.className = rendered ? "cm-md-math-block" : "cm-md-math-preview";
    // Only `$$` renders get the hover box + "Math" hint; ```math renders are
    // plain (they're code blocks, entered by clicking with no hover affordance).
    if (rendered && this.hoverable) div.classList.add("cm-md-math-hoverable");
    if (rendered && this.latex.trim() === "") {
      // Empty block: a clickable placeholder (KaTeX would render nothing).
      div.classList.add("cm-md-math-empty");
      div.textContent = "Empty math block — click to edit";
    } else {
      div.innerHTML = renderMath(this.latex, true);
      // Idle `$$` render: a small "Math" hint on hover signals it's editable.
      if (rendered && this.hoverable) {
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
    } else if (this.previewCaret >= 0) {
      // Clicking the preview keeps the caret in the editable body above it — a
      // native click here would otherwise resolve to the collapsed closing fence
      // (an invisible caret position where typing breaks the block).
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: this.previewCaret } });
        view.focus();
      });
    }
    return div;
  }
  ignoreEvent() {
    return true;
  }
  // CM doesn't measure these block widgets into its height map — give it an
  // accurate estimate (measured render + ~18px of vertical padding) so clicks and
  // Up/Down stay aligned. An empty placeholder is roughly one line.
  get estimatedHeight() {
    if (this.latex.trim() === "") return 34;
    return Math.ceil(measuredMathHeight(this.latex)) + 18;
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
