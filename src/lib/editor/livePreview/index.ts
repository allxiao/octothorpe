import {
  ViewPlugin,
  EditorView,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildDecorations } from "./build";
import { onTagClick, revealSimpleSource, inlineMathRender, inlineMathDisplayStyle, renderHtml, renderSubscript, renderSuperscript, renderHighlight, renderEmoji } from "./config";
import { tableField } from "./tableField";
import { mathField } from "./mathField";
import { mermaidField } from "./mermaidField";
import { clearMermaidCache, mermaidReadyEffect } from "../mermaid/render";
import { mathRendererEffect } from "../math/render";
import { htmlBlockField } from "./htmlBlockField";
import { inlineMathTooltipField } from "./mathTooltip";
import { linkRefsField } from "./linkRefs";
import { clearActiveTable, tableWidthField } from "./TableWidget";
import { openUrl } from "../../ipc/commands";

/** Open a URL with the OS default handler (falls back to a tab in the browser). */
function openExternal(url: string) {
  if ("__TAURI_INTERNALS__" in window) void openUrl(url).catch(() => {});
  else window.open(url, "_blank", "noopener");
}

/**
 * GitHub-style header anchor: lowercase, drop everything but letters/numbers
 * within each whitespace-separated word, and join the words with `-`.
 */
function anchorOf(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .join("-");
}

/** Scroll to (and place the caret at) the header whose anchor matches `#anchor`. */
function jumpToAnchor(view: EditorView, rawAnchor: string) {
  const target = rawAnchor.toLowerCase();
  const counts = new Map<string, number>();
  let pos = -1;
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (pos < 0 && /^(ATXHeading|SetextHeading)[1-6]$/.test(node.name)) {
        const line = view.state.doc.lineAt(node.from);
        const text = view.state.doc
          .sliceString(node.from, Math.min(node.to, line.to))
          .replace(/^\s*#+\s*/, "")
          .replace(/\s+#+\s*$/, "");
        let a = anchorOf(text);
        const c = counts.get(a) ?? 0; // duplicate anchors get -2, -3, …
        counts.set(a, c + 1);
        if (c > 0) a = `${a}-${c + 1}`;
        if (a === target) pos = line.from;
        return false;
      }
      return undefined;
    },
  });
  if (pos < 0) return;
  view.focus();
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start" }),
  });
}

/**
 * Ctrl/Cmd+click on a reference link whose definition is missing: jump to an
 * existing (possibly empty) `[label]:` line if there is one, otherwise scaffold
 * a stub at the end of the document with the caret ready to type the URL.
 */
function createOrGotoDef(view: EditorView, label: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const key = norm(label);
  const doc = view.state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const m = /^\s*\[([^\]]*)\]:/.exec(line.text);
    if (m && norm(m[1]) === key) {
      view.focus();
      view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
      return;
    }
  }
  const s = doc.toString();
  // A definition that directly follows a paragraph is treated as paragraph
  // text, so make sure a blank line precedes it.
  const prefix = s.length === 0 ? "" : s.endsWith("\n\n") ? "" : s.endsWith("\n") ? "\n" : "\n\n";
  const stub = `${prefix}[${label}]: `;
  const at = doc.length;
  view.focus();
  view.dispatch({
    changes: { from: at, insert: stub },
    selection: { anchor: at + stub.length },
    scrollIntoView: true,
  });
}

/**
 * Live-preview ViewPlugin. Rebuilds decorations on document, viewport, or
 * selection changes — viewport-scoped so typing stays smooth in large docs.
 */
class LivePreviewPlugin {
  decorations: DecorationSet;
  atomic: DecorationSet;

