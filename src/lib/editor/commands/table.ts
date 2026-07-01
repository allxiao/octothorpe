// GFM table editing engine. A table is located by line range (detectTable),
// parsed into header/alignment/body cells, mutated, then re-rendered. Parser and
// renderers are pure functions so the logic is easy to test in isolation.

import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { detectFence } from "./code";

export interface TableRange {
  top: number;
  bot: number;
}

export type Align = "" | "left" | "center" | "right";

/** A table as pure data (no document positions), shared with the WYSIWYG widget. */
export interface TableModel {
  header: string[];
  align: Align[];
  rows: string[][];
}

interface ParsedTable extends TableModel {
  top: number;
  bot: number;
  /** Caret location: row -1 = header, 0..n = body row index; col = column index. */
  cursor: { row: number; col: number };
}

const DELIM_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
const isRowLine = (t: string) => t.includes("|") && t.trim() !== "";

/** Whether a line is a table delimiter row (`| --- | :--: |`). */
export function isDelimiterRow(text: string): boolean {
  return DELIM_RE.test(text);
}

/** Locate the contiguous table block containing the caret, or null. */
export function detectTable(state: EditorState): TableRange | null {
  const cur = state.doc.lineAt(state.selection.main.head).number;
  if (!isRowLine(state.doc.line(cur).text)) return null;

  let top = cur;
  let bot = cur;
  while (top > 1 && isRowLine(state.doc.line(top - 1).text)) top--;
  while (bot < state.doc.lines && isRowLine(state.doc.line(bot + 1).text)) bot++;

  let hasDelim = false;
  for (let n = top; n <= bot; n++) {
    if (DELIM_RE.test(state.doc.line(n).text)) {
      hasDelim = true;
      break;
    }
  }
  if (bot - top < 1 || !hasDelim) return null;
  return { top, bot };
}

/** The full Markdown text of the table around the caret (for Copy Table). */
export function tableText(state: EditorState): string | null {
  const r = detectTable(state);
  if (!r) return null;
  const lines: string[] = [];
  for (let n = r.top; n <= r.bot; n++) lines.push(state.doc.line(n).text);
  return lines.join("\n");
}

// --- parsing --------------------------------------------------------------

export function parseRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += s[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlign(cell: string): Align {
  const t = cell.trim();
  const l = t.startsWith(":");
  const r = t.endsWith(":");
  if (l && r) return "center";
  if (r) return "right";
  if (l) return "left";
  return "";
}

function parseTable(state: EditorState): ParsedTable | null {
  const range = detectTable(state);
  if (!range) return null;
  const { top, bot } = range;

  const lines: string[] = [];
  for (let n = top; n <= bot; n++) lines.push(state.doc.line(n).text);
  let delimIdx = lines.findIndex((l) => DELIM_RE.test(l));
  if (delimIdx < 1) delimIdx = 1;

  const header = parseRow(lines[0]);
  const align = parseRow(lines[delimIdx]).map(parseAlign);
  const rows = lines.slice(delimIdx + 1).map(parseRow);

  const cols = Math.max(header.length, align.length, ...rows.map((r) => r.length), 1);
  const pad = (r: string[]) => {
    const out = r.slice(0, cols);
    while (out.length < cols) out.push("");
    return out;
  };
  const padAlign = (a: Align[]) => {
    const out = a.slice(0, cols);
    while (out.length < cols) out.push("");
    return out;
  };

  const caret = state.selection.main.head;
  const caretLine = state.doc.lineAt(caret).number;
  const row = caretLine > top + delimIdx ? caretLine - (top + delimIdx) - 1 : -1;
  const before = state.doc.sliceString(state.doc.line(caretLine).from, caret);
  const col = Math.min(Math.max(0, (before.match(/\|/g)?.length ?? 1) - 1), cols - 1);

  return {
    top,
    bot,
    header: pad(header),
    align: padAlign(align),
    rows: rows.map(pad),
    cursor: { row, col },
  };
}

// --- rendering ------------------------------------------------------------

const escapeCell = (s: string) => s.replace(/\|/g, "\\|");
const renderRow = (cells: string[]) => "| " + cells.map(escapeCell).join(" | ") + " |";
const delimCell = (a: Align) =>
  a === "center" ? ":---:" : a === "left" ? ":---" : a === "right" ? "---:" : "---";
const renderDelim = (align: Align[]) => "| " + align.map(delimCell).join(" | ") + " |";

function render(t: TableModel): string[] {
  return [renderRow(t.header), renderDelim(t.align), ...t.rows.map(renderRow)];
}

function renderPretty(t: TableModel): string[] {
  const cols = t.header.length;
  const width: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = escapeCell(t.header[c]).length;
    for (const r of t.rows) w = Math.max(w, escapeCell(r[c] ?? "").length);
    width[c] = Math.max(3, w);
  }
  const padCell = (raw: string, c: number) => {
    const s = escapeCell(raw);
    const len = width[c];
    if (t.align[c] === "right") return s.padStart(len);
    if (t.align[c] === "center") {
      const total = len - s.length;
      const left = Math.floor(total / 2);
      return " ".repeat(left) + s + " ".repeat(total - left);
    }
    return s.padEnd(len);
  };
  const row = (cells: string[]) => "| " + cells.map((s, c) => padCell(s ?? "", c)).join(" | ") + " |";
  const delim =
    "| " +
    t.align
      .map((a, c) => {
        const len = width[c];
        if (a === "center") return ":" + "-".repeat(len - 2) + ":";
        if (a === "right") return "-".repeat(len - 1) + ":";
        if (a === "left") return ":" + "-".repeat(len - 1);
        return "-".repeat(len);
      })
      .join(" | ") +
    " |";
  return [row(t.header), delim, ...t.rows.map(row)];
}

