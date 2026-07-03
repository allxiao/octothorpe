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
import { onTagClick, revealSimpleSource } from "./config";
import { tableField } from "./tableField";
import { linkRefsField } from "./linkRefs";
import { clearActiveTable } from "./TableWidget";
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
      update.startState.facet(revealSimpleSource) !== update.state.facet(revealSimpleSource)
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
  ".cm-md-table-wrap": { position: "relative", margin: "0.9em 0 0.4em" },
  ".cm-md-table-scroll": { overflowX: "auto" },
  ".cm-md-table": {
    borderCollapse: "collapse",
    fontFamily: "var(--editor-font, monospace)",
    fontSize: "0.9em",
  },
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
    top: "-22px",
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
  ".cm-md-tb-group": { display: "flex", gap: "2px" },
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

/** The full live-preview extension bundle. */
export function livePreview(): Extension {
  return [
    linkRefsField,
    tableField,
    livePreviewPlugin,
    livePreviewTheme,
    interactionHandlers,
    linkStatusPlugin,
  ];
}
