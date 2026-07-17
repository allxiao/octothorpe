import { WidgetType, EditorView } from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
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
import { renderCellMarkdown, type CellRenderOpts } from "./cellRender";
import { mountCellEditor, type CellEditorHandlers, type CellEditorOpts } from "./cellEditor";
import { imageBaseDir, inlineMathDisplayStyle, renderFootnotes } from "./config";
import { linkRefsField } from "./linkRefs";
import { footnotesField, gotoOrCreateFootnote } from "./footnotes";
import { followRenderedLink } from "./linkNav";

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

// --- Table width mode ("compact" fits content; "full" stretches to the edit
// area and auto-distributes columns). A single, persisted editor-wide setting
// (default "full"), reflected as a class on the editor root via CodeMirror's
// editorAttributes facet (setting `view.dom.className` directly doesn't stick —
// CM manages that attribute). The per-table toolbar buttons flip this shared
// mode with an effect.
export type TableWidthMode = "compact" | "full";
const TABLE_WIDTH_KEY = "octothorpe:tableWidth";

export function readTableWidthMode(): TableWidthMode {
  try {
    return localStorage.getItem(TABLE_WIDTH_KEY) === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

const setTableWidthEffect = StateEffect.define<TableWidthMode>();

/** Editor-wide table width mode: holds the mode and adds a matching class to the
 *  editor root so every table's CSS keys off it. Seeded from the saved setting. */
export const tableWidthField: Extension = StateField.define<TableWidthMode>({
  create: () => readTableWidthMode(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setTableWidthEffect)) value = e.value;
    return value;
  },
  provide: (f) =>
    EditorView.editorAttributes.from(f, (mode) => ({
      class: mode === "full" ? "cm-tables-full" : "cm-tables-compact",
    })),
});

function setTableWidthMode(view: EditorView, mode: TableWidthMode) {
  try {
    localStorage.setItem(TABLE_WIDTH_KEY, mode);
  } catch {
    // ignore (private mode, etc.)
  }
  view.dispatch({ effects: setTableWidthEffect.of(mode) });
}

/** A cell's Markdown source, normalized to a single line (drop nbsp, collapse
 *  newlines). Cells render Markdown live but store their true source in
 *  `dataset.src`; this reads that (falling back to text content while editing). */
function cellText(el: HTMLElement): string {
  return normalizeCell(el.dataset.src ?? el.textContent);
}

function normalizeCell(s: string | null | undefined): string {
  return (s ?? "").replace(/ /g, " ").replace(/\s*\n\s*/g, " ");
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
  compact: `<svg viewBox="0 0 14 14"><rect x="3" y="3.5" width="8" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7 3.5v7" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`,
  full: `<svg viewBox="0 0 14 14"><rect x="1" y="3.5" width="12" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7 3.5v7" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`,
};

