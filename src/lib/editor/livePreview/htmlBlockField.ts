import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";
import { renderHtml } from "./config";
import { imageBaseDir } from "./config";
import { HtmlBlockWidget, HtmlCommentWidget } from "./htmlWidgets";
import { VOID_TAGS } from "./inlineHtml";

/**
 * Idle block-HTML rendering. A block-level HTML region (`<details>`, `<table>`,
 * `<svg>`, media, iframes — the parser's `HTMLBlock` node) whose caret is
 * *outside* it is replaced by its rendered, sanitized HTML. Block/line-crossing
 * replace decorations must come from a StateField (a ViewPlugin can't provide
 * them) — the same constraint that puts table and block-math rendering in
 * StateFields. When the caret is inside a block, it's left as raw source for
 * editing.
 */
interface HtmlDecos {
  /** Idle block renders — all atomic (the caret steps over them). */
  set: DecorationSet;
}

const EMPTY: HtmlDecos = { set: Decoration.none };

/**
 * Whether a block's source is a *complete* HTML element, so we don't render it
 * half-typed. A void/self-closing root is complete immediately; anything else
 * needs its matching close tag. Comments/PIs are handled elsewhere.
 */
function isComplete(raw: string): boolean {
  const s = raw.trim();
  const m = /^<([a-zA-Z][\w-]*)/.exec(s);
  if (!m) return true; // doctype or other self-contained markup
  const tag = m[1].toLowerCase();
  if (VOID_TAGS.has(tag)) return true;
  if (/\/>\s*$/.test(s)) return true; // self-closing root element
  return new RegExp(`</${tag}\\s*>`, "i").test(s);
}

function build(state: EditorState): HtmlDecos {
  if (!state.facet(renderHtml)) return EMPTY;
  const doc = state.doc;
  const baseDir = state.facet(imageBaseDir);
  const renders: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      // HTML comments / processing instructions → muted collapsed chip (Typora
      // hides comments from the preview); caret inside leaves the raw source.
      if (node.name === "CommentBlock" || node.name === "ProcessingInstructionBlock") {
        const raw = doc.sliceString(node.from, node.to);
        const complete = node.name === "CommentBlock" ? raw.includes("-->") : raw.includes("?>");
        if (!complete) return false;
        if (isElementActive(state, node.from, node.to)) return false;
        renders.push(
          Decoration.replace({
            widget: new HtmlCommentWidget(raw),
            block: true,
          }).range(node.from, node.to),
        );
        return false;
      }
      if (node.name !== "HTMLBlock") return undefined;
      const raw = doc.sliceString(node.from, node.to);
      // Still being typed → leave as raw text.
      if (!isComplete(raw)) return false;
      // Caret inside → editing: keep the raw source visible.
      if (isElementActive(state, node.from, node.to)) return false;
      renders.push(
        Decoration.replace({
          widget: new HtmlBlockWidget(raw, baseDir),
          block: true,
        }).range(node.from, node.to),
      );
      return false;
    },
  });

  return { set: Decoration.set(renders, true) };
}

export const htmlBlockField = StateField.define<HtmlDecos>({
  create: (state) => build(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.startState.facet(renderHtml) !== tr.state.facet(renderHtml) ||
      tr.startState.facet(imageBaseDir) !== tr.state.facet(imageBaseDir)
    ) {
      return build(tr.state);
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.set),
    // Idle renders are atomic so the caret steps over them (into the block via
    // the click-to-edit badge or Up/Down navigation).
    EditorView.atomicRanges.of((view) => view.state.field(f).set),
  ],
});

/** Document ranges currently covered by an idle block-HTML render (for the inline
 *  pass / tag scan / navigation to skip). */
export function htmlBlockRanges(state: EditorState): { from: number; to: number }[] {
  const value = state.field(htmlBlockField, false);
  if (!value) return [];
  const out: { from: number; to: number }[] = [];
  const it = value.set.iter();
  while (it.value) {
    out.push({ from: it.from, to: it.to });
    it.next();
  }
  return out;
}
