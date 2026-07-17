import { StateField, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

/** A resolved footnote definition (`[^label]: content`). */
export interface Footnote {
  /** Label without the leading `^` (e.g. `fn1`). */
  label: string;
  /** Start of the definition line. */
  from: number;
  /** Document position where the content begins (after `[^label]: `). */
  contentFrom: number;
  /** The definition's content text (the Markdown after the marker). */
  content: string;
}

/**
 * A footnote *definition* line: optional indent, `[^label]:`, an optional single
 * separating space, then the content. The label excludes whitespace and brackets
 * (matching the reference parser in [../markdownExtensions.ts]).
 */
export const FOOTNOTE_DEF_RE = /^(\s*)\[\^([^\]\s[]+)\]:[ \t]?(.*)$/;

/** Footnote labels match case-insensitively (like link reference labels). */
export function normalizeFootnote(label: string): string {
  return label.trim().toLowerCase();
}

function build(state: EditorState): Map<string, Footnote> {
  const map = new Map<string, Footnote>();
  const doc = state.doc;
  // Empty definitions (`[^fn]: ` with no content yet) aren't paragraph nodes, so
  // scan lines by regex rather than the syntax tree (as the link-def line does).
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const m = FOOTNOTE_DEF_RE.exec(line.text);
    if (!m) continue;
    const key = normalizeFootnote(m[2]);
    if (!key || map.has(key)) continue; // first definition wins
    map.set(key, {
      label: m[2],
      from: line.from,
      // Everything before the captured content — this accounts for the optional
      // separating space, so the caret lands exactly at the content start.
      contentFrom: line.from + (line.text.length - m[3].length),
      content: m[3],
    });
  }
  return map;
}

/**
 * Document-wide index of footnote definitions, keyed by normalized label. Rebuilt
 * only on document changes (like {@link linkRefsField}).
 */
export const footnotesField = StateField.define<Map<string, Footnote>>({
  create: build,
  update(value, tr) {
    return tr.docChanged ? build(tr.state) : value;
  },
});

/** Resolve a footnote label to its definition, if one exists. */
export function resolveFootnote(state: EditorState, label: string): Footnote | undefined {
  return state.field(footnotesField, false)?.get(normalizeFootnote(label));
}

/**
 * Document position of the *first* body reference (`[^label]`) for a label, or
 * null when the label is only ever defined and never referenced. Definition
 * markers are skipped so a jump lands on a real in-prose reference.
 */
export function firstFootnoteReferencePos(state: EditorState, label: string): number | null {
  const key = normalizeFootnote(label);
  let pos: number | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (pos !== null) return false;
      if (
        node.name === "FootnoteReference" &&
        !isFootnoteDefMarker(state, node.from, node.to) &&
        normalizeFootnote(state.doc.sliceString(node.from + 2, node.to - 1)) === key
      ) {
        pos = node.from;
      }
      return undefined;
    },
  });
  return pos;
}

/**
 * Whether a `FootnoteReference` node is actually a definition *marker* — the
 * `[^label]` at the start of a `[^label]: …` line (nothing but indentation before
 * it, a colon right after). Such markers are rendered by the definition-line pass,
 * not as reference pills.
 */
export function isFootnoteDefMarker(state: EditorState, from: number, to: number): boolean {
  const line = state.doc.lineAt(from);
  return (
    state.doc.sliceString(line.from, from).trim() === "" &&
    state.doc.sliceString(to, to + 1) === ":"
  );
}

/**
 * Ctrl/Cmd+click on a footnote reference: move the caret to the start of the
 * matching definition's content. When there is no definition, scaffold an empty
 * `[^label]: ` stub at the end of the document and place the caret ready to type
 * the content (mirrors the link-reference `createOrGotoDef`).
 */
export function gotoOrCreateFootnote(view: EditorView, label: string): void {
  const def = resolveFootnote(view.state, label);
  view.focus();
  if (def) {
    view.dispatch({
      selection: { anchor: def.contentFrom },
      effects: EditorView.scrollIntoView(def.contentFrom, { y: "center" }),
    });
    return;
  }
  const doc = view.state.doc;
  const s = doc.toString();
  // A definition that directly follows a paragraph is treated as paragraph text,
  // so ensure a blank line precedes it.
  const prefix = s.length === 0 ? "" : s.endsWith("\n\n") ? "" : s.endsWith("\n") ? "\n" : "\n\n";
  const stub = `${prefix}[^${label}]: `;
  const at = doc.length;
  view.dispatch({
    changes: { from: at, insert: stub },
    selection: { anchor: at + stub.length },
    scrollIntoView: true,
  });
}