/** A toolbar button that keeps the cell focused (mousedown → preventDefault). */
function tbButton(
  html: string,
  title: string,
  onClick: () => void,
  extraClass = "",
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = extraClass ? `cm-md-tb-btn ${extraClass}` : "cm-md-tb-btn";
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
    // Options for rendering each cell's Markdown inline (mirrors the editor). The
    // document's link-ref definitions are threaded in so `[text][id]` in a cell
    // resolves against the whole document.
    const opts: CellEditorOpts = {
      baseDir: view.state.facet(imageBaseDir),
      displaystyle: view.state.facet(inlineMathDisplayStyle),
      linkRefs: view.state.field(linkRefsField, false) ?? new Map(),
      // Footnote defs so `[^label]` cells render as pills; undefined (→ literal)
      // when footnote rendering is disabled.
      footnotes: view.state.facet(renderFootnotes)
        ? (view.state.field(footnotesField, false) ?? new Map())
        : undefined,
    };

    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";
    wrap.contentEditable = "false";

    // Active cell position (kept across the DOM's lifetime via this closure).
    let activeCol = 0;
    let activeRow = -1; // -1 = header
    // The one focused cell's nested inline editor (mounted on focus, one at a time).
    let activeEditor: EditorView | null = null;
    let activeCellEl: HTMLElement | null = null;
    // True while hopping between cells, so the exit-commit (focusout) is suppressed.
    let navigating = false;

    const table = document.createElement("table");
    table.className = "cm-md-table";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    model.header.forEach((cell, c) => htr.appendChild(this.makeCell("th", cell, model.align[c], opts)));
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    model.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, c) => tr.appendChild(this.makeCell("td", cell, model.align[c], opts)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // All structural / alignment ops go through here, from the toolbar, the ⋮
    // menu, and the Paragraph → Table menu (via the active-table controller).
    // After the op re-renders the table, re-open the editor in the active cell.
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
        const cell = rowEl?.children[Math.min(activeCol, (rowEl?.children.length ?? 1) - 1)];
        // Re-clicking mounts the new widget's own editor in that cell.
        if (cell instanceof HTMLElement)
          cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 0, clientY: 0 }));
      });
    };

    const doOp = (op: TableOp) => {
      // Fold the active cell edit back into the DOM/model before reading it.
      navigating = true;
      teardownActive();
      navigating = false;
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
    const sepEl = document.createElement("div");
    sepEl.className = "cm-md-tb-sep";
    left.append(
      tbButton(ICONS.grid, "Align default", () => doOp("alignNone")),
      tbButton(ICONS.alignLeft, "Align left", () => doOp("alignLeft")),
      tbButton(ICONS.alignCenter, "Align center", () => doOp("alignCenter")),
      tbButton(ICONS.alignRight, "Align right", () => doOp("alignRight")),
      sepEl,
      tbButton(ICONS.compact, "Compact width (fit content)", () => setTableWidthMode(view, "compact"), "cm-md-tb-btn-compact"),
      tbButton(ICONS.full, "Full width (fit edit area)", () => setTableWidthMode(view, "full"), "cm-md-tb-btn-full"),
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

    // --- editing: click a cell to mount a nested inline CodeMirror in it, so the
    //     cell gets element-level source reveal (only the element at the caret
    //     shows raw Markdown) like the main document. One editor at a time. ---
    const numCols = () => wrap.querySelectorAll("thead th").length;
    const bodyRowEls = () => [...wrap.querySelectorAll("tbody tr")] as HTMLElement[];
    const cellAt = (row: number, col: number): HTMLElement | null => {
      const cols = numCols();
      const c = Math.max(0, Math.min(col, cols - 1));
      if (row < 0) return (wrap.querySelector("thead tr")?.children[c] as HTMLElement) ?? null;
      const rows = bodyRowEls();
      if (!rows.length) return null;
      const r = Math.max(0, Math.min(row, rows.length - 1));
      return (rows[r].children[c] as HTMLElement) ?? null;
    };

    // Fold the active editor back to static rendered HTML (+ dataset.src).
    function teardownActive() {
      if (!activeEditor || !activeCellEl) return;
      const src = normalizeCell(activeEditor.state.doc.toString());
      const cell = activeCellEl;
      activeEditor.destroy();
      activeEditor = null;
      activeCellEl = null;
      cell.dataset.src = src;
      cell.innerHTML = renderCellMarkdown(src, opts);
    }

    const self = this;
    function mountInCell(cell: HTMLElement, caret: "start" | "end" | { x: number; y: number }) {
      if (activeCellEl === cell && activeEditor) return;
      navigating = true;
      teardownActive();
      navigating = false;
      const tr = cell.parentElement as HTMLElement;
      activeCol = [...tr.children].indexOf(cell);
      activeRow = (tr.parentElement as HTMLElement).tagName === "THEAD" ? -1 : bodyRowEls().indexOf(tr);
      activeTable = { from: self.from, run: doOp };
      menu.style.display = "none";
      const src = cell.dataset.src ?? "";
      cell.innerHTML = "";
      activeCellEl = cell;
      const ed = mountCellEditor(cell, src, opts, handlers);
      activeEditor = ed;
      ed.focus();
      if (caret === "start") {
        ed.dispatch({ selection: { anchor: 0 } });
      } else if (caret === "end") {
        ed.dispatch({ selection: { anchor: ed.state.doc.length } });
      } else {
        // Map click coords to a document position only after the fresh editor has
        // laid out (posAtCoords is unreliable before the first measure).
        requestAnimationFrame(() => {
          if (activeEditor !== ed) return;
          const p = ed.posAtCoords(caret);
          ed.dispatch({ selection: { anchor: p ?? ed.state.doc.length } });
        });
      }
    }

    function focusCell(row: number, col: number, caret: "start" | "end") {
      const cell = cellAt(row, col);
      if (cell) mountInCell(cell, caret);
    }

    // Leave the table into the document: commit the whole table, place the caret.
    function exitTable(anchor: number | null) {
      navigating = true;
      teardownActive();
      navigating = false;
      self.commit(view, wrap);
      view.focus();
      if (anchor != null) {
        const pos = Math.max(0, Math.min(anchor, view.state.doc.length));
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      }
    }
    const exitUp = () => exitTable(self.from > 0 ? self.from - 1 : self.from);
    const exitDown = () => {
      navigating = true;
      teardownActive();
      navigating = false;
      self.commit(view, wrap);
      view.focus();
      const to = self.range(view).to;
      const endLine = view.state.doc.lineAt(Math.min(to, view.state.doc.length));
      if (endLine.number < view.state.doc.lines) {
        view.dispatch({ selection: { anchor: view.state.doc.line(endLine.number + 1).from }, scrollIntoView: true });
      } else {
        view.dispatch({ changes: { from: endLine.to, insert: "\n" }, selection: { anchor: endLine.to + 1 }, scrollIntoView: true });
      }
    };
    const moveLinear = (dir: number, caret: "start" | "end" = dir > 0 ? "start" : "end") => {
      let col = activeCol + dir;
      let row = activeRow;
      const n = numCols();
      if (col >= n) { col = 0; row += 1; }
      else if (col < 0) { col = n - 1; row -= 1; }
      if (row < -1) { exitUp(); return; }
      if (row > bodyRowEls().length - 1) self.appendRow(wrap);
      focusCell(row, col, caret);
    };

    const handlers: CellEditorHandlers = {
      onInput: (src) => { if (activeCellEl) activeCellEl.dataset.src = normalizeCell(src); },
      tab: (back) => moveLinear(back ? -1 : 1),
      enter: () => {
        const row = activeRow + 1;
        if (row > bodyRowEls().length - 1) self.appendRow(wrap);
        focusCell(row, activeCol, "end");
      },
      escape: () => exitTable(self.from),
      up: () => (activeRow <= -1 ? exitUp() : focusCell(activeRow - 1, activeCol, "end")),
      down: () => (activeRow >= bodyRowEls().length - 1 ? exitDown() : focusCell(activeRow + 1, activeCol, "end")),
      left: () => moveLinear(-1, "end"),
      right: () => moveLinear(1, "start"),
    };

    // Click a cell → mount its editor at the click position.
    wrap.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      // Ctrl/Cmd + click a footnote reference pill navigates in the *main*
      // document (jump to / create the definition) rather than entering cell-edit
      // mode — the cell's own tiny doc has no footnote definitions.
      const fnRef = target.closest?.(".cm-md-footnote-ref") as HTMLElement | null;
      if (fnRef && (e.ctrlKey || e.metaKey)) {
        const label = fnRef.getAttribute("data-label");
        if (label) {
          e.preventDefault();
          gotoOrCreateFootnote(view, label);
          return;
        }
      }
      // Ctrl/Cmd + click a rendered link navigates in the main document too. The
      // cell renders real `<a href>` elements, so the actual open/jump/create runs
      // on `click` (to cancel the native navigation); here we only avoid entering
      // cell-edit mode.
      if ((e.ctrlKey || e.metaKey) && target.closest?.(".cm-md-link")) {
        e.preventDefault();
        return;
      }
      const cell = target.closest?.("th,td") as HTMLElement | null;
      if (!cell || !wrap.contains(cell)) return;
      if (activeCellEl === cell && activeEditor) return; // already editing → native click
      e.preventDefault();
      mountInCell(cell, { x: e.clientX, y: e.clientY });
    });
    // Navigate a Ctrl/Cmd-clicked link on `click`, cancelling the `<a>`'s native
    // navigation (the mousedown above kept us out of cell-edit mode).
    wrap.addEventListener("click", (e) => {
      const link = (e.target as HTMLElement).closest?.(".cm-md-link");
      if (link && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        followRenderedLink(view, link);
      }
    });
    // Focus left the table entirely (clicked outside) → commit.
    wrap.addEventListener("focusout", (e) => {
      if (navigating) return;
      const to = e.relatedTarget as Node | null;
      if (to && wrap.contains(to)) return;
      if (activeEditor) { navigating = true; teardownActive(); navigating = false; }
      this.commit(view, wrap);
    });

    return wrap;
  }

  private makeCell(tag: "th" | "td", text: string, align: Align, opts: CellRenderOpts): HTMLElement {
    const el = document.createElement(tag);
    el.dataset.src = text;
    el.innerHTML = renderCellMarkdown(text, opts);
    const a = alignName(align);
    if (a) el.style.textAlign = a;
    return el;
  }

  private appendRow(wrap: HTMLElement): HTMLElement {
    const tbody = wrap.querySelector("tbody") as HTMLElement;
    const cols = wrap.querySelectorAll("thead th").length;
    const tr = document.createElement("tr");
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td");
      td.dataset.src = "";
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
