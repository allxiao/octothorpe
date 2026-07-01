// Fenced-code detection. Code Tools (copy content, auto-indent) build on top of
// this later; for now we only locate the fence around the caret so the menu can
// report `inCode`.

import type { EditorState } from "@codemirror/state";

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
