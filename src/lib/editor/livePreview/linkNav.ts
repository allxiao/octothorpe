import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { openUrl } from "../../ipc/commands";

/** Open a URL with the OS default handler (falls back to a tab in the browser). */
export function openExternal(url: string) {
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
export function jumpToAnchor(view: EditorView, rawAnchor: string) {
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
export function createOrGotoDef(view: EditorView, label: string) {
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
 * Act on a *rendered* Markdown link element (`.cm-md-link`, carrying `data-href`
 * or `data-missing`): open the URL / jump to a `#anchor`, or scaffold a missing
 * reference definition. Returns whether it navigated. Shared by the main editor's
 * link handler and the table-cell handler so a link behaves identically in both.
 */
export function followRenderedLink(view: EditorView, link: Element): boolean {
  const href = link.getAttribute("data-href");
  if (href) {
    if (href.startsWith("#")) jumpToAnchor(view, href.slice(1));
    else openExternal(href);
    return true;
  }
  const missing = link.getAttribute("data-missing");
  if (missing != null) {
    createOrGotoDef(view, missing);
    return true;
  }
  return false;
}
