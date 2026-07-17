import { EditorView, ViewPlugin, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { renderFootnotes } from "./config";
import { isFootnoteDefMarker, gotoOrCreateFootnote } from "./footnotes";
import { followLink } from "./linkNav";

/** A navigable token under the pointer/caret. */
export interface NavTarget {
  from: number;
  to: number;
  kind: "link" | "footnote" | "footnoteDef";
  /** Footnote label (kinds `footnote`/`footnoteDef`). */
  label?: string;
  /** The Link syntax node (kind `link`). */
  node?: SyntaxNode;
}

/**
 * The navigable token (a Markdown link or footnote reference) at a document
 * position, or null. Shared by the Ctrl-click handler and the Ctrl-hover cursor
 * so that "shows a hand" and "actually navigates on click" always agree. Works
 * off the syntax tree, so it resolves the token whether it's rendered or in its
 * revealed (raw source) editing form. Footnotes only count while the
 * `markdown.footnotes` preference is on (otherwise `[^x]` is literal text).
 */
export function navTargetAtPos(state: EditorState, pos: number): NavTarget | null {
  let result: NavTarget | null = null;
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      if (result) return false;
      if (node.name === "FootnoteReference") {
        if (state.facet(renderFootnotes)) {
          const def = isFootnoteDefMarker(state, node.from, node.to);
          result = {
            from: node.from,
            to: node.to,
            kind: def ? "footnoteDef" : "footnote",
            label: state.doc.sliceString(node.from + 2, node.to - 1),
          };
        }
        return false;
      }
      if (node.name === "Link") {
        result = { from: node.from, to: node.to, kind: "link", node: node.node };
        return false;
      }
      return undefined;
    },
  });
  return result;
}

/** Sets (or clears, with null) the Ctrl-hover highlight range. */
const setModHover = StateEffect.define<{ from: number; to: number } | null>();

/**
 * Ctrl/Cmd+click navigation resolved from a document position: reads the target
 * (link or footnote reference) from `readView` and performs the action on
 * `actView`. The two differ for a table cell, where the token is read from the
 * cell's editor but the jump/open/create must run on the main document. Returns
 * whether it navigated.
 */
export function ctrlNavAt(readView: EditorView, pos: number, actView: EditorView = readView): boolean {
  const t = navTargetAtPos(readView.state, pos);
  if (!t) return false;
  if (t.kind === "link" && t.node) return followLink(readView, t.node, actView);
  if (t.kind === "footnote" && t.label != null) {
    gotoOrCreateFootnote(actView, t.label);
    return true;
  }
  // A footnote definition marker is handled by its own decoration handler.
  return false;
}

const MOD_MARK = Decoration.mark({ class: "cm-md-modclick" });

/**
 * One-range decoration marking the token under the pointer while a modifier is
 * held. The `.cm-md-modclick` class carries `cursor: pointer`, so a revealed
 * `[text](url)` / `[^label]` source shows a hand just like a rendered link.
 */
const modHoverField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setModHover)) {
        deco = e.value ? Decoration.set(MOD_MARK.range(e.value.from, e.value.to)) : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * While Ctrl/Cmd is held, highlight the link/footnote token under the pointer
 * with a pointer cursor — the affordance that a click will navigate, mirroring a
 * hyperlink. Tracks the modifier via mouse *and* key events so it appears the
 * moment Ctrl is pressed over a token, and clears when it's released.
 */
const modHoverPlugin = ViewPlugin.fromClass(
  class {
    lastX = -1;
    lastY = -1;
    cur: { from: number; to: number } | null = null;
    constructor(readonly view: EditorView) {}

    apply(mod: boolean) {
      let next: { from: number; to: number } | null = null;
      if (mod && this.lastX >= 0) {
        const pos = this.view.posAtCoords({ x: this.lastX, y: this.lastY });
        if (pos != null) {
          const t = navTargetAtPos(this.view.state, pos);
          if (t) next = { from: t.from, to: t.to };
        }
      }
      // Only dispatch when the highlighted range actually changes.
      if ((next?.from ?? -1) === (this.cur?.from ?? -1) && (next?.to ?? -1) === (this.cur?.to ?? -1)) {
        return;
      }
      this.cur = next;
      this.view.dispatch({ effects: setModHover.of(next) });
    }
  },
  {
    eventHandlers: {
      mousemove(event) {
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.apply(event.ctrlKey || event.metaKey);
      },
      keydown(event) {
        if (event.key === "Control" || event.key === "Meta") this.apply(true);
      },
      keyup(event) {
        if (event.key === "Control" || event.key === "Meta") this.apply(false);
      },
      mouseleave() {
        this.apply(false);
      },
    },
  },
);

/** Extension bundle: the Ctrl-hover pointer-cursor affordance. */
export const modClickCursor = [modHoverField, modHoverPlugin];
