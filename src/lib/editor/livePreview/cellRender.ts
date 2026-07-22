import { parser } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
import { MD_EXTENSIONS } from "../markdownLang";
import { renderInlineMath } from "../math/render";
import { emojiFor } from "../emoji";
import { resolveHtmlSrc } from "../html/paths";
import { sanitizeHtml } from "../html/render";
import { normalizeLabel, type LinkRef } from "./linkRefs";
import { normalizeFootnote, type Footnote } from "./footnotes";

/**
 * Render a table cell's Markdown *source* to inline HTML — the same inline
 * constructs the editor renders (bold, italic, code, strikethrough, links,
 * images, `$…$` math, `:emoji:`, sub/super/highlight), reusing the editor's CSS
 * classes and `renderInlineMath`/`emojiFor` so cells look identical.
 *
 * GFM table cells are inline-only, so we must NOT treat leading `#`, `-`, `>` … as
 * block markers. We get that for free with a "flatten-inline" walk: only the
 * recognized *inline* nodes are given special HTML; every other node (block
 * wrappers and their marker tokens) is transparent, so its text — including a
 * leading `# ` or `- ` — is emitted as escaped literal text.
 *
 * XSS-safe by construction: HTML comes from a fixed node→tag map, all text and
 * URLs are escaped/scheme-checked, and the only injected markup is KaTeX/MathJax
 * output (`renderInlineMath`) and `sanitizeHtml`-cleaned raw inline tags.
 */
const cellParser = parser.configure(MD_EXTENSIONS);

const cache = new Map<string, string>();
const MAX_CACHE = 500;

export interface CellRenderOpts {
  baseDir: string;
  displaystyle: boolean;
  /** The document's link reference definitions, so `[text][id]` in a cell resolves
   *  against the whole document (the cell has none of its own). */
  linkRefs?: Map<string, LinkRef>;
  /** The document's footnote definitions, so `[^label]` in a cell resolves against
   *  the whole document. Undefined when footnote rendering is off — then a
   *  reference stays literal source text. */
  footnotes?: Map<string, Footnote>;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/** Drop dangerous URL schemes; allow http(s)/mailto/relative/anchors. */
function safeHref(url: string): string {
  return /^\s*(javascript|vbscript|data|file):/i.test(url) ? "#" : url.trim();
}

/**
 * Render the inline children of `parent` that fall within `[from, to)`, emitting
 * uncovered text as escaped literal. Passing the range *between* a node's
 * delimiter marks naturally excludes the marks themselves.
 */
function renderRange(
  parent: SyntaxNode,
  src: string,
  opts: CellRenderOpts,
  from: number,
  to: number,
): string {
  let out = "";
  let pos = from;
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.to <= from || c.from >= to) continue; // fully outside the range
    if (c.from > pos) out += escapeHtml(src.slice(pos, c.from));
    out += renderNode(c, src, opts);
    pos = c.to;
  }
  if (to > pos) out += escapeHtml(src.slice(pos, to));
  return out;
}

/** Inner content between the first and last delimiter mark of `markName`. */
function innerMarked(
  node: SyntaxNode,
  src: string,
  opts: CellRenderOpts,
  markName: string,
): string {
  const marks = node.getChildren(markName);
  if (marks.length < 2) return escapeHtml(src.slice(node.from, node.to)); // malformed
  return renderRange(node, src, opts, marks[0].to, marks[marks.length - 1].from);
}

/** Raw text between the first and last delimiter mark (no nested rendering). */
function rawMarked(node: SyntaxNode, src: string, markName: string): string {
  const marks = node.getChildren(markName);
  return marks.length >= 2
    ? src.slice(marks[0].to, marks[marks.length - 1].from)
    : src.slice(node.from, node.to);
}

