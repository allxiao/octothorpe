import type { EditorState } from "@codemirror/state";

/**
 * Element-level reveal (Typora/Bear style): a node shows its raw Markdown only
 * when the selection actually touches the node's own range. Editing one element
 * on a line leaves the other elements on that line rendered.
 *
 * Boundaries are inclusive, so a caret resting immediately before or after the
 * element still reveals it (you're "in" it for editing purposes).
 */
export function isElementActive(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

/**
 * Line-level reveal: used for line-scoped markers (heading `#`, blockquote `>`)
 * whose only raw part is the marker itself — the rendered text/styling of the
 * line is unaffected by showing it. A node is active when the selection touches
 * any line the node spans.
 */
export function isLineActive(state: EditorState, from: number, to: number): boolean {
  const startLine = state.doc.lineAt(from);
  const endLine = to <= startLine.to ? startLine : state.doc.lineAt(to);
  const lineFrom = startLine.from;
  const lineTo = endLine.to;
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true;
  }
  return false;
}
