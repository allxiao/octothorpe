// List commands: toggle ordered / unordered / task lists, task status, and
// indentation on the selected lines.

import type { EditorView } from "@codemirror/view";
import { indentOf, mapLines, selectedLines } from "./util";

const BULLET_RE = /^(\s*)[-*+]\s+/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+/;
const TASK_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;

/** Remove any list marker (bullet / ordered / task), keeping the indent + text. */
function stripMarker(text: string): string {
  if (TASK_RE.test(text)) return text.replace(TASK_RE, "$1");
  if (BULLET_RE.test(text)) return text.replace(BULLET_RE, "$1");
  if (ORDERED_RE.test(text)) return text.replace(ORDERED_RE, "$1");
  return text;
}

const isBullet = (t: string) => BULLET_RE.test(t) && !TASK_RE.test(t);
const isBlank = (t: string) => t.trim() === "";

export function listUnordered(view: EditorView): boolean {
  const allOn = selectedLines(view.state).every((l) => isBullet(l.text));
  return mapLines(view, (text) => {
    const stripped = stripMarker(text);
    if (allOn) return stripped;
    if (isBlank(stripped)) return text;
    const ind = indentOf(stripped);
    return ind + "- " + stripped.slice(ind.length);
  });
}

export function listOrdered(view: EditorView): boolean {
  const allOn = selectedLines(view.state).every((l) => ORDERED_RE.test(l.text));
  let n = 0;
  return mapLines(view, (text) => {
    const stripped = stripMarker(text);
    if (allOn) return stripped;
    if (isBlank(stripped)) return text;
    n += 1;
    const ind = indentOf(stripped);
    return ind + n + ". " + stripped.slice(ind.length);
  });
}

export function listTask(view: EditorView): boolean {
  const allOn = selectedLines(view.state).every((l) => TASK_RE.test(l.text));
  return mapLines(view, (text) => {
    const stripped = stripMarker(text);
    if (allOn) return stripped;
    if (isBlank(stripped)) return text;
    const ind = indentOf(stripped);
    return ind + "- [ ] " + stripped.slice(ind.length);
  });
}

const setTask = (text: string, checked: boolean) =>
  TASK_RE.test(text) ? text.replace(TASK_RE, `$1$2 [${checked ? "x" : " "}] `) : text;

export function taskToggle(view: EditorView): boolean {
  return mapLines(view, (text) => {
    const m = TASK_RE.exec(text);
    if (!m) return text;
    return setTask(text, !/[xX]/.test(m[3]));
  });
}
export function taskComplete(view: EditorView): boolean {
  return mapLines(view, (t) => setTask(t, true));
}
export function taskIncomplete(view: EditorView): boolean {
  return mapLines(view, (t) => setTask(t, false));
}

const UNIT = "  ";
export function indent(view: EditorView): boolean {
  return mapLines(view, (t) => (t.trim() === "" ? t : UNIT + t));
}
export function outdent(view: EditorView): boolean {
  return mapLines(view, (t) => t.replace(/^(\t| {1,2})/, ""));
}
