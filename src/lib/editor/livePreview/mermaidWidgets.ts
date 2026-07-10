import { WidgetType, type EditorView } from "@codemirror/view";
import { getMermaidRender, renderMermaid, mermaidReadyEffect } from "../mermaid/render";

/**
 * A ```` ```mermaid ```` diagram. Like `BlockMathWidget`, it serves two roles
 * keyed on `enterPos`:
 *   - idle full-block render (`enterPos >= 0`): replaces the whole block; clicking
 *     it drops the caret inside so the source box reappears for editing (an empty
 *     block sets `insertLine` so the click opens a body line first);
 *   - live preview (`enterPos < 0`): drawn *below* the editable box while the
 *     caret is inside; not interactive.
 *
 * Mermaid renders asynchronously, so `toDOM` reads the synchronous render cache:
 * on a miss it shows a placeholder and kicks off the render, then dispatches
 * `mermaidReadyEffect` when it lands so the field rebuilds and a cache-hit widget
 * draws the diagram. `ready` (captured at construction) is part of `eq` so the
 * miss→hit transition forces CM to re-run `toDOM`.
 */
export class BlockMermaidWidget extends WidgetType {
  readonly ready: boolean;
  constructor(
    readonly source: string,
    readonly enterPos = -1,
    readonly insertLine = false,
    readonly previewCaret = -1,
  ) {
    super();
    this.ready = getMermaidRender(source) != null;
  }
  eq(other: BlockMermaidWidget) {
    return (
      other.source === this.source &&
      other.enterPos === this.enterPos &&
      other.insertLine === this.insertLine &&
      other.previewCaret === this.previewCaret &&
      other.ready === this.ready
    );
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    const rendered = this.enterPos >= 0;
    div.className = rendered ? "cm-md-mermaid-block" : "cm-md-mermaid-preview";

    const state = getMermaidRender(this.source);
    if (!state) {
      div.classList.add("cm-md-mermaid-loading");
      div.textContent = "Rendering diagram…";
      // Kick off the async render; rebuild the field once it lands. The microtask
      // keeps the dispatch out of the current update cycle.
      renderMermaid(this.source, () =>
        queueMicrotask(() => view.dispatch({ effects: mermaidReadyEffect.of(null) })),
      );
    } else if (state.status === "error") {
      div.classList.add("cm-md-mermaid-error");
      div.textContent = state.message;
    } else {
      div.innerHTML = state.svg;
    }

    if (rendered) {
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (this.insertLine) {
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
      // Clicking the preview keeps the caret in the editable body above it (a
      // native click would otherwise resolve to the collapsed closing fence).
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
  // CM doesn't measure these block widgets into its height map — give it the
  // measured render height (once known) so clicks and Up/Down stay aligned. The
  // one-time placeholder→diagram reflow is corrected when the ready-rebuild swaps
  // in a widget that reports the real height.
  get estimatedHeight() {
    const state = getMermaidRender(this.source);
    if (!state) return 48;
    if (state.status === "error") return 40;
    return state.height;
  }
}
