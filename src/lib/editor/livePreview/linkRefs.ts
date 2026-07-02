import { StateField, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** A resolved link reference definition (`[id]: url "title"`). */
export interface LinkRef {
  url: string;
  title?: string;
}

// Block containers a definition can nest inside; everything else is skipped so
// the scan doesn't descend into paragraph inline content.
const CONTAINERS = new Set(["Document", "Blockquote", "BulletList", "OrderedList", "ListItem"]);

/** CommonMark link-label matching: case-insensitive, whitespace-collapsed. */
function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip the surrounding delimiters from a `[label]`, `"title"`, `'title'`, or `(title)`. */
const inner = (s: string) => s.slice(1, -1);

function build(state: EditorState): Map<string, LinkRef> {
  const map = new Map<string, LinkRef>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "LinkReference") {
        const n = node.node;
        const label = n.getChild("LinkLabel");
        const url = n.getChild("URL");
        if (label && url) {
          const key = normalize(inner(state.doc.sliceString(label.from, label.to)));
          if (key && !map.has(key)) {
            const title = n.getChild("LinkTitle");
            map.set(key, {
              url: state.doc.sliceString(url.from, url.to),
              title: title ? inner(state.doc.sliceString(title.from, title.to)) : undefined,
            });
          }
        }
        return false;
      }
      return CONTAINERS.has(node.name) ? undefined : false;
    },
  });
  return map;
}

/**
 * Document-wide index of link reference definitions, keyed by normalized label.
 * Rebuilt only on document changes (like the table field).
 */
export const linkRefsField = StateField.define<Map<string, LinkRef>>({
  create: build,
  update(value, tr) {
    return tr.docChanged ? build(tr.state) : value;
  },
});

/** Resolve a link label (from a reference-style link) to its definition, if any. */
export function resolveLinkRef(state: EditorState, label: string): LinkRef | undefined {
  return state.field(linkRefsField, false)?.get(normalize(label));
}
