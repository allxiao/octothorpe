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

/** Structural / alignment operations a table can perform. */
export type TableOp =
  | "addRowAbove"
  | "addRowBelow"
  | "addColBefore"
  | "addColAfter"
  | "moveRowUp"
  | "moveRowDown"
  | "moveColLeft"
  | "moveColRight"
  | "deleteRow"
  | "deleteCol"
  | "prettify"
  | "delete"
  | "copy"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignNone";

// The most recently focused table, so the Paragraph → Table menu (which blurs
// the cell when it opens) can still target it. Cleared when the caret lands in
// normal editor text (see the focusin handler in index.ts).
let activeTable: { from: number; run: (op: TableOp) => void } | null = null;
export const getActiveTable = () => activeTable;
export function clearActiveTable() {
  activeTable = null;
}
export function runActiveTableOp(op: TableOp): boolean {
  if (!activeTable) return false;
  activeTable.run(op);
  return true;
}
/** Map a Paragraph-menu command id to a table op and run it on the active table. */
export function runActiveTableCommand(id: string): boolean {
  const op = MENU_OPS[id];
  return op ? runActiveTableOp(op) : false;
}
const MENU_OPS: Record<string, TableOp> = {
  tableAddRowAbove: "addRowAbove",
  tableAddRowBelow: "addRowBelow",
  tableAddColBefore: "addColBefore",
  tableAddColAfter: "addColAfter",
  tableMoveRowUp: "moveRowUp",
  tableMoveRowDown: "moveRowDown",
  tableMoveColLeft: "moveColLeft",
  tableMoveColRight: "moveColRight",
  tableDeleteRow: "deleteRow",
  tableDeleteCol: "deleteCol",
  tablePrettify: "prettify",
  tableDelete: "delete",
};

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

  // CM doesn't measure these block widgets into its height map — without an
  // estimate it guesses ~1 line for the whole table, desyncing the map so clicks
  // and Up/Down below the table jump. Estimate from the row count (+ the wrap's
  // vertical margin). Rough is fine; it just needs to be close.
  get estimatedHeight() {
    const model = parseTableText(this.md);
    return (model.rows.length + 1) * 24 + 22;
  }

  /** Current table range in the document (start is stable; end may shift after edits). */
  private range(view: EditorView): { from: number; to: number } {
    const cur = findTables(view.state, this.from, this.from).find((t) => t.from === this.from);
    return { from: this.from, to: cur ? cur.to : this.to };
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

    // All structural / alignment ops go through here, from the toolbar, the ⋮
    // menu, and the Paragraph → Table menu (via the active-table controller).
    const restoreFocus = () => {
      requestAnimationFrame(() => {
        const cur = findTables(view.state, this.from, this.from).find((t) => t.from === this.from);
        if (!cur) return;
        const node: Node = view.domAtPos(cur.from).node;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        const container = el?.closest(".cm-md-table-wrap") ?? view.dom.querySelector(".cm-md-table-wrap");
        if (!container) return;
        const bodyRows = container.querySelectorAll("tbody tr");
        const rowEl =
          activeRow < 0
            ? (container.querySelector("thead tr") as HTMLElement | null)
            : (bodyRows[Math.min(activeRow, bodyRows.length - 1)] as HTMLElement | undefined) ?? null;
        const cell = rowEl?.children[Math.min(activeCol, rowEl.children.length - 1)];
        if (cell instanceof HTMLElement) caretToEnd(cell);
      });
    };

    const doOp = (op: TableOp) => {
      if (op === "copy") {
        void writeText(renderTableText(this.readModel(wrap))).catch(() => {});
        restoreFocus();
        return;
      }
      if (op === "delete") {
        this.deleteTable(view);
        return;
      }
      const { from, to } = this.range(view);
      const m = this.readModel(wrap);
      switch (op) {
        case "addRowAbove": modelAddRow(m, activeRow < 0 ? 0 : activeRow); break;
        case "addRowBelow": modelAddRow(m, activeRow < 0 ? 0 : activeRow + 1); break;
        case "addColBefore": modelAddCol(m, activeCol); break;
        case "addColAfter": modelAddCol(m, activeCol + 1); break;
        case "moveRowUp": modelMoveRow(m, activeRow, -1); break;
        case "moveRowDown": modelMoveRow(m, activeRow, 1); break;
        case "moveColLeft": modelMoveCol(m, activeCol, -1); break;
        case "moveColRight": modelMoveCol(m, activeCol, 1); break;
        case "deleteRow": modelDeleteRow(m, activeRow); break;
        case "deleteCol": modelDeleteCol(m, activeCol); break;
        case "alignLeft": modelSetAlign(m, activeCol, "left"); break;
        case "alignCenter": modelSetAlign(m, activeCol, "center"); break;
        case "alignRight": modelSetAlign(m, activeCol, "right"); break;
        case "alignNone": modelSetAlign(m, activeCol, ""); break;
        case "prettify": break; // just re-render with padding
      }
      view.dispatch({ changes: { from, to, insert: renderTableText(m, op === "prettify") } });
      restoreFocus();
    };

    // --- toolbar ---
    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-table-toolbar";

    const left = document.createElement("div");
    left.className = "cm-md-tb-group";
    left.append(
      tbButton(ICONS.grid, "Align default", () => doOp("alignNone")),
      tbButton(ICONS.alignLeft, "Align left", () => doOp("alignLeft")),
      tbButton(ICONS.alignCenter, "Align center", () => doOp("alignCenter")),
      tbButton(ICONS.alignRight, "Align right", () => doOp("alignRight")),
    );

    const right = document.createElement("div");
    right.className = "cm-md-tb-group";

    const menu = document.createElement("div");
    menu.className = "cm-md-table-menu";
    menu.style.display = "none";
    const addItem = (label: string, op: TableOp) => {
      const it = document.createElement("button");
      it.type = "button";
      it.className = "cm-md-menu-item";
      it.textContent = label;
      it.addEventListener("mousedown", (e) => e.preventDefault());
      it.addEventListener("click", () => {
        menu.style.display = "none";
        doOp(op);
      });
      menu.appendChild(it);
    };
    const sep = () => menu.appendChild(document.createElement("div")).classList.add("cm-md-menu-sep");
    addItem("Add Row Above", "addRowAbove");
    addItem("Add Row Below", "addRowBelow");
    addItem("Add Column Before", "addColBefore");
    addItem("Add Column After", "addColAfter");
    sep();
    addItem("Move Row Up", "moveRowUp");
    addItem("Move Row Down", "moveRowDown");
    addItem("Move Column Left", "moveColLeft");
    addItem("Move Column Right", "moveColRight");
    sep();
    addItem("Delete Row", "deleteRow");
    addItem("Delete Column", "deleteCol");
    sep();
    addItem("Copy Table", "copy");

    const optionsBtn = tbButton(ICONS.dots, "Options", () => {
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    const deleteBtn = tbButton(ICONS.trash, "Delete table", () => doOp("delete"));
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
      activeTable = { from: this.from, run: doOp };
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

  private exitUp(view: EditorView) {
    if (this.from === 0) return; // nothing above
    view.focus(); // blur cell → commit via focusout
    view.dispatch({ selection: { anchor: this.from - 1 }, scrollIntoView: true });
  }

  private exitDown(view: EditorView) {
    view.focus(); // blur cell → commit via focusout
    const st = view.state;
    const end = this.range(view).to;
    const endLine = st.doc.lineAt(Math.min(end, st.doc.length));
    if (endLine.number < st.doc.lines) {
      view.dispatch({ selection: { anchor: st.doc.line(endLine.number + 1).from }, scrollIntoView: true });
    } else {
      // Table is the last element — add a line so the caret can leave downward.
      view.dispatch({
        changes: { from: endLine.to, insert: "\n" },
        selection: { anchor: endLine.to + 1 },
        scrollIntoView: true,
      });
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
    const { from, to } = this.range(view);
    const end = Math.min(to + 1, view.state.doc.length); // swallow the trailing newline
    view.dispatch({ changes: { from, to: end, insert: "" }, selection: { anchor: from } });
    view.focus();
  }

  commit(view: EditorView, wrap: HTMLElement) {
    const md2 = renderTableText(this.readModel(wrap));
    if (md2 !== this.md) {
      const { from, to } = this.range(view);
      view.dispatch({ changes: { from, to, insert: md2 } });
    }
  }
}
