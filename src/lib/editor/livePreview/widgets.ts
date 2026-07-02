import { WidgetType, type EditorView } from "@codemirror/view";
import { languages } from "@codemirror/language-data";

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

/** Known language names, for the picker's suggestion list. */
const LANG_NAMES = languages.map((l) => l.name);

/**
 * A free-text language picker shown at the bottom-right of a fenced code block.
 * The user can type any language; a small custom dropdown *suggests* known
 * grammars (a native <datalist> can't be sized/aligned reliably). Changes are
 * committed to the document on blur or selection — never per-keystroke, since
 * that would rebuild the decoration and steal focus mid-type. `from`/`to` is the
 * CodeInfo range (an empty range just after the opening fence when unset).
 */
export class CodeLangWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  eq(other: CodeLangWidget) {
    return other.lang === this.lang && other.from === this.from && other.to === this.to;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-code-lang";
    const input = document.createElement("input");
    input.className = "cm-md-code-lang-input";
    input.value = this.lang;
    input.placeholder = "plain text";
    input.spellcheck = false;
    const arrow = document.createElement("span");
    arrow.className = "cm-md-code-lang-arrow";
    arrow.textContent = "▾"; // ▾
    const menu = document.createElement("div");
    menu.className = "cm-md-code-lang-menu";
    menu.style.display = "none";
    wrap.append(input, arrow, menu);

    let items: string[] = [];
    let active = -1;
    let open = false; // dropdown visible — only via an explicit gesture, see below
    let done = false; // guard against a stale re-dispatch after the widget rebuilds

    const commitValue = (val: string) => {
      if (done) return;
      const next = val.trim();
      if (next === this.lang) return;
      done = true;
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
    };
    const pick = (name: string) => {
      input.value = name;
      commitValue(name);
      view.focus(); // back to the code (caret is still on the last content line)
    };
    const setActive = (i: number) => {
      active = Math.max(0, Math.min(items.length - 1, i));
      [...menu.children].forEach((el, idx) => el.classList.toggle("active", idx === active));
      menu.children[active]?.scrollIntoView({ block: "nearest" });
    };
    const renderMenu = () => {
      if (!open) return;
      const q = input.value.trim().toLowerCase();
      items = LANG_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 60);
      if (active >= items.length) active = items.length - 1;
      menu.textContent = "";
      items.forEach((name, i) => {
        const it = document.createElement("div");
        it.className = "cm-md-code-lang-item" + (i === active ? " active" : "");
        it.textContent = name;
        it.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus off the item
          pick(name);
        });
        menu.appendChild(it);
      });
      menu.style.display = items.length ? "block" : "none";
    };
    const openMenu = () => {
      open = true;
      active = -1;
      renderMenu();
    };
    const closeMenu = () => {
      open = false;
      active = -1;
      menu.style.display = "none";
    };
    const atStart = () => input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = () =>
      input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

    // The dropdown opens only on an explicit gesture — clicking the ▾ icon or
    // pressing Alt+ArrowDown — never merely on focus, so plain arrows can move
    // the caret straight through the picker and out of the block.
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    arrow.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.focus();
      open ? closeMenu() : openMenu();
    });
    input.addEventListener("input", () => {
      if (open) renderMenu();
    });
    input.addEventListener("blur", () => {
      commitValue(input.value);
      closeMenu();
    });
    input.addEventListener("keydown", (e) => {
      if (e.altKey && e.key === "ArrowDown") {
        // Keyboard affordance to open the suggestions.
        e.preventDefault();
        open ? setActive(active + 1) : openMenu();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (open && items.length) setActive(active + 1);
        else {
          commitValue(input.value);
          this.exitBelow(view); // out the bottom of the block
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (open && active > 0) setActive(active - 1);
        else if (open) closeMenu();
        else {
          commitValue(input.value);
          view.focus(); // back into the code
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (open && active >= 0) pick(items[active]);
        else if (open) closeMenu();
        else {
          commitValue(input.value);
          view.focus();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (open) closeMenu();
        else {
          input.value = this.lang;
          view.focus();
        }
      } else if (e.key === "ArrowLeft" && atStart()) {
        e.preventDefault();
        commitValue(input.value);
        view.focus();
      } else if (e.key === "ArrowRight" && atEnd()) {
        e.preventDefault();
        commitValue(input.value);
        this.exitBelow(view);
      }
    });
    return wrap;
  }
  /** Move the caret to the line after this block's closing fence. */
  private exitBelow(view: EditorView) {
    const doc = view.state.doc;
    const openLn = doc.lineAt(this.from).number;
    let closeLn = doc.lines;
    for (let n = openLn + 1; n <= doc.lines; n++) {
      if (/^\s*(```|~~~)/.test(doc.line(n).text)) {
        closeLn = n;
        break;
      }
    }
    view.focus();
    if (closeLn < doc.lines) {
      view.dispatch({ selection: { anchor: doc.line(closeLn + 1).from }, scrollIntoView: true });
    } else {
      // No line below the block yet — add one so the caret has somewhere to go.
      const end = doc.line(closeLn).to;
      view.dispatch({
        changes: { from: end, insert: "\n" },
        selection: { anchor: end + 1 },
        scrollIntoView: true,
      });
    }
  }
  ignoreEvent() {
    return true;
  }
}
