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
    readonly baseDir: string,
  ) {
    super();
  }
  // Keyed on content only (NOT the block's document position): editing text
  // *before* the block shifts its position every keystroke, and if that were in
  // `eq` CodeMirror would rebuild the DOM each time — reloading an <iframe> and
  // making it flash. Position-only changes now reuse the existing DOM; the
  // click-to-edit target is resolved live from the DOM instead.
  eq(other: HtmlBlockWidget) {
    return other.raw === this.raw && other.baseDir === this.baseDir;
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-md-html-block";
    div.innerHTML = sanitizeHtml(this.raw, this.baseDir);

    // Click-to-edit badge (does not steal clicks from the body's controls). The
    // caret target is read from the widget's current DOM position at click time,
    // so it stays correct even after the block has shifted (DOM reused).
    const badge = document.createElement("span");
    badge.className = "cm-md-html-badge";
    badge.textContent = "HTML";
    badge.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(div);
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
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

/**
 * An HTML comment (`<!-- … -->`) or processing instruction, rendered idle as a
 * muted collapsed chip rather than shown verbatim — Typora hides comments from
 * the preview. Clicking the chip drops the caret at its start to edit the source.
 */
export class HtmlCommentWidget extends WidgetType {
  constructor(readonly raw: string) {
    super();
  }
  // Content-only (see HtmlBlockWidget.eq): reuse the DOM when only the position
  // shifts, and resolve the click-to-edit target live.
  eq(other: HtmlCommentWidget) {
    return other.raw === this.raw;
  }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-md-html-comment";
    const inner = this.raw
      .replace(/^<!--/, "")
      .replace(/-->$/, "")
      .replace(/^<\?/, "")
      .replace(/\?>$/, "")
      .trim();
    const label = inner.length > 80 ? inner.slice(0, 80) + "…" : inner || "comment";
    div.textContent = "❮❯ " + label;
    div.title = this.raw;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(div) }, scrollIntoView: true });
      view.focus();
    });
    return div;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 22;
  }
}

/**
 * A small static "HTML" badge shown at the top-right of a block-HTML region while
 * it is being edited (boxed like a math block) — labelling the block the way the
 * "Math" badge labels a `$$…$$` block being edited.
 */
export class HtmlBadgeWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-html-edit-badge";
    span.textContent = "HTML";
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

