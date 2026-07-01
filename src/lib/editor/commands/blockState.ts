// Block-type detection for menu checkmarks and enablement.

import type { EditorState } from "@codemirror/state";
import { detectTable } from "./table";
import { detectFence } from "./code";

export interface BlockState {
  /** 0 = paragraph, 1–6 = heading level. */
  heading: number;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  /** Checked state of the task on the current line, or null if not a task. */
  taskChecked: boolean | null;
  inTable: boolean;
  inCode: boolean;
}

export function blockState(state: EditorState): BlockState {
  const text = state.doc.lineAt(state.selection.main.head).text;
  const heading = /^(#{1,6})\s/.exec(text)?.[1].length ?? 0;
  const task = /^\s*[-*+]\s+\[([ xX])\]\s/.exec(text);
  return {
    heading,
    taskList: !!task,
    taskChecked: task ? /[xX]/.test(task[1]) : null,
    bulletList: !task && /^\s*[-*+]\s+/.test(text),
    orderedList: /^\s*\d+[.)]\s+/.test(text),
    inTable: detectTable(state) !== null,
    inCode: detectFence(state) !== null,
  };
}
