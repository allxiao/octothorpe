import { WidgetType, type EditorView } from "@codemirror/view";

/**
 * Renders an image. Clicking it selects the alt text and places the caret just
 * before `]` (Typora-style), which reveals the source for editing.
 *
 * `variant` controls layout: "block" (alone on a line), "inline" (flows with
 * surrounding text, vertically centred), or "preview" (shown below the source
 * while editing).
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly altFrom: number,
    readonly altTo: number,
    readonly variant: "block" | "inline" | "preview" = "block",
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.altFrom === this.altFrom &&
      other.altTo === this.altTo &&
      other.variant === this.variant
    );
  }
  toDOM(view: EditorView) {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = `cm-md-image cm-md-image-${this.variant}`;
    img.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.altFrom, head: this.altTo } });
      view.focus();
    });
    return img;
  }
  ignoreEvent() {
    return true;
  }
}

/** Renders a horizontal rule in place of a `---` / `***` line. */
export class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-hr";
    return span;
  }
}

/** Renders a bullet glyph in place of a `-`/`*`/`+` list marker. */
export class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}

/** Renders an interactive checkbox in place of a `[ ]` / `[x]` task marker. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return (
      other.checked === this.checked && other.from === this.from && other.to === this.to
    );
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-md-task";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? "[ ]" : "[x]" },
      });
    });
    return box;
  }
  // Let the checkbox receive its own mouse events.
  ignoreEvent() {
    return false;
  }
}
