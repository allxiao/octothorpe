import type { EditorState } from "@codemirror/state";

/**
 * Obsidian-style reveal rule: a node is "active" (its raw Markdown markers are
 * shown instead of being rendered) when the selection touches any line the node
 * spans. The line under the cursor shows source; every other line renders.
 *
 * We expand the node range to whole lines so that placing the cursor anywhere on
 * a line reveals the markup for constructs on that line.
 */
export function isRangeActive(state: EditorState, from: number, to: number): boolean {
  const startLine = state.doc.lineAt(from);
  const endLine = to <= startLine.to ? startLine : state.doc.lineAt(to);
  const lineFrom = startLine.from;
  const lineTo = endLine.to;
  for (const range of state.selection.ranges) {
    // Overlap test between the selection range and the node's line span.
    if (range.from <= lineTo && range.to >= lineFrom) return true;
  }
  return false;
}
