import { WidgetType, type EditorView } from "@codemirror/view";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  parseTableText,
  renderTableText,
  findTables,
  modelAddRow,
  modelAddCol,
  modelDeleteRow,
  modelDeleteCol,
  modelMoveRow,
  modelMoveCol,
  modelSetAlign,
  type Align,
  type TableModel,
} from "../commands/table";

/** Text content of a contenteditable cell, normalized to a single line. */
function cellText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/ /g, " ").replace(/\s*\n\s*/g, " ");
}

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

const ICONS = {
  grid: `<svg viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/><rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></svg>`,
  alignLeft: `<svg viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="1.6"/><rect x="1" y="6.2" width="8" height="1.6"/><rect x="1" y="10.4" width="12" height="1.6"/></svg>`,
  alignCenter: `<svg viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="1.6"/><rect x="3" y="6.2" width="8" height="1.6"/><rect x="1" y="10.4" width="12" height="1.6"/></svg>`,
  alignRight: `<svg viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="1.6"/><rect x="5" y="6.2" width="8" height="1.6"/><rect x="1" y="10.4" width="12" height="1.6"/></svg>`,
  dots: `<svg viewBox="0 0 14 14"><circle cx="7" cy="2.5" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="7" cy="11.5" r="1.3"/></svg>`,
  trash: `<svg viewBox="0 0 14 14"><path d="M2 3.5h10M5 3.5V2h4v1.5M3 3.5l.7 8.5h6.6L11 3.5" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`,
};

