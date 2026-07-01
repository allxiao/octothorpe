// GFM table detection. The full editing engine (insert/move/delete/prettify) is
// added on top of this in a later step; for now we only locate the table block
// around the caret so the menu can report `inTable`.

import type { EditorState } from "@codemirror/state";

export interface TableRange {
  /** First and last line numbers (1-based) of the table block. */
  top: number;
  bot: number;
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

  // A real GFM table needs at least a header + a delimiter row.
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