function renderNode(node: SyntaxNode, src: string, opts: CellRenderOpts): string {
  switch (node.name) {
    case "StrongEmphasis":
      return `<strong>${innerMarked(node, src, opts, "EmphasisMark")}</strong>`;
    case "Emphasis":
      return `<em>${innerMarked(node, src, opts, "EmphasisMark")}</em>`;
    case "Strikethrough":
      return `<span class="cm-md-strike">${innerMarked(node, src, opts, "StrikethroughMark")}</span>`;
    case "Subscript":
      return `<span class="cm-md-sub">${innerMarked(node, src, opts, "SubscriptMark")}</span>`;
    case "Superscript":
      return `<span class="cm-md-sup">${innerMarked(node, src, opts, "SuperscriptMark")}</span>`;
    case "Highlight":
      return `<span class="cm-md-highlight">${innerMarked(node, src, opts, "HighlightMark")}</span>`;
    case "InlineCode":
      return `<code class="cm-md-code">${escapeHtml(rawMarked(node, src, "CodeMark"))}</code>`;
    case "InlineMath":
      return `<span class="cm-md-inline-math">${renderInlineMath(rawMarked(node, src, "InlineMathMark"), opts.displaystyle)}</span>`;
    case "Emoji": {
      const name = src.slice(node.from + 1, node.to - 1);
      const glyph = emojiFor(name);
      return glyph
        ? `<span class="cm-md-emoji">${escapeHtml(glyph)}</span>`
        : escapeHtml(src.slice(node.from, node.to));
    }
    case "FootnoteReference": {
      const label = src.slice(node.from + 2, node.to - 1);
      // Off (no map) → literal; the `[^label]:` definition marker at the cell start
      // is literal too, not a reference. Otherwise render the same superscript pill
      // as the body; hovering renders the definition (see footnoteTooltip.ts).
      if (!opts.footnotes || (src[node.to] === ":" && src.slice(0, node.from).trim() === "")) {
        return escapeHtml(src.slice(node.from, node.to));
      }
      const def = opts.footnotes.get(normalizeFootnote(label));
      const cls = def ? "cm-md-footnote-ref" : "cm-md-footnote-ref cm-md-footnote-ref-missing";
      return `<sup class="${cls}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</sup>`;
    }
    case "Link": {
      const marks = node.getChildren("LinkMark");
      const urlNode = node.getChild("URL");
      if (marks.length >= 2 && urlNode) {
        const text = renderRange(node, src, opts, marks[0].to, marks[1].from);
        const dest = src.slice(urlNode.from, urlNode.to).replace(/^<([\s\S]*)>$/, "$1").trim();
        const href = escapeHtml(safeHref(dest));
        const tm = /"([^"]*)"/.exec(src.slice(urlNode.to, node.to)); // optional title
        const title = tm ? ` title="${escapeHtml(tm[1])}"` : "";
        return `<a class="cm-md-link" href="${href}" data-href="${href}"${title}>${text}</a>`;
      }
      // Reference link `[text][id]` / `[text][]` — resolved against the document's
      // link definitions (passed in via opts, since the cell has none of its own).
      const ref = /^\[([^\]]*)\]\[([^\]]*)\]$/.exec(src.slice(node.from, node.to));
      if (ref) {
        const label = ref[2].trim() ? ref[2] : ref[1];
        const text =
          marks.length >= 2
            ? renderRange(node, src, opts, marks[0].to, marks[1].from)
            : escapeHtml(ref[1]);
        const resolved = opts.linkRefs?.get(normalizeLabel(label));
        if (resolved) {
          const href = escapeHtml(safeHref(resolved.url));
          const title = resolved.title ? ` title="${escapeHtml(resolved.title)}"` : "";
          return `<a class="cm-md-link" href="${href}" data-href="${href}"${title}>${text}</a>`;
        }
        return `<a class="cm-md-link cm-md-link-missing" data-missing="${escapeHtml(label)}">${text}</a>`;
      }
      return renderRange(node, src, opts, node.from, node.to); // malformed → literal
    }
    case "Autolink": {
      const url = src.slice(node.from + 1, node.to - 1); // strip < >
      const href = escapeHtml(safeHref(url));
      return `<a class="cm-md-link" href="${href}" data-href="${href}">${escapeHtml(url)}</a>`;
    }
    case "Image": {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(src.slice(node.from, node.to));
      if (!m) return escapeHtml(src.slice(node.from, node.to));
      const resolved = resolveHtmlSrc(m[2], opts.baseDir) ?? m[2];
      return `<img class="cm-md-image cm-md-image-inline" src="${escapeHtml(resolved)}" alt="${escapeHtml(m[1])}">`;
    }
    case "Escape":
      return escapeHtml(src.slice(node.from + 1, node.to)); // the escaped char, literal
    case "HardBreak":
      return "<br>";
    case "HTMLTag":
      return sanitizeHtml(src.slice(node.from, node.to), opts.baseDir);
    default:
      // Transparent: block wrappers/marks and plain text — recurse, emitting any
      // uncovered text (incl. block markers like `# `) as escaped literal.
      return renderRange(node, src, opts, node.from, node.to);
  }
}

/** Render a cell's Markdown source string to inline HTML. */
export function renderCellMarkdown(src: string, opts: CellRenderOpts): string {
  if (src === "") return "";
  const key = (opts.displaystyle ? "d\0" : "i\0") + opts.baseDir + "\0" + src;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const tree = cellParser.parse(src);
  const html = renderNode(tree.topNode, src, opts);

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
  return html;
}