  constructor(view: EditorView) {
    const built = buildDecorations(view);
    this.decorations = built.decorations;
    this.atomic = built.atomic;
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      update.startState.facet(revealSimpleSource) !== update.state.facet(revealSimpleSource) ||
      update.startState.facet(inlineMathRender) !== update.state.facet(inlineMathRender) ||
      update.startState.facet(inlineMathDisplayStyle) !== update.state.facet(inlineMathDisplayStyle) ||
      update.startState.facet(renderHtml) !== update.state.facet(renderHtml) ||
      update.startState.facet(renderSubscript) !== update.state.facet(renderSubscript) ||
      update.startState.facet(renderSuperscript) !== update.state.facet(renderSuperscript) ||
      update.startState.facet(renderHighlight) !== update.state.facet(renderHighlight) ||
      update.startState.facet(renderEmoji) !== update.state.facet(renderEmoji) ||
      update.transactions.some((tr) => tr.effects.some((e) => e.is(mathRendererEffect)))
    ) {
      const built = buildDecorations(update.view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
  }
}

const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
  // Make hidden/replaced spans atomic so the cursor and selection step over
  // them instead of landing inside a marker that isn't visible.
  provide: (plugin) =>
    EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
});

// Apply the persisted table width mode (compact/full) as a class on the editor
// root so tables pick it up; the toolbar buttons update it via a state effect.
const livePreviewTheme = EditorView.theme({
  ".cm-md-heading": { fontWeight: "700", lineHeight: "1.25" },
  ".cm-md-h1": { fontSize: "1.9em" },
  ".cm-md-h2": { fontSize: "1.6em" },
  ".cm-md-h3": { fontSize: "1.35em" },
  ".cm-md-h4": { fontSize: "1.15em" },
  ".cm-md-h5": { fontSize: "1.05em" },
  ".cm-md-h6": { fontSize: "1em", opacity: "0.8" },
  ".cm-md-quote": {
    borderLeft: "3px solid var(--border, #ccc)",
    paddingLeft: "0.8em",
    opacity: "0.85",
    fontStyle: "italic",
  },
  ".cm-md-code": {
    fontFamily: "var(--editor-font, monospace)",
    background: "rgba(135, 131, 120, 0.18)",
    borderRadius: "3px",
    padding: "0.1em 0.3em",
  },
  // Fenced code block: a box drawn from per-line backgrounds. The code text
  // stays real (natively highlighted) text; the two fence lines collapse away.
  ".cm-md-code-block": {
    background: "var(--code-block-bg, rgba(135, 131, 120, 0.1))",
    fontFamily: "var(--editor-font, monospace)",
    padding: "0 0.8em",
  },
  ".cm-md-code-top": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    paddingTop: "0.4em",
  },
  ".cm-md-code-bottom": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    paddingBottom: "0.4em",
  },
  // The opening/closing fence lines carry only the hidden ``` marks — collapse
  // them so the box is purely code. The closing line hosts the language box
  // (positioned against it), so it stays the box's bottom-right anchor.
  ".cm-md-code-fence": {
    position: "relative",
    height: "0",
    padding: "0",
    lineHeight: "0",
  },
  ".cm-md-code-fence .cm-widgetBuffer": { display: "none" },
  ".cm-md-code-lang": {
    position: "absolute",
    right: "6px",
    bottom: "4px",
    display: "flex",
    alignItems: "center",
    width: "9em",
    height: "18px",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    background: "var(--menu-bg, #fff)",
    fontSize: "11px",
    opacity: "0.4",
    transition: "opacity 0.1s",
  },
  ".cm-md-code-lang:hover, .cm-md-code-lang:focus-within": { opacity: "1" },
  ".cm-md-code-lang-input": {
    flex: "1",
    minWidth: "0",
    height: "100%",
    padding: "0 4px 0 6px",
    border: "none",
    background: "transparent",
    outline: "none",
    color: "inherit",
    font: "inherit",
    fontSize: "11px",
    textAlign: "left",
  },
  ".cm-md-code-lang-arrow": {
    flex: "none",
    padding: "0 5px",
    fontSize: "8px",
    lineHeight: "1",
    opacity: "0.6",
    cursor: "pointer",
  },
  ".cm-md-code-lang-menu": {
    position: "absolute",
    right: "0",
    bottom: "calc(100% + 3px)", // open upward (the box sits at the block's bottom)
    zIndex: "20",
    minWidth: "100%",
    maxHeight: "150px",
    overflowY: "auto",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "6px",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
    padding: "3px",
  },
  ".cm-md-code-lang-item": {
    padding: "1px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    lineHeight: "1.4",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-md-code-lang-item.active, .cm-md-code-lang-item:hover": {
    background: "var(--accent, #3b82f6)",
    color: "#fff",
  },
  ".cm-md-strike": { textDecoration: "line-through", opacity: "0.7" },
  // Pandoc-style subscript (`~x~`), superscript (`^x^`) and ==highlight==.
  ".cm-md-sub": { verticalAlign: "sub", fontSize: "0.8em" },
  ".cm-md-sup": { verticalAlign: "super", fontSize: "0.8em" },
  ".cm-md-highlight": { background: "#fef08a", color: "#000", borderRadius: "2px", padding: "0 0.15em" },
  // Emoji rendered from a `:name:` shortcode. Inline-block so the atomic replace
  // widget sits on the text baseline; keep the default (non-monospace) font.
  ".cm-md-emoji": { display: "inline-block", fontFamily: "initial", fontStyle: "normal" },
  // Rendered inline HTML tags (Typora-style). Kept inline-editable via mark
  // decorations; the tag markers are hidden while the caret is outside.
  ".cm-html-kbd": {
    fontFamily: "var(--editor-font, monospace)",
    fontSize: "0.85em",
    padding: "0.05em 0.4em",
    border: "1px solid var(--border, #ccc)",
    borderBottomWidth: "2px",
    borderRadius: "4px",
    background: "var(--menu-bg, #fafafa)",
    whiteSpace: "nowrap",
  },
  ".cm-html-mark": { background: "#fef08a", color: "#000", borderRadius: "2px" },
  ".cm-html-sup": { verticalAlign: "super", fontSize: "0.75em" },
  ".cm-html-sub": { verticalAlign: "sub", fontSize: "0.75em" },
  ".cm-html-u": { textDecoration: "underline" },
  ".cm-html-del": { textDecoration: "line-through", opacity: "0.7" },
  ".cm-html-b": { fontWeight: "700" },
  ".cm-html-i": { fontStyle: "italic" },
  ".cm-html-small": { fontSize: "0.85em" },
  ".cm-html-code": {
    fontFamily: "var(--editor-font, monospace)",
    background: "rgba(135, 131, 120, 0.18)",
    borderRadius: "3px",
    padding: "0.1em 0.3em",
  },
  ".cm-html-q": { fontStyle: "italic" },
  ".cm-html-abbr": { textDecoration: "underline dotted", cursor: "help" },
  // Fallback inline-HTML widget (void tags like <br>, and tags a class can't
  // express like <ruby>): the sanitized HTML rendered in an editable-on-click span.
  ".cm-html-inline": { cursor: "text" },
  // Idle block-HTML render (caret outside a <details>/<table>/<svg>/media/iframe
  // block). Interactive body; a hover "HTML" badge is the click-to-edit handle.
  // NOTE: padding, never margin — CM measures widget height excluding margins, so
  // a margin here desyncs the height map and offsets clicks/cursor below.
  ".cm-md-html-block": {
    position: "relative",
    padding: "0.3em 0",
    overflowX: "auto",
    // CodeMirror sets white-space: pre-wrap on .cm-content to preserve editor
    // whitespace; the rendered widget inherits it, which would keep the source
    // newlines/indentation. Reset to normal so the HTML collapses whitespace the
    // way a browser renders it (leading indentation disappears). <pre> keeps its
    // own UA white-space rule.
    whiteSpace: "normal",
  },
  ".cm-md-html-block img, .cm-md-html-block video, .cm-md-html-block svg": {
    maxWidth: "100%",
  },
  ".cm-md-html-block iframe": { maxWidth: "100%", border: "0" },
  ".cm-md-html-block table": { borderCollapse: "collapse" },
  ".cm-md-html-block th, .cm-md-html-block td": {
    border: "1px solid var(--border, #ccc)",
    padding: "4px 9px",
  },
  ".cm-md-html-badge": {
    position: "absolute",
    top: "2px",
    right: "4px",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "16px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text, #555)",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    opacity: "0",
    transition: "opacity 0.1s",
    cursor: "pointer",
  },
  ".cm-md-html-block:hover .cm-md-html-badge": { opacity: "0.85" },
  // Editing a block-HTML region: the block's lines are boxed (reusing the code
  // box classes); a CSS `::after` on the first line draws the top-right "HTML"
  // label. A pseudo-element (not a widget) keeps it out of the content flow so it
  // never interferes with mouse selection over the opening-tag line.
  ".cm-md-html-edit-top": { position: "relative" },
  ".cm-md-html-edit-top::after": {
    content: '"HTML"',
    position: "absolute",
    top: "3px",
    right: "6px",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "16px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text, #555)",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    opacity: "0.6",
    pointerEvents: "none",
  },
  // HTML comment / PI collapsed to a muted chip (Typora hides comments).
  ".cm-md-html-comment": {
    display: "inline-block",
    padding: "0 0.5em",
    borderRadius: "5px",
    background: "var(--code-block-bg, rgba(135, 131, 120, 0.12))",
    color: "var(--text-muted, #999)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.8em",
    fontStyle: "italic",
    cursor: "text",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
  ".cm-md-html-comment .cm-widgetBuffer": { display: "none" },
  // Inline math rendered in place of `$…$`.
  ".cm-md-inline-math": { cursor: "text", padding: "0 0.1em" },
  // Live preview tooltip shown below `$…$` while editing it (Typora-style). CM
  // adds the `.cm-tooltip` class to this same element (default z-index 500), so
  // we drop it below the app's modals (100) — !important beats CM's rule.
  ".cm-md-math-tooltip": {
    zIndex: "40 !important",
    padding: "0.25em 0.6em",
    borderRadius: "6px",
    border: "1px solid var(--border, #ccc)",
    background: "var(--menu-bg, #fff)",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.18)",
  },
  // Idle block render (caret outside a `$$` / ```math block). No background at
  // rest so it reads like normal content. `$$` renders are `hoverable` (a subtle
  // box + "Math" hint appear on hover); ```math renders are plain. NOTE: use
  // padding, never margin — CM measures element heights excluding margins, so a
  // margin here desyncs the height map and offsets click/cursor mapping below.
  ".cm-md-math-block": {
    position: "relative",
    padding: "0.55em 0.8em",
    overflowX: "auto",
    cursor: "text",
    borderRadius: "6px",
    transition: "background 0.1s",
  },
  ".cm-md-math-hoverable:hover": {
    background: "var(--code-block-bg, rgba(135, 131, 120, 0.1))",
  },
  // KaTeX display math carries a default `margin: 1em 0`; drop it so rendered
  // blocks and previews stay compact within their own (smaller) padding.
  ".cm-md-math-block .katex-display, .cm-md-math-preview .katex-display": { margin: "0" },
  // Small "Math" hint shown at the top-right of an idle render on hover.
  ".cm-md-math-hint": {
    position: "absolute",
    top: "2px",
    right: "4px",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "16px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text, #555)",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    opacity: "0",
    transition: "opacity 0.1s",
    pointerEvents: "none",
  },
  ".cm-md-math-hoverable:hover .cm-md-math-hint": { opacity: "0.85" },
  // Live preview rendered *below* the editing box (a block widget from the
  // mathField StateField, so it never shares the last line's caret position).
  // Live preview rendered *below* the editing box. Padding only (no margin) so
  // it doesn't desync the height map; flush against the box so clicks can't fall
  // into the gap.
  ".cm-md-math-preview": {
    padding: "0.5em 0 0.6em",
    overflowX: "auto",
  },
  ".cm-md-math-preview .cm-widgetBuffer": { display: "none" },
  // `$$` editing: the fences stay visible (dimmed); the first boxed line hosts
  // the top-right "Math" badge.
  ".cm-md-math-edit-top": { position: "relative" },
  ".cm-md-math-fence": { opacity: "0.45" },
  ".cm-md-math-badge": {
    position: "absolute",
    top: "3px",
    right: "6px",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "16px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text, #555)",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    opacity: "0.6",
    pointerEvents: "none",
  },
  // Placeholder for an empty block (`$$\n$$`) — clickable to open a body line.
  ".cm-md-math-empty": {
    textAlign: "center",
    color: "var(--text-muted, #999)",
    fontStyle: "italic",
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.85em",
  },
  ".cm-md-math-error": { color: "#e00", fontFamily: "var(--editor-font, monospace)" },
  // Idle Mermaid render (caret outside a ```mermaid block): the diagram, centered,
  // click-to-edit. Padding, never margin (CM measures widget height excluding
  // margins, so a margin desyncs the height map and offsets clicks below).
  ".cm-md-mermaid-block": {
    padding: "0.55em 0.8em",
    overflowX: "auto",
    textAlign: "center",
    cursor: "text",
    borderRadius: "6px",
    transition: "background 0.1s",
  },
  ".cm-md-mermaid-block:hover": {
    background: "var(--code-block-bg, rgba(135, 131, 120, 0.1))",
  },
  // Live preview rendered *below* the editing box (a block widget from the
  // mermaidField StateField). Padding only, flush against the box.
  ".cm-md-mermaid-preview": {
    padding: "0.5em 0 0.6em",
    overflowX: "auto",
    textAlign: "center",
  },
  ".cm-md-mermaid-preview .cm-widgetBuffer": { display: "none" },
  ".cm-md-mermaid-block svg, .cm-md-mermaid-preview svg": { maxWidth: "100%", height: "auto" },
  // Async placeholder shown until the first render lands.
  ".cm-md-mermaid-loading": {
    textAlign: "center",
    color: "var(--text-muted, #999)",
    fontStyle: "italic",
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.85em",
    padding: "0.8em",
  },
  ".cm-md-mermaid-error": {
    color: "#e00",
    fontFamily: "var(--editor-font, monospace)",
    fontSize: "0.85em",
    whiteSpace: "pre-wrap",
    padding: "0.5em 0.8em",
  },
  ".cm-md-link": { color: "#3b82f6", textDecoration: "underline", cursor: "pointer" },
  // A reference link with no matching definition: dashed underline + a small
  // amber "?" marker at its right end.
  ".cm-md-link-missing": { textDecorationStyle: "dashed" },
  ".cm-md-link-missing::after": {
    content: '"?"',
    fontSize: "0.7em",
    verticalAlign: "super",
    fontWeight: "700",
    color: "#f59e0b",
    marginLeft: "1px",
  },
  // Link reference definitions (`[id]: url "title"`): dim the label/colon/title,
  // and show italic placeholders where the URL/title are still empty.
  ".cm-md-linkref-label": { opacity: "0.45" },
  ".cm-md-linkref-title": { opacity: "0.45" },
  ".cm-md-linkref-ph": { opacity: "0.4", fontStyle: "italic" },
  // Browser-style hovered-link address, bottom-left of the editor.
  ".cm-md-link-status": {
    position: "absolute",
    bottom: "0",
    left: "0",
    zIndex: "10",
    maxWidth: "70%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    padding: "2px 8px",
    fontSize: "11px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text, #333)",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderLeft: "none",
    borderBottom: "none",
    borderTopRightRadius: "4px",
    boxShadow: "0 -1px 4px rgba(0, 0, 0, 0.08)",
    pointerEvents: "none",
  },
  ".cm-md-image": { maxWidth: "100%", borderRadius: "4px" },
  // Alone on a line: block, and collapse the line to the image height (the line
  // otherwise keeps its text strut + CM's cursor-buffer images).
  ".cm-md-image-block": { display: "block", margin: "0.15em auto" },
  ".cm-md-image-line": { lineHeight: "0" },
  ".cm-md-image-line .cm-widgetBuffer": { display: "none" },
  // Surrounded by text: flow inline, vertically centred with the text.
  ".cm-md-image-inline": { display: "inline-block", verticalAlign: "middle" },
  // Live preview shown below the source while editing (centered to match the
  // rendered block image, so clicking to edit doesn't shift it left).
  ".cm-md-image-preview": { display: "block", margin: "0.3em auto" },
  ".cm-md-hr": {
    display: "inline-block",
    width: "100%",
    borderTop: "2px solid var(--border, #ccc)",
    verticalAlign: "middle",
  },
  ".cm-md-bullet": { color: "#888" },
  ".cm-md-task": { marginRight: "0.4em", verticalAlign: "middle", cursor: "pointer" },
  ".cm-md-tag": {
    color: "var(--accent, #3b82f6)",
    background: "rgba(59, 130, 246, 0.12)",
    borderRadius: "5px",
    padding: "0.05em 0.35em",
    cursor: "pointer",
  },
  ".cm-md-table-wrap": { position: "relative", padding: "24px 0 0.4em" },
  ".cm-md-table-scroll": { overflowX: "auto" },
  ".cm-md-table": {
    borderCollapse: "collapse",
    fontFamily: "var(--editor-font, monospace)",
    fontSize: "0.9em",
  },
  // Table width mode (see TableWidget). Full stretches the table to the edit
  // area and lets `table-layout: auto` distribute the columns; compact sizes to
  // content. `&` is the editor root, which carries the mode class.
  "&.cm-tables-full .cm-md-table": { width: "100%" },
  "&.cm-tables-compact .cm-md-table": { width: "auto" },
  ".cm-md-table th, .cm-md-table td": {
    border: "1px solid var(--border, #ccc)",
    padding: "5px 10px",
    minWidth: "3em",
    verticalAlign: "top",
  },
  ".cm-md-table th": { background: "var(--button-hover-bg, #eee)", fontWeight: "600" },
  ".cm-md-table th:focus, .cm-md-table td:focus": {
    outline: "2px solid var(--accent, #3b82f6)",
    outlineOffset: "-2px",
  },
  ".cm-md-table-toolbar": {
    position: "absolute",
    top: "2px",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 0.1s",
  },
  ".cm-md-table-wrap:hover .cm-md-table-toolbar, .cm-md-table-wrap:focus-within .cm-md-table-toolbar":
    { opacity: "1", pointerEvents: "auto" },
  ".cm-md-tb-group": { display: "flex", alignItems: "center", gap: "2px" },
  ".cm-md-tb-sep": {
    width: "1px",
    alignSelf: "stretch",
    margin: "2px 4px",
    background: "var(--border, #ccc)",
  },
  ".cm-md-tb-btn": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    padding: "0",
    border: "1px solid transparent",
    borderRadius: "4px",
    background: "var(--menu-bg, #fff)",
    color: "inherit",
    cursor: "pointer",
  },
  ".cm-md-tb-btn:hover": {
    background: "var(--button-hover-bg, #eee)",
    borderColor: "var(--border, #ccc)",
  },
  // Highlight the toolbar button for the active width mode (driven by the
  // editor-root mode class, so every table's toolbar reflects the shared state).
  "&.cm-tables-full .cm-md-tb-btn-full, &.cm-tables-compact .cm-md-tb-btn-compact": {
    background: "var(--button-hover-bg, #eee)",
    borderColor: "var(--border, #ccc)",
    color: "var(--accent, #3b82f6)",
  },
  ".cm-md-tb-btn svg": { width: "14px", height: "14px", fill: "currentColor" },
  ".cm-md-table-menu": {
    position: "absolute",
    top: "20px",
    right: "0",
    zIndex: "20",
    background: "var(--menu-bg, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "6px",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
    padding: "4px",
    minWidth: "160px",
  },
  ".cm-md-menu-item": {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "none",
    color: "inherit",
    font: "inherit",
    fontSize: "13px",
    padding: "5px 10px",
    borderRadius: "4px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  ".cm-md-menu-item:hover": { background: "var(--accent, #3b82f6)", color: "#fff" },
  ".cm-md-menu-sep": { height: "1px", background: "var(--border, #ccc)", margin: "4px 6px" },
});