/** A toolbar button that keeps the cell focused (mousedown → preventDefault). */
function tbButton(html: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "cm-md-tb-btn";
  b.type = "button";
  b.title = title;
  b.innerHTML = html;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

/**
 * Editable GFM table widget (Typora-style). Cells are contenteditable and stay
 * rendered with the caret nearby; a hover toolbar handles alignment and
 * row/column structure. Edits are written back to Markdown on commit.
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly md: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return other.md === this.md && other.from === this.from;
  }

  ignoreEvent() {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const model = parseTableText(this.md);

    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";
    wrap.contentEditable = "false";

    // Active cell position (kept across the DOM's lifetime via this closure).
    let activeCol = 0;
    let activeRow = -1; // -1 = header

    const table = document.createElement("table");
    table.className = "cm-md-table";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    model.header.forEach((cell, c) => htr.appendChild(this.makeCell("th", cell, model.align[c])));
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    model.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, c) => tr.appendChild(this.makeCell("td", cell, model.align[c])));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // --- toolbar ---
    const apply = (fn: (m: TableModel) => void) => {
      const m = this.readModel(wrap);
      fn(m);
      view.dispatch({ changes: { from: this.from, to: this.to, insert: renderTableText(m) } });
    };

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-table-toolbar";

    const left = document.createElement("div");
    left.className = "cm-md-tb-group";
    left.append(
      tbButton(ICONS.grid, "Align default", () => apply((m) => modelSetAlign(m, activeCol, ""))),
      tbButton(ICONS.alignLeft, "Align left", () => apply((m) => modelSetAlign(m, activeCol, "left"))),
      tbButton(ICONS.alignCenter, "Align center", () => apply((m) => modelSetAlign(m, activeCol, "center"))),
      tbButton(ICONS.alignRight, "Align right", () => apply((m) => modelSetAlign(m, activeCol, "right"))),
    );

    const right = document.createElement("div");
    right.className = "cm-md-tb-group";

    // Options ⋮ menu
    const menu = document.createElement("div");
    menu.className = "cm-md-table-menu";
    menu.style.display = "none";
    const addItem = (label: string, fn: (m: TableModel) => void) => {
      const it = document.createElement("button");
      it.type = "button";
      it.className = "cm-md-menu-item";
      it.textContent = label;
      it.addEventListener("mousedown", (e) => e.preventDefault());
      it.addEventListener("click", () => {
        menu.style.display = "none";
        apply(fn);
      });
      menu.appendChild(it);
    };
    const sep = () => menu.appendChild(document.createElement("div")).classList.add("cm-md-menu-sep");
    addItem("Add Row Above", (m) => modelAddRow(m, activeRow < 0 ? 0 : activeRow));
    addItem("Add Row Below", (m) => modelAddRow(m, activeRow < 0 ? 0 : activeRow + 1));
    addItem("Add Column Before", (m) => modelAddCol(m, activeCol));
    addItem("Add Column After", (m) => modelAddCol(m, activeCol + 1));
    sep();
    addItem("Move Row Up", (m) => modelMoveRow(m, activeRow, -1));
    addItem("Move Row Down", (m) => modelMoveRow(m, activeRow, 1));
    addItem("Move Column Left", (m) => modelMoveCol(m, activeCol, -1));
    addItem("Move Column Right", (m) => modelMoveCol(m, activeCol, 1));
    sep();
    addItem("Delete Row", (m) => modelDeleteRow(m, activeRow));
    addItem("Delete Column", (m) => modelDeleteCol(m, activeCol));

    const copyItem = document.createElement("button");
    copyItem.type = "button";
    copyItem.className = "cm-md-menu-item";
    copyItem.textContent = "Copy Table";
    copyItem.addEventListener("mousedown", (e) => e.preventDefault());
    copyItem.addEventListener("click", () => {
      menu.style.display = "none";
      void writeText(renderTableText(this.readModel(wrap))).catch(() => {});
    });
    sep();
    menu.appendChild(copyItem);

    const optionsBtn = tbButton(ICONS.dots, "Options", () => {
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    const deleteBtn = tbButton(ICONS.trash, "Delete table", () => this.deleteTable(view));
    right.append(optionsBtn, deleteBtn);

    toolbar.append(left, right, menu);
    const scroll = document.createElement("div");
    scroll.className = "cm-md-table-scroll";
    scroll.appendChild(table);
    wrap.append(toolbar, scroll);

    // --- events ---
    wrap.addEventListener("focusin", (e) => {
      const cell = (e.target as HTMLElement).closest("th,td") as HTMLElement | null;
      if (!cell) return;
      const tr = cell.parentElement as HTMLElement;
      activeCol = [...tr.children].indexOf(cell);
      activeRow =
        (tr.parentElement as HTMLElement).tagName === "THEAD"
          ? -1
          : [...(tr.parentElement as HTMLElement).children].indexOf(tr);
      menu.style.display = "none";
    });
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
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const tr = cell.parentElement as HTMLElement;
      const col = [...tr.children].indexOf(cell);
      const inHead = (tr.parentElement as HTMLElement).tagName === "THEAD";
      const focusInRow = (row: HTMLElement | null) => {
        if (!row) return;
        caretToEnd(row.children[Math.min(col, row.children.length - 1)] as HTMLElement);
      };
      e.preventDefault();
      if (e.key === "ArrowUp") {
        if (inHead) this.exitUp(view);
        else focusInRow((tr.previousElementSibling as HTMLElement) ?? wrap.querySelector("thead tr"));
      } else {
        if (inHead) focusInRow(wrap.querySelector("tbody tr"));
        else {
          const next = tr.nextElementSibling as HTMLElement | null;
          if (next) focusInRow(next);
          else this.exitDown(view);
        }
      }
    }
  }

  /** Move the caret to the line just above the table (committing cell edits first). */
  private exitUp(view: EditorView) {
    if (this.from === 0) return; // nothing above
    view.focus(); // blur cell → commit via focusout
    view.dispatch({ selection: { anchor: this.from - 1 }, scrollIntoView: true });
  }

  /** Move the caret to the line just below the table (committing cell edits first). */
  private exitDown(view: EditorView) {
    view.focus(); // blur cell → commit via focusout
    const st = view.state;
    const end = findTables(st, this.from, this.from).find((t) => t.from === this.from)?.to ?? this.to;
    const endLine = st.doc.lineAt(Math.min(end, st.doc.length));
    const target =
      endLine.number < st.doc.lines ? st.doc.line(endLine.number + 1).from : endLine.to;
    view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
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

  private readModel(wrap: HTMLElement): TableModel {
    const heads = [...wrap.querySelectorAll("thead th")] as HTMLElement[];
    const header = heads.map(cellText);
    const align = heads.map((h) => {
      const a = h.style.textAlign;
      return (a === "center" ? "center" : a === "right" ? "right" : a === "left" ? "left" : "") as Align;
    });
    const rows = [...wrap.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => cellText(td as HTMLElement)),
    );
    return { header, align, rows };
  }

  private deleteTable(view: EditorView) {
    const to = Math.min(this.to + 1, view.state.doc.length); // swallow the trailing newline
    view.dispatch({ changes: { from: this.from, to, insert: "" }, selection: { anchor: this.from } });
    view.focus();
  }

  commit(view: EditorView, wrap: HTMLElement) {
    const md2 = renderTableText(this.readModel(wrap));
    if (md2 !== this.md) {
      view.dispatch({ changes: { from: this.from, to: this.to, insert: md2 } });
    }
  }
}
