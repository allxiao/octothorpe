// Command registry: maps a stable id to a CodeMirror command. Referenced by both
// the Paragraph menu (via the editor handle) and the editor keymap.

import type { EditorView } from "@codemirror/view";
import { setHeading, headingIncrease, headingDecrease } from "./heading";
import {
  listOrdered,
  listUnordered,
  listTask,
  taskToggle,
  taskComplete,
  taskIncomplete,
  indent,
  outdent,
} from "./list";
import {
  quote,
  mathBlock,
  codeFence,
  alert,
  horizontalRule,
  tableOfContents,
  yamlFrontMatter,
  linkReference,
  footnote,
  insertParagraphBefore,
  insertParagraphAfter,
} from "./block";
import {
  tableInsert,
  tableAddRowAbove,
  tableAddRowBelow,
  tableAddColBefore,
  tableAddColAfter,
  tableMoveRowUp,
  tableMoveRowDown,
  tableMoveColLeft,
  tableMoveColRight,
  tableDeleteRow,
  tableDeleteCol,
  tablePrettify,
  tableDelete,
} from "./table";
import { autoIndentSelected, autoIndentWhole } from "./code";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleCode,
  toggleMath,
  toggleStrike,
  toggleComment,
  toggleLink,
  clearFormat,
} from "./inline";

export type EditorCommand = (view: EditorView) => boolean;

export const COMMANDS: Record<string, EditorCommand> = {
  heading1: setHeading(1),
  heading2: setHeading(2),
  heading3: setHeading(3),
  heading4: setHeading(4),
  heading5: setHeading(5),
  heading6: setHeading(6),
  paragraph: setHeading(0),
  headingIncrease,
  headingDecrease,

  listOrdered,
  listUnordered,
  listTask,
  taskToggle,
  taskComplete,
  taskIncomplete,
  indent,
  outdent,

  quote,
  mathBlock,
  codeFence,
  horizontalRule,
  tableOfContents,
  yamlFrontMatter,
  linkReference,
  footnote,
  insertParagraphBefore,
  insertParagraphAfter,

  alertNote: alert("NOTE"),
  alertTip: alert("TIP"),
  alertImportant: alert("IMPORTANT"),
  alertWarning: alert("WARNING"),
  alertCaution: alert("CAUTION"),

  tableInsert,
  tableAddRowAbove,
  tableAddRowBelow,
  tableAddColBefore,
  tableAddColAfter,
  tableMoveRowUp,
  tableMoveRowDown,
  tableMoveColLeft,
  tableMoveColRight,
  tableDeleteRow,
  tableDeleteCol,
  tablePrettify,
  tableDelete,

  autoIndentSelected,
  autoIndentWhole,

  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleCode,
  toggleMath,
  toggleStrike,
  toggleComment,
  toggleLink,
  clearFormat,
};

export { blockState } from "./blockState";
export type { BlockState } from "./blockState";
export { inlineState } from "./inline";
export type { InlineState } from "./inline";
export { tableText, tableSkeleton } from "./table";
export { codeText } from "./code";