// Clicking a tag pill notifies the host (e.g. to filter the sidebar); Ctrl/Cmd
// clicking a link opens it. Neither steals a plain click — the caret still lands
// where you clicked.
const interactionHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null;
    // Ctrl/Cmd + click on a link opens it externally; a plain click falls
    // through to normal caret placement (which reveals the source for editing).
    const link = target?.closest?.(".cm-md-link");
    if (link && (event.ctrlKey || event.metaKey)) {
      const href = link.getAttribute("data-href");
      if (href) {
        event.preventDefault();
        if (href.startsWith("#")) jumpToAnchor(view, href.slice(1));
        else openExternal(href);
        return true;
      }
      const missing = link.getAttribute("data-missing");
      if (missing != null) {
        event.preventDefault();
        createOrGotoDef(view, missing);
        return true;
      }
    }
    const pill = target?.closest?.(".cm-md-tag");
    const tag = pill?.getAttribute("data-tag");
    if (tag) {
      view.state.facet(onTagClick)?.(tag);
    }
    return false;
  },
  // Links inside rendered HTML are real <a href> elements, so a plain click would
  // navigate the app's own webview (and a mousedown preventDefault can't stop
  // that — navigation fires on `click`). Cancel the native navigation and align
  // with Markdown links: Ctrl/Cmd + click opens the target (externally, or an
  // in-doc jump for `#anchor`); a plain click enters edit mode, revealing the
  // rendered HTML's source. The source-reveal happens here (not on mousedown) so
  // the anchor stays live until the click, keeping preventDefault reliable.
  click(event, view) {
    const a = (event.target as HTMLElement | null)?.closest?.(
      ".cm-md-html-block a[href], .cm-html-inline a[href]",
    );
    if (!a) return false;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const href = a.getAttribute("href");
      if (href) {
        if (href.startsWith("#")) jumpToAnchor(view, href.slice(1));
        else openExternal(href);
      }
    } else {
      // Drop the caret at the start of the rendered HTML so its source reveals
      // for editing — the same gesture as clicking a Markdown link.
      const host = a.closest(".cm-html-inline, .cm-md-html-block");
      if (host) {
        view.dispatch({ selection: { anchor: view.posAtDOM(host) }, scrollIntoView: true });
        view.focus();
      }
    }
    return true;
  },
  // When the caret lands in normal editor text (not a table cell), forget the
  // last-active table so the Paragraph → Table menu greys out again.
  focusin(event) {
    if ((event.target as HTMLElement)?.classList?.contains("cm-content")) clearActiveTable();
    return false;
  },
});

