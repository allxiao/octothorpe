import { WidgetType, type EditorView } from "@codemirror/view";
import { sanitizeHtml, measuredHtmlHeight } from "../html/render";

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

/**
 * A block of embedded HTML (`<details>`, `<table>`, `<svg>`, media, sandboxed
 * iframes, …) rendered in place of its source when the caret is outside it. The
 * content is interactive (a `<summary>` toggles its `<details>`, video controls
 * work) — so unlike the math widget we DON'T intercept clicks on the body. A
 * hover "HTML" badge in the corner is the click-to-edit affordance: clicking it
 * drops the caret at the block's start, revealing the raw source.
 */
export class HtmlBlockWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly enterPos: number,
    readonly baseDir: string,
  ) {
    super();
  }
  eq(other: HtmlBlockWidget) {
    return (
      other.raw === this.raw &&
      other.enterPos === this.enterPos &&
      other.baseDir === this.baseDir
    );
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-md-html-block";
    div.innerHTML = sanitizeHtml(this.raw, this.baseDir);

    // Click-to-edit badge (does not steal clicks from the body's controls).
    const badge = document.createElement("span");
    badge.className = "cm-md-html-badge";
    badge.textContent = "HTML";
    badge.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.enterPos }, scrollIntoView: true });
      view.focus();
    });
    div.appendChild(badge);

    // Media settles its height after load — re-measure so the height map stays
    // in sync (clicks / Up-Down below the block stay aligned).
    for (const media of div.querySelectorAll("img,iframe,video")) {
      media.addEventListener("load", () => view.requestMeasure(), { once: true });
    }
    return div;
  }
  // Let native events through (summary toggle, video controls); the atomic range
  // keeps the caret from landing inside on a stray click.
  ignoreEvent() {
    return false;
  }
  get estimatedHeight() {
    return Math.ceil(measuredHtmlHeight(this.raw, this.baseDir)) + 16;
  }
}

