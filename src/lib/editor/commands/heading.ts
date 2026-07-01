// Heading / paragraph commands: rewrite the leading `#` markers on each selected line.

import type { EditorView } from "@codemirror/view";
import { mapLines } from "./util";

const HEADING_RE = /^(#{1,6})\s+/;

function stripHeading(text: string): string {
  return text.replace(HEADING_RE, "");
}

function levelOf(text: string): number {
  return HEADING_RE.exec(text)?.[1].length ?? 0;
}

/** Set the selected lines to heading `level` (0 = plain paragraph). */
export function setHeading(level: number) {
  return (view: EditorView): boolean =>
    mapLines(view, (text) => {
      const body = stripHeading(text);
      return level === 0 ? body : "#".repeat(level) + " " + body;
    });
}

/** Promote toward H1 (paragraph → H1, H3 → H2, …). */
export function headingIncrease(view: EditorView): boolean {
  return mapLines(view, (text) => {
    const level = levelOf(text);
    const body = stripHeading(text);
    const next = level === 0 ? 1 : Math.max(1, level - 1);
    return "#".repeat(next) + " " + body;
  });
}

/** Demote toward a paragraph (H1 → H2, … , H6 → paragraph). */
export function headingDecrease(view: EditorView): boolean {
  return mapLines(view, (text) => {
    const level = levelOf(text);
    if (level === 0) return text;
    const body = stripHeading(text);
    const next = level + 1;
    return next > 6 ? body : "#".repeat(next) + " " + body;
  });
}