// Browser-style link-address indicator: hovering a link shows its URL in a small
// label pinned to the bottom-left of the editor.
const linkStatusPlugin = ViewPlugin.fromClass(
  class {
    el: HTMLDivElement;
    constructor(view: EditorView) {
      this.el = document.createElement("div");
      this.el.className = "cm-md-link-status";
      this.el.style.display = "none";
      view.dom.appendChild(this.el);
    }
    destroy() {
      this.el.remove();
    }
  },
  {
    eventHandlers: {
      mouseover(event) {
        const link = (event.target as HTMLElement | null)?.closest?.(".cm-md-link");
        const href = link?.getAttribute("data-href");
        if (href) {
          this.el.textContent = href;
          this.el.style.display = "block";
        }
      },
      mouseout(event) {
        const to = event.relatedTarget as HTMLElement | null;
        if (!to?.closest?.(".cm-md-link")) this.el.style.display = "none";
      },
    },
  },
);

/**
 * Re-render Mermaid diagrams when the app theme flips (their colors are baked
 * into the SVG at render time). Watches `data-theme` on <html> and the OS scheme;
 * on a change it clears the render cache and nudges the mermaidField to rebuild.
 */
const mermaidThemePlugin = ViewPlugin.fromClass(
  class {
    observer: MutationObserver;
    media: MediaQueryList | null = null;
    onMedia: () => void;
    constructor(view: EditorView) {
      const refresh = () => {
        clearMermaidCache();
        view.dispatch({ effects: mermaidReadyEffect.of(null) });
      };
      this.observer = new MutationObserver(refresh);
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      this.onMedia = refresh;
      this.media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
      this.media?.addEventListener("change", this.onMedia);
    }
    destroy() {
      this.observer.disconnect();
      this.media?.removeEventListener("change", this.onMedia);
    }
  },
);

/** The full live-preview extension bundle. */
export function livePreview(): Extension {
  return [
    linkRefsField,
    tableField,
    mathField,
    mermaidField,
    htmlBlockField,
    inlineMathTooltipField,
    livePreviewPlugin,
    tableWidthField,
    livePreviewTheme,
    interactionHandlers,
    linkStatusPlugin,
    mermaidThemePlugin,
  ];
}