// --- pure model helpers (shared with the WYSIWYG table widget) -------------

/** Parse a table's Markdown text into a column-normalized model. */
export function parseTableText(md: string): TableModel {
  const lines = md.split("\n").filter((l) => l.trim() !== "");
  let delimIdx = lines.findIndex((l) => DELIM_RE.test(l));
  if (delimIdx < 1) delimIdx = 1;
  const header = parseRow(lines[0] ?? "");
  const align = parseRow(lines[delimIdx] ?? "").map(parseAlign);
  const rows = lines.slice(delimIdx + 1).map(parseRow);
  const cols = Math.max(header.length, align.length, ...rows.map((r) => r.length), 1);
  const pad = <T>(a: T[], fill: T) => {
    const out = a.slice(0, cols);
    while (out.length < cols) out.push(fill);
    return out;
  };
  return {
    header: pad(header, ""),
    align: pad(align, "" as Align),
    rows: rows.map((r) => pad(r, "")),
  };
}

/** Serialize a table model back to Markdown (optionally width-aligned). */
export function renderTableText(model: TableModel, pretty = false): string {
  return (pretty ? renderPretty(model) : render(model)).join("\n");
}

// --- pure model mutations (used by the WYSIWYG table toolbar) --------------

const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len));

export function modelAddRow(m: TableModel, at: number) {
  m.rows.splice(clampIndex(at, m.rows.length), 0, Array(m.header.length).fill(""));
}
export function modelAddCol(m: TableModel, at: number) {
  const i = clampIndex(at, m.header.length);
  m.header.splice(i, 0, "");
  m.align.splice(i, 0, "");
  m.rows.forEach((r) => r.splice(i, 0, ""));
}
export function modelDeleteRow(m: TableModel, at: number) {
  if (at >= 0 && at < m.rows.length) m.rows.splice(at, 1);
}
export function modelDeleteCol(m: TableModel, at: number) {
  if (m.header.length > 1 && at >= 0 && at < m.header.length) {
    m.header.splice(at, 1);
    m.align.splice(at, 1);
    m.rows.forEach((r) => r.splice(at, 1));
  }
}
export function modelMoveRow(m: TableModel, at: number, dir: -1 | 1) {
  const j = at + dir;
  if (at >= 0 && at < m.rows.length && j >= 0 && j < m.rows.length) {
    [m.rows[at], m.rows[j]] = [m.rows[j], m.rows[at]];
  }
}
export function modelMoveCol(m: TableModel, at: number, dir: -1 | 1) {
  const j = at + dir;
  if (at >= 0 && at < m.header.length && j >= 0 && j < m.header.length) {
    const swap = (a: unknown[]) => ([a[at], a[j]] = [a[j], a[at]]);
    swap(m.header);
    swap(m.align);
    m.rows.forEach(swap);
  }
}
export function modelSetAlign(m: TableModel, col: number, a: Align) {
  if (col >= 0 && col < m.align.length) m.align[col] = a;
}

