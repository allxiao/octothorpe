import {
  ViewPlugin,
  EditorView,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { buildDecorations } from "./build";
import { onTagClick } from "./config";
import { tableField } from "./tableField";
import { clearActiveTable } from "./TableWidget";

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
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
  ".cm-md-strike": { textDecoration: "line-through", opacity: "0.7" },
  ".cm-md-link": { color: "#3b82f6", textDecoration: "underline", cursor: "pointer" },
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

// Clicking a tag pill notifies the host (e.g. to filter the sidebar), without
// stealing the click — the caret still lands where you clicked.
const tagClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null;
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

/** The full live-preview extension bundle. */
export function livePreview(): Extension {
  return [tableField, livePreviewPlugin, livePreviewTheme, tagClickHandler];
}
