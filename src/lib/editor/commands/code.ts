// Fenced-code detection. Code Tools (copy content, auto-indent) build on top of
// this later; for now we only locate the fence around the caret so the menu can
// report `inCode`.

import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface FenceRange {
  /** Line numbers (1-based) of the opening and closing fences. */
  openLine: number;
  closeLine: number;
}

const FENCE_RE = /^\s*(```|~~~)/;

/** Locate the fenced code block containing the caret, or null. */
export function detectFence(state: EditorState): FenceRange | null {
  const cur = state.doc.lineAt(state.selection.main.head).number;
  let openLine = -1;
  for (let n = 1; n <= state.doc.lines; n++) {
    if (!FENCE_RE.test(state.doc.line(n).text)) continue;
    if (openLine === -1) {
      openLine = n;
    } else {
      if (cur >= openLine && cur <= n) return { openLine, closeLine: n };
      openLine = -1;
    }
  }
  // Unterminated fence: treat everything below the opener as inside it.
  if (openLine !== -1 && cur >= openLine) return { openLine, closeLine: state.doc.lines };
  return null;
}

/** The inner content of the fenced code block around the caret (for Copy Code Content). */
export function codeText(state: EditorState): string | null {
  const f = detectFence(state);
  if (!f) return null;
  const lines: string[] = [];
  for (let n = f.openLine + 1; n < f.closeLine; n++) lines.push(state.doc.line(n).text);
  return lines.join("\n");
}

// --- auto-indent ----------------------------------------------------------

const UNIT = "  ";

/**
 * Best-effort re-indentation by bracket depth: indent after a line whose net
 * bracket balance is positive, dedent lines that start with a closer. This suits
 * C/JS/JSON-like code; it is not correct for indentation-significant languages.
 */
function reindent(lines: string[]): string[] {
  let depth = 0;
  return lines.map((raw) => {
    const t = raw.trim();
    const here = /^[)}\]]/.test(t) ? Math.max(0, depth - 1) : depth;
    const out = t === "" ? "" : UNIT.repeat(here) + t;
    const opens = (t.match(/[([{]/g) || []).length;
    const closes = (t.match(/[)\]}]/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
    return out;
  });
}

export function autoIndentWhole(view: EditorView): boolean {
  const { state } = view;
  const f = detectFence(state);
  if (!f || f.closeLine - 1 < f.openLine + 1) {
    view.focus();
    return f != null;
  }
  const inner: string[] = [];
  for (let n = f.openLine + 1; n < f.closeLine; n++) inner.push(state.doc.line(n).text);
  const from = state.doc.line(f.openLine + 1).from;
  const to = state.doc.line(f.closeLine - 1).to;
  view.dispatch({ changes: { from, to, insert: reindent(inner).join("\n") }, scrollIntoView: true });
  view.focus();
  return true;
}

export function autoIndentSelected(view: EditorView): boolean {
  const { state } = view;
  const f = detectFence(state);
  if (!f || f.closeLine - 1 < f.openLine + 1) {
    view.focus();
    return f != null;
  }
  const first = f.openLine + 1;
  const last = f.closeLine - 1;
  const inner: string[] = [];
  for (let n = first; n <= last; n++) inner.push(state.doc.line(n).text);
  const fixed = reindent(inner);

  const sel = state.selection.main;
  const selFrom = state.doc.lineAt(sel.from).number;
  const selTo = state.doc.lineAt(sel.to).number;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let n = first; n <= last; n++) {
    if (n < selFrom || n > selTo) continue;
    const line = state.doc.line(n);
    const next = fixed[n - first];
    if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}
