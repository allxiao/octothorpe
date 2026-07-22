import { ViewPlugin, EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { renderCellMarkdown, type CellRenderOpts } from "./cellRender";
import { imageBaseDir, inlineMathDisplayStyle, renderFootnotes } from "./config";
import { linkRefsField } from "./linkRefs";
import { footnotesField, resolveFootnote } from "./footnotes";

/**
 * Hover tooltip for footnote references (`.cm-md-footnote-ref` pills, both the
 * body widgets and the ones rendered inside table cells). Shows the definition's
 * content rendered as Markdown — the same inline constructs the editor renders —
 * instead of the raw source that a native `title` attribute would show.
 *
 * A single delegated listener on `view.dom` covers every pill regardless of where
 * it lives (body or nested cell editor), resolving the content by label against
 * the document's footnote definitions. The tooltip DOM lives inside `view.dom` so
 * the rendered content inherits the editor's `.cm-md-*` styling.
 */
class FootnoteTooltip implements PluginValue {
  private tip: HTMLElement | null = null;
  private current: HTMLElement | null = null;

  constructor(private readonly view: EditorView) {
    view.dom.addEventListener("mouseover", this.onOver);
    view.dom.addEventListener("mouseout", this.onOut);
    view.scrollDOM.addEventListener("scroll", this.hide, true);
  }

  private onOver = (e: MouseEvent) => {
    const ref = (e.target as HTMLElement)?.closest?.(".cm-md-footnote-ref") as HTMLElement | null;
    if (!ref || ref.classList.contains("cm-md-footnote-ref-missing")) {
      if (this.current && ref !== this.current) this.hide();
      return;
    }
    if (ref === this.current) return;
    this.show(ref);
  };

  private onOut = (e: MouseEvent) => {
    if (!this.current) return;
    const to = e.relatedTarget as Node | null;
    if (to && this.current.contains(to)) return; // still inside the same pill
    this.hide();
  };

  private show(ref: HTMLElement) {
    const label = ref.getAttribute("data-label");
    if (!label) return;
    const def = resolveFootnote(this.view.state, label);
    if (!def || !def.content.trim()) {
      this.hide();
      return;
    }
    const state = this.view.state;
    const opts: CellRenderOpts = {
      baseDir: state.facet(imageBaseDir),
      displaystyle: state.facet(inlineMathDisplayStyle),
      linkRefs: state.field(linkRefsField, false) ?? new Map(),
      footnotes: state.facet(renderFootnotes)
        ? (state.field(footnotesField, false) ?? new Map())
        : undefined,
    };
    if (!this.tip) {
      this.tip = document.createElement("div");
      this.tip.className = "cm-md-footnote-tooltip";
      this.view.dom.appendChild(this.tip);
    }
    this.tip.innerHTML = renderCellMarkdown(def.content, opts);
    this.current = ref;
    this.position(ref);
  }

  private position(ref: HTMLElement) {
    const tip = this.tip;
    if (!tip) return;
    const r = ref.getBoundingClientRect();
    const pad = 6;
    tip.style.visibility = "hidden";
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    let left = r.left;
    if (vw && left + tw > vw - 8) left = Math.max(8, vw - tw - 8);
    let top = r.bottom + pad;
    if (vh && top + th > vh - 8) top = r.top - th - pad; // flip above the pill
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
    tip.style.visibility = "visible";
  }

  private hide = () => {
    if (this.tip) this.tip.style.display = "none";
    this.current = null;
  };

  update(u: ViewUpdate) {
    // A doc edit can move/retarget the hovered pill or change the definition.
    if (u.docChanged) this.hide();
  }

  destroy() {
    this.view.dom.removeEventListener("mouseover", this.onOver);
    this.view.dom.removeEventListener("mouseout", this.onOut);
    this.view.scrollDOM.removeEventListener("scroll", this.hide, true);
    this.tip?.remove();
    this.tip = null;
  }
}

export const footnoteTooltip = ViewPlugin.fromClass(FootnoteTooltip);