/** Find every table block overlapping the line range [from, to] (document positions). */
export function findTables(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number; md: string }[] {
  const out: { from: number; to: number; md: string }[] = [];
  const firstLine = state.doc.lineAt(from).number;
  const lastLine = state.doc.lineAt(to).number;
  let n = firstLine;
  while (n <= lastLine) {
    if (!isRowLine(state.doc.line(n).text)) {
      n++;
      continue;
    }
    let top = n;
    let bot = n;
    while (top > 1 && isRowLine(state.doc.line(top - 1).text)) top--;
    while (bot < state.doc.lines && isRowLine(state.doc.line(bot + 1).text)) bot++;
    let hasDelim = false;
    for (let k = top; k <= bot; k++) {
      if (DELIM_RE.test(state.doc.line(k).text)) {
        hasDelim = true;
        break;
      }
    }
    if (hasDelim && bot - top >= 1) {
      const f = state.doc.line(top).from;
      const t = state.doc.line(bot).to;
      out.push({ from: f, to: t, md: state.doc.sliceString(f, t) });
    }
    n = bot + 1;
  }
  return out;
}

/** Replace the table block with `lines` and place the caret on table-line `targetIdx`. */
function apply(view: EditorView, t: ParsedTable, lines: string[], targetIdx: number): boolean {
  const { state } = view;
  const from = state.doc.line(t.top).from;
  const to = state.doc.line(t.bot).to;
  const text = lines.join("\n");
  let anchor = from;
  for (let i = 0; i < targetIdx && i < lines.length; i++) anchor += lines[i].length + 1;
  anchor = Math.min(anchor + 2, from + text.length);
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor }, scrollIntoView: true });
  view.focus();
  return true;
}

/** Table-line index (0 header, 1 delimiter, 2+ body) for a body-row index. */
const bodyLine = (rowIdx: number) => 2 + Math.max(0, rowIdx);
const emptyRow = (cols: number) => Array(cols).fill("");

// --- operations -----------------------------------------------------------

export function tableInsert(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const prefix = line.text.trim() === "" ? "" : "\n\n";
  const tpl = prefix + "|  |  |\n| --- | --- |\n|  |  |";
  const sel = state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: tpl },
    selection: { anchor: sel.from + prefix.length + 2 },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** A `cols`-wide GFM table skeleton with `rows` total rows (1 header + body). */
export function tableSkeleton(cols: number, rows: number): string {
  const c = Math.max(1, Math.round(cols));
  const body = Math.max(1, Math.round(rows) - 1);
  const rowLine = "|" + "  |".repeat(c);
  const delim = "|" + " --- |".repeat(c);
  return [rowLine, delim, ...Array(body).fill(rowLine)].join("\n");
}

function op(fn: (t: ParsedTable) => { lines: string[]; target: number } | null) {
  return (view: EditorView): boolean => {
    const t = parseTable(view.state);
    if (!t) return false;
    const res = fn(t);
    if (!res) {
      view.focus();
      return true;
    }
    return apply(view, t, res.lines, res.target);
  };
}

export const tableAddRowAbove = op((t) => {
  const at = t.cursor.row < 0 ? 0 : t.cursor.row;
  t.rows.splice(at, 0, emptyRow(t.header.length));
  return { lines: render(t), target: bodyLine(at) };
});

export const tableAddRowBelow = op((t) => {
  const at = t.cursor.row < 0 ? 0 : t.cursor.row + 1;
  t.rows.splice(at, 0, emptyRow(t.header.length));
  return { lines: render(t), target: bodyLine(at) };
});

export const tableAddColBefore = op((t) => {
  const at = t.cursor.col;
  t.header.splice(at, 0, "");
  t.align.splice(at, 0, "");
  t.rows.forEach((r) => r.splice(at, 0, ""));
  return { lines: render(t), target: bodyLine(t.cursor.row) };
});

export const tableAddColAfter = op((t) => {
  const at = t.cursor.col + 1;
  t.header.splice(at, 0, "");
  t.align.splice(at, 0, "");
  t.rows.forEach((r) => r.splice(at, 0, ""));
  return { lines: render(t), target: bodyLine(t.cursor.row) };
});

