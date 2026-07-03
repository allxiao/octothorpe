import { StateField, type EditorState } from "@codemirror/state";
import { showTooltip, type Tooltip } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";
import { inlineMathRender } from "./config";
import { renderMath } from "../math/render";

/**
 * Typora-style live preview for inline math: while the caret is inside a `$…$`
 * span (its source revealed), float a small tooltip below it showing the
 * rendered result. Gated by the same `inlineMathRender` preference — off means
 * `$…$` is literal text with no rendering at all.
 */
function inlineMathTooltip(state: EditorState): Tooltip | null {
  if (!state.facet(inlineMathRender)) return null;
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);

  let target: { from: number; to: number } | null = null;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (node.name === "InlineMath" && isElementActive(state, node.from, node.to)) {
        target = { from: node.from, to: node.to };
      }
    },
  });
  if (!target) return null;

  const { from, to } = target;
  const latex = state.sliceDoc(from + 1, to - 1);
  if (!latex.trim()) return null;
  return {
    pos: from,
    end: to,
    above: false,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-md-math-tooltip";
      dom.innerHTML = renderMath(latex, false);
      return { dom };
    },
  };
}

export const inlineMathTooltipField = StateField.define<Tooltip | null>({
  create: inlineMathTooltip,
  update(value, tr) {
    if (
      !tr.docChanged &&
      !tr.selection &&
      tr.startState.facet(inlineMathRender) === tr.state.facet(inlineMathRender)
    ) {
      return value;
    }
    return inlineMathTooltip(tr.state);
  },
  provide: (f) => showTooltip.from(f),
});
