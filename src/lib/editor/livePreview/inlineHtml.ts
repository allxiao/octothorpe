import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isElementActive } from "./reveal";

/**
 * Inline HTML rendering (Typora-style). `@lezer/markdown` emits one `HTMLTag`
 * node per tag, so `<kbd>Ctrl</kbd>` is three siblings: `<kbd>`, the text, and
 * `</kbd>`. We pair opening/closing tags with a stack and, for tags a CSS class
 * can express, hide the tags and mark the inner text — which keeps the content
 * inline-editable and lets nested Markdown (e.g. `<mark>**bold**</mark>`) keep
 * rendering through the normal pass. Tags a class can't express, plus void tags
 * (`<br>`, `<img>`), are handled by the widget fallback (see `inlineHtmlWidgets`).
 *
 * As with emphasis/inline-math, editing an element reveals its markers: for a
 * class-expressible tag only the `<tag>`/`</tag>` markers reveal (the content
 * stays styled, Typora-style); a widget-rendered tag reveals its whole raw
 * source (a replace widget can't show source and render at once).
 */

/** Tags renderable purely with a CSS class (kept inline-editable). */
const MARK_CLASS: Record<string, string> = {
  kbd: "cm-html-kbd",
  mark: "cm-html-mark",
  sup: "cm-html-sup",
  sub: "cm-html-sub",
  u: "cm-html-u",
  ins: "cm-html-u",
  s: "cm-html-del",
  del: "cm-html-del",
  strike: "cm-html-del",
  b: "cm-html-b",
  strong: "cm-html-b",
  i: "cm-html-i",
  em: "cm-html-i",
  cite: "cm-html-i",
  var: "cm-html-i",
  dfn: "cm-html-i",
  small: "cm-html-small",
  code: "cm-html-code",
  samp: "cm-html-code",
  q: "cm-html-q",
  abbr: "cm-html-abbr",
  span: "cm-html-span",
};

/** Elements that never have a closing tag; they stand alone (handled in M4). */
export const VOID_TAGS = new Set([
  "br",
  "hr",
  "img",
  "wbr",
  "input",
  "area",
  "col",
  "embed",
  "source",
  "track",
  "param",
  "base",
  "meta",
  "link",
]);

/** CSS properties allowed on an inline `<span style="…">`; the rest are dropped
 *  so a `style` attribute can't escape into layout/positioning tricks. */
const STYLE_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "font-weight",
  "font-style",
  "font-size",
  "font-family",
  "text-decoration",
  "text-transform",
  "letter-spacing",
  "vertical-align",
  "opacity",
]);

/** Keep only allowlisted, value-safe declarations from a raw `style` string. */
function safeStyle(raw: string): string | undefined {
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!prop || !val || !STYLE_PROPS.has(prop)) continue;
    if (/url\(|expression|javascript:|<|@import/i.test(val)) continue;
    out.push(`${prop}:${val}`);
  }
  return out.length ? out.join(";") : undefined;
}

/** Read an attribute value from a raw opening tag (`<span style="…" title='…'>`). */
function attr(rawTag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(rawTag);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[4];
}

interface ParsedTag {
  name: string;
  kind: "open" | "close" | "void";
  raw: string;
}

/** Classify a single `HTMLTag` slice. Returns null if it isn't a simple tag. */
function parseTag(raw: string): ParsedTag | null {
  let m = /^<\/([a-zA-Z][\w:-]*)\s*>$/.exec(raw);
  if (m) return { name: m[1].toLowerCase(), kind: "close", raw };
  m = /^<([a-zA-Z][\w:-]*)(?:\s[^>]*?)?\/>$/.exec(raw);
  if (m) return { name: m[1].toLowerCase(), kind: "void", raw };
  m = /^<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>$/.exec(raw);
  if (m) {
    const name = m[1].toLowerCase();
    return { name, kind: VOID_TAGS.has(name) ? "void" : "open", raw };
  }
  return null;
}

export interface HtmlTagInfo extends ParsedTag {
  from: number;
  to: number;
}

/** A decoration to apply for a rendered inline-HTML pair. */
export type InlineHtmlOp =
  | { kind: "hide"; from: number; to: number }
  | { kind: "mark"; from: number; to: number; class: string; attributes?: Record<string, string> }
  | { kind: "widget"; from: number; to: number; raw: string }
  | { kind: "img"; from: number; to: number; src: string; alt: string }
  | { kind: "break"; pos: number };

