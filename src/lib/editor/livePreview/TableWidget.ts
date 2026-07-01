import { WidgetType, type EditorView } from "@codemirror/view";
import { parseTableText, renderTableText, type Align } from "../commands/table";

/** Text content of a contenteditable cell, normalized to a single line. */
function cellText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/ /g, " ").replace(/\s*\n\s*/g, " ");
}

/** Focus an element and place the caret at the end of its text. */
function caretToEnd(el: HTMLElement) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const alignName = (a: Align): "left" | "center" | "right" | "" =>
  a === "center" ? "center" : a === "right" ? "right" : a === "left" ? "left" : "";

/**
 * Renders a GFM table as an editable HTML table (Typora-style): cells are
 * contenteditable and stay rendered even with the caret nearby. Edits are written
 * back to the Markdown source on commit (blur / toolbar op / before save).
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly md: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  // Same Markdown + position → reuse the DOM (preserves the cell caret across
  // cursor-move rebuilds).
  eq(other: TableWidget) {
    return other.md === this.md && other.from === this.from;
  }

  // The widget manages its own events; keep CM out of them.
  ignoreEvent() {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const model = parseTableText(this.md);

    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";
    wrap.contentEditable = "false";

    const table = document.createElement("table");
    table.className = "cm-md-table";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    model.header.forEach((cell, c) => {
      htr.appendChild(this.makeCell("th", cell, model.align[c]));
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    model.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, c) => tr.appendChild(this.makeCell("td", cell, model.align[c])));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // Commit when focus leaves the whole table.
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget as Node)) this.commit(view, wrap);
    });
    wrap.addEventListener("keydown", (e) => this.onKeydown(e, view, wrap));

    return wrap;
  }

  private makeCell(tag: "th" | "td", text: string, align: Align): HTMLElement {
    const el = document.createElement(tag);
    el.contentEditable = "true";
    el.textContent = text;
    const a = alignName(align);
    if (a) el.style.textAlign = a;
    return el;
  }

  private onKeydown(e: KeyboardEvent, view: EditorView, wrap: HTMLElement) {
    const cell = (e.target as HTMLElement).closest("th,td") as HTMLElement | null;
    if (!cell) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const all = [...wrap.querySelectorAll("th,td")] as HTMLElement[];
      const i = all.indexOf(cell);
      const next = all[i + (e.shiftKey ? -1 : 1)];
      if (next) caretToEnd(next);
      else if (!e.shiftKey) caretToEnd(this.appendRow(wrap).children[0] as HTMLElement);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const tr = cell.parentElement as HTMLElement;
      const col = [...tr.children].indexOf(cell);
      const inHead = (tr.parentElement as HTMLElement).tagName === "THEAD";
      const target = inHead
        ? (wrap.querySelector("tbody tr") as HTMLElement | null)
        : (tr.nextElementSibling as HTMLElement | null);
      const row = target ?? this.appendRow(wrap);
      caretToEnd(row.children[col] as HTMLElement);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      cell.blur();
      view.focus();
    }
  }

  private appendRow(wrap: HTMLElement): HTMLElement {
    const tbody = wrap.querySelector("tbody") as HTMLElement;
    const cols = wrap.querySelectorAll("thead th").length;
    const tr = document.createElement("tr");
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    return tr;
  }

  /** Serialize the DOM table back to Markdown. */
  private serialize(wrap: HTMLElement): string {
    const heads = [...wrap.querySelectorAll("thead th")] as HTMLElement[];
    const header = heads.map(cellText);
    const align = heads.map((h) => {
      const a = h.style.textAlign;
      return (a === "center" ? "center" : a === "right" ? "right" : a === "left" ? "left" : "") as Align;
    });
    const rows = [...wrap.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => cellText(td as HTMLElement)),
    );
    return renderTableText({ header, align, rows });
  }

  commit(view: EditorView, wrap: HTMLElement) {
    const md2 = this.serialize(wrap);
    if (md2 !== this.md) {
      view.dispatch({ changes: { from: this.from, to: this.to, insert: md2 } });
    }
  }
}
