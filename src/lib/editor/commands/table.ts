// GFM table editing engine. A table is located by line range (detectTable),
// parsed into header/alignment/body cells, mutated, then re-rendered. Parser and
// renderers are pure functions so the logic is easy to test in isolation.

import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";

export interface TableRange {
  top: number;
  bot: number;
}

type Align = "" | "left" | "center" | "right";

interface ParsedTable {
  top: number;
  bot: number;
  header: string[];
  align: Align[];
  rows: string[][];
  /** Caret location: row -1 = header, 0..n = body row index; col = column index. */
  cursor: { row: number; col: number };
}

const DELIM_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
const isRowLine = (t: string) => t.includes("|") && t.trim() !== "";

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

function parseRow(line: string): string[] {
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

const renderRow = (cells: string[]) => "| " + cells.join(" | ") + " |";
const delimCell = (a: Align) =>
  a === "center" ? ":---:" : a === "left" ? ":---" : a === "right" ? "---:" : "---";
const renderDelim = (align: Align[]) => "| " + align.map(delimCell).join(" | ") + " |";

function render(t: ParsedTable): string[] {
  return [renderRow(t.header), renderDelim(t.align), ...t.rows.map(renderRow)];
}

function renderPretty(t: ParsedTable): string[] {
  const cols = t.header.length;
  const width: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = t.header[c].length;
    for (const r of t.rows) w = Math.max(w, (r[c] ?? "").length);
    width[c] = Math.max(3, w);
  }
  const padCell = (s: string, c: number) => {
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