export const tableMoveRowUp = op((t) => {
  const r = t.cursor.row;
  if (r <= 0) return null;
  [t.rows[r - 1], t.rows[r]] = [t.rows[r], t.rows[r - 1]];
  return { lines: render(t), target: bodyLine(r - 1) };
});

export const tableMoveRowDown = op((t) => {
  const r = t.cursor.row;
  if (r < 0 || r >= t.rows.length - 1) return null;
  [t.rows[r + 1], t.rows[r]] = [t.rows[r], t.rows[r + 1]];
  return { lines: render(t), target: bodyLine(r + 1) };
});

function swapCol(t: ParsedTable, a: number, b: number) {
  [t.header[a], t.header[b]] = [t.header[b], t.header[a]];
  [t.align[a], t.align[b]] = [t.align[b], t.align[a]];
  t.rows.forEach((r) => ([r[a], r[b]] = [r[b], r[a]]));
}

export const tableMoveColLeft = op((t) => {
  const c = t.cursor.col;
  if (c <= 0) return null;
  swapCol(t, c - 1, c);
  return { lines: render(t), target: bodyLine(t.cursor.row) };
});

export const tableMoveColRight = op((t) => {
  const c = t.cursor.col;
  if (c >= t.header.length - 1) return null;
  swapCol(t, c, c + 1);
  return { lines: render(t), target: bodyLine(t.cursor.row) };
});

export const tableDeleteRow = op((t) => {
  const r = t.cursor.row;
  if (r < 0 || t.rows.length === 0) return null;
  t.rows.splice(r, 1);
  return { lines: render(t), target: bodyLine(Math.min(r, t.rows.length - 1)) };
});

export const tableDeleteCol = op((t) => {
  if (t.header.length <= 1) return null;
  const c = t.cursor.col;
  t.header.splice(c, 1);
  t.align.splice(c, 1);
  t.rows.forEach((r) => r.splice(c, 1));
  return { lines: render(t), target: bodyLine(t.cursor.row) };
});

export const tablePrettify = op((t) => ({ lines: renderPretty(t), target: bodyLine(t.cursor.row) }));

export function tableDelete(view: EditorView): boolean {
  const r = detectTable(view.state);
  if (!r) return false;
  const { state } = view;
  const from = state.doc.line(r.top).from;
  // include the trailing newline so no blank line is left behind
  const to = Math.min(state.doc.line(r.bot).to + 1, state.doc.length);
  view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from }, scrollIntoView: true });
  view.focus();
  return true;
}

/** Focus the first cell of the table at `tableFrom` (after its DOM renders). */
export function focusTableCell(view: EditorView, tableFrom: number, selector: string) {
  requestAnimationFrame(() => {
    const node: Node = view.domAtPos(tableFrom).node;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    const wrap = el?.closest(".cm-md-table-wrap") ?? view.dom.querySelector(".cm-md-table-wrap");
    (wrap?.querySelector(selector) as HTMLElement | null)?.focus();
  });
}

/**
 * Enter on a lone pipe-row header (`|a|b|`) completes it into a table by adding a
 * delimiter row and an empty body row. Returns false (normal Enter) otherwise.
 */
export function autoTable(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false; // only at the end of the line
  const text = line.text;
  if (!text.includes("|") || DELIM_RE.test(text)) return false;
  if (line.number < state.doc.lines && DELIM_RE.test(state.doc.line(line.number + 1).text)) {
    return false; // already the header of a table
  }
  if (detectFence(state)) return false; // not inside a code fence
  const cols = Math.max(1, parseRow(text).length);
  const delim = "|" + " --- |".repeat(cols);
  const body = "|" + "  |".repeat(cols);
  // Keep a blank line after the table so the caret has a home outside the widget.
  const atEnd = line.to === state.doc.length;
  const insert = "\n" + delim + "\n" + body + (atEnd ? "\n" : "");
  const newLen = state.doc.length + insert.length;
  const anchor = Math.min(line.to + insert.length + (atEnd ? 0 : 1), newLen);
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor },
    scrollIntoView: true,
  });
  focusTableCell(view, line.from, "tbody td");
  return true;
}