export interface InlineHtmlResult {
  ops: InlineHtmlOp[];
  /** Every `HTMLTag` node range in the scanned window (for the tag-pill scan to
   *  skip — a `<span style="#fff">` must not spawn a `#fff` pill). */
  tagRanges: { from: number; to: number }[];
}

/**
 * Collect inline-HTML decorations over `[from, to)`. `skip(pos)` excludes tags
 * inside code/tables/math/links where a `<` is literal or already handled.
 */
export function collectInlineHtml(
  state: EditorState,
  from: number,
  to: number,
  skip: (pos: number) => boolean,
): InlineHtmlResult {
  const ops: InlineHtmlOp[] = [];
  const tagRanges: { from: number; to: number }[] = [];
  const slice = (f: number, t: number) => state.doc.sliceString(f, t);

  // Gather HTMLTag nodes in document order.
  const tags: HtmlTagInfo[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== "HTMLTag") return undefined;
      if (skip(node.from)) return false;
      const parsed = parseTag(state.doc.sliceString(node.from, node.to));
      tagRanges.push({ from: node.from, to: node.to });
      if (parsed) tags.push({ ...parsed, from: node.from, to: node.to });
      return false; // don't descend into the nested HTML tree
    },
  });

  // Render a self-contained tag (void element) as a widget: `<br>` becomes a
  // real break, `<img>` reuses the Markdown image widget, others render their
  // sanitized selves. Editing (caret on the tag) leaves the raw source.
  const emitVoid = (tag: HtmlTagInfo) => {
    if (isElementActive(state, tag.from, tag.to)) {
      // Revealed for editing. For `<br>`, still emit a line break *after* the raw
      // source so the two lines don't collapse into one while it's shown (avoids
      // the text flashing between one and two lines as the caret passes over it).
      if (tag.name === "br") ops.push({ kind: "break", pos: tag.to });
      return;
    }
    if (tag.name === "img") {
      const src = attr(tag.raw, "src");
      if (src) ops.push({ kind: "img", from: tag.from, to: tag.to, src, alt: attr(tag.raw, "alt") ?? "" });
      return; // no src → leave raw
    }
    ops.push({ kind: "widget", from: tag.from, to: tag.to, raw: tag.raw });
  };

  // Pair opens with closes via a stack; unmatched tags stay as raw source.
  const stack: HtmlTagInfo[] = [];
  for (const tag of tags) {
    if (tag.kind === "void") {
      emitVoid(tag);
      continue;
    }
    if (tag.kind === "open") {
      stack.push(tag);
      continue;
    }
    // close: find the nearest matching open on the stack.
    let idx = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === tag.name) {
        idx = k;
        break;
      }
    }
    if (idx < 0) continue; // stray close → leave raw
    const open = stack[idx];
    stack.length = idx; // anything above the match was a stray open → left raw

    const active = isElementActive(state, open.from, tag.to);
    const cls = MARK_CLASS[open.name];
    if (!cls) {
      // Not class-expressible (e.g. <ruby>, <bdo>) → render the whole span as an
      // atomic widget, click-to-edit. A replace widget can't show source and
      // render at once, so editing (caret inside) reveals the raw source.
      if (active) continue;
      // Drop any ops already emitted inside this span (e.g. a nested <rt>
      // widget): the outer widget re-renders them, and overlapping replace
      // decorations are illegal.
      for (let i = ops.length - 1; i >= 0; i--) {
        const o = ops[i];
        const f = o.kind === "break" ? o.pos : o.from;
        const t = o.kind === "break" ? o.pos : o.to;
        if (f >= open.from && t <= tag.to) ops.splice(i, 1);
      }
      ops.push({ kind: "widget", from: open.from, to: tag.to, raw: slice(open.from, tag.to) });
      continue;
    }

    // Class-expressible: the inner content stays styled even while editing
    // (Typora-style) — only the tag markers reveal. Hide them when idle.
    if (!active) {
      ops.push({ kind: "hide", from: open.from, to: open.to });
      ops.push({ kind: "hide", from: tag.from, to: tag.to });
    }
    const innerFrom = open.to;
    const innerTo = tag.from;
    if (innerFrom < innerTo) {
      const attributes: Record<string, string> = {};
      if (open.name === "span") {
        const style = attr(open.raw, "style");
        const safe = style ? safeStyle(style) : undefined;
        if (safe) attributes.style = safe;
      }
      const title = attr(open.raw, "title");
      if (title) attributes.title = title;
      ops.push({
        kind: "mark",
        from: innerFrom,
        to: innerTo,
        class: cls,
        attributes: Object.keys(attributes).length ? attributes : undefined,
      });
    }
  }

  return { ops, tagRanges };
}
