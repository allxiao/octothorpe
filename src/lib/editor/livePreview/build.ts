import { Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type Range } from "@codemirror/state";
import { isElementActive, isLineActive } from "./reveal";
import { imageBaseDir, revealSimpleSource, inlineMathRender, inlineMathDisplayStyle, renderHtml, renderSubscript, renderSuperscript, renderHighlight, renderEmoji, renderFootnotes, inlineOnly } from "./config";
import { scanTagsInLine } from "./tagScan";
import { resolveHtmlSrc } from "../html/paths";
import { sanitizeHtml } from "../html/render";
import { collectInlineHtml } from "./inlineHtml";
import { InlineHtmlWidget, BreakWidget } from "./htmlWidgets";
import { EmojiWidget } from "./emojiWidget";
import { emojiFor } from "../emoji";
import { mathBlockRanges } from "./mathField";
import { htmlBlockRanges, htmlTagBlockRegions } from "./htmlBlockField";
import {
  ImageWidget,
  HrWidget,
  BulletWidget,
  CheckboxWidget,
  CodeLangWidget,
  PlaceholderWidget,
} from "./widgets";
import { InlineMathWidget, BlockMathWidget } from "./mathWidgets";
import { tableRanges } from "./tableField";
import { resolveLinkRef } from "./linkRefs";
import { FootnoteRefWidget } from "./footnoteWidget";
import { FOOTNOTE_DEF_RE, resolveFootnote, isFootnoteDefMarker } from "./footnotes";

/**
 * Resolve a Markdown image URL to something the webview can load. Shared with the
 * embedded-HTML renderer so `![](…)` images and `<img src="…">` behave the same.
 */
const resolveImageSrc = resolveHtmlSrc;

/**
 * Resolve a Markdown image URL to a filesystem path (for reading its bytes, e.g.
 * "Copy Image Content"). Remote/`data:` URLs pass through unchanged (the caller
 * decides what to do); relative paths are joined against the document's folder.
 * Returns null when it can't be resolved.
 */
export function resolveImageFsPath(url: string, baseDir: string): string | null {
  if (/^(https?:|data:)/i.test(url)) return url;
  if (/^file:/i.test(url)) return decodeURI(url.replace(/^file:\/*/i, ""));
  if (!baseDir) return null;
  const sep = baseDir.includes("\\") ? "\\" : "/";
  return baseDir.replace(/[\\/]+$/, "") + sep + url.replace(/\//g, sep);
}

export interface BuiltDecorations {
  /** All decorations: marker hiding, inline styling, line classes, widgets. */
  decorations: DecorationSet;
  /** Subset (replaced spans only) marked atomic so the cursor steps over them. */
  atomic: DecorationSet;
}

/** Block-construct node names skipped in `inlineOnly` mode so their source stays
 *  literal (headings, quotes, lists, rules, fenced code, block math). */
const BLOCK_ONLY_NODES =
  /^(?:(?:ATX|Setext)Heading[1-6]|HeaderMark|Blockquote|QuoteMark|ListMark|TaskMarker|HorizontalRule|FencedCode|BlockMath)$/;


/**
 * Walk the Lezer syntax tree over the visible ranges only (for performance) and
 * produce live-preview decorations. Inline elements (bold, italic, code, links,
 * images, ...) reveal their raw source only when the cursor is within that
 * element (Typora/Bear style); line markers (`#`, `>`) reveal per line.
 */
export function buildDecorations(view: EditorView): BuiltDecorations {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const hide = (from: number, to: number) => {
    if (from >= to) return;
    const d = Decoration.replace({}).range(from, to);
    decos.push(d);
    atomic.push(d);
  };
  const replaceWith = (
    from: number,
    to: number,
    w:
      | ImageWidget
      | HrWidget
      | BulletWidget
      | CheckboxWidget
      | InlineHtmlWidget
      | EmojiWidget
      | FootnoteRefWidget,
  ) => {
    const d = Decoration.replace({ widget: w }).range(from, to);
    decos.push(d);
    atomic.push(d);
  };
  const mark = (from: number, to: number, cls: string) => {
    if (from >= to) return;
    decos.push(Decoration.mark({ class: cls }).range(from, to));
  };
  const lineClass = (pos: number, cls: string) => {
    decos.push(Decoration.line({ class: cls }).range(pos));
  };

  const slice = (from: number, to: number) => state.doc.sliceString(from, to);
  const baseDir = state.facet(imageBaseDir);
  // When false, simple-block markers (#, >, bullets) never reveal their source —
  // they stay rendered even on the focused line (editor.revealSourceOnFocus).
  const revealSource = state.facet(revealSimpleSource);
  // Whether inline `$…$` renders (markdown.inlineMath). Block math always renders.
  const inlineMathOn = state.facet(inlineMathRender);
  // Whether inline math renders in display style (markdown.inlineMathDisplay).
  const inlineMathDisplay = state.facet(inlineMathDisplayStyle);
  // Cell/single-line mode: render only inline Markdown; block markers (#, -, >,
  // ---, task/list, fenced code, block math) stay literal. Set for the nested
  // table-cell editor.
  const inlineMode = state.facet(inlineOnly);

  // Tables are rendered as editable block widgets (via a StateField); skip any
  // inline decoration inside them.
  const tables = tableRanges(state);
  const inTable = (pos: number) => tables.some((t) => pos >= t.from && pos <= t.to);

  // Fenced code blocks decorate their own lines; the plain-text tag scan below
  // must skip them so `#define` / `#000` inside code don't become tag pills.
  const codeRanges: { from: number; to: number }[] = [];
  const inCode = (pos: number) => codeRanges.some((r) => pos >= r.from && pos <= r.to);

  // Link ranges, so the tag scan doesn't turn a `#anchor` inside `[text](#anchor)`
  // into a tag pill (it's an internal section link, not a tag).
  const linkRanges: { from: number; to: number }[] = [];
  const inLink = (pos: number) => linkRanges.some((r) => pos >= r.from && pos < r.to);

  // Inline-HTML tag ranges, so the tag scan doesn't turn e.g. the `#fff` in
  // `<span style="color:#fff">` into a tag pill. Filled by the inline-HTML pass.
  const htmlTagRanges: { from: number; to: number }[] = [];
  const inHtml = (pos: number) => htmlTagRanges.some((r) => pos >= r.from && pos < r.to);

  // Whether embedded HTML renders (markdown.renderHtml). When off, HTML stays as
  // literal source text.
  const htmlOn = state.facet(renderHtml);
  // Pandoc-style sub/superscript and ==highlight== (markdown.*). When off, the
  // markers stay literal (like inline math).
  const subOn = state.facet(renderSubscript);
  const supOn = state.facet(renderSuperscript);
  const hlOn = state.facet(renderHighlight);
  // Whether `:name:` shortcodes render as emoji glyphs (markdown.emoji).
  const emojiOn = state.facet(renderEmoji);
  // Whether footnote references render as pills and definition lines get a dim
  // marker (markdown.footnotes). When off, both stay literal source text.
  const footnotesOn = state.facet(renderFootnotes);
  // Math blocks rendered idle (by mathField) — the inline-HTML pass skips them.
  const mathBlocks = mathBlockRanges(state);
  const inMathBlock = (pos: number) => mathBlocks.some((r) => pos >= r.from && pos < r.to);
  // Block-HTML rendered idle (by htmlBlockField) — the tag scan / inline pass skip.
  const htmlBlocks = htmlBlockRanges(state);
  const inHtmlBlock = (pos: number) => htmlBlocks.some((r) => pos >= r.from && pos < r.to);
  // Multi-line block-HTML regions (open→close tag lines). Used both to skip inline
  // rendering of their inner tags and to box them while editing (below).
  const htmlRegions = htmlOn ? htmlTagBlockRegions(state) : [];
  const inHtmlRegion = (pos: number) => htmlRegions.some((r) => pos >= r.from && pos < r.to);

  // Render a link reference definition line (`[id]: url "title"`): dim the
  // `[id]:` label, show the URL as a clickable link, and dim the title. Empty
  // URL/title slots get a placeholder that disappears once real text is typed
  // (the URL placeholder always shows; the optional-title one only while the
  // line is being edited).
  const LINK_DEF_RE = /^(\s*)\[([^\]]*)\]:([ \t]*)(\S*)([ \t]*)(.*)$/;
  const renderLinkDef = (line: { from: number; to: number; text: string }, m: RegExpExecArray) => {
    const indent = m[1].length;
    const labelEnd = line.from + indent + m[2].length + 3; // past `[label]:`
    mark(line.from + indent, labelEnd, "cm-md-linkref-label");
    const urlStart = labelEnd + m[3].length;
    const urlEnd = urlStart + m[4].length;
    if (m[4]) {
      decos.push(
        Decoration.mark({ class: "cm-md-link", attributes: { "data-href": m[4] } }).range(
          urlStart,
          urlEnd,
        ),
      );
    } else {
      decos.push(
        Decoration.widget({
          widget: new PlaceholderWidget("input link url here", "cm-md-linkref-ph"),
          side: 1,
        }).range(urlStart),
      );
    }
    const titleStart = urlEnd + m[5].length;
    if (m[6]) {
      mark(titleStart, titleStart + m[6].length, "cm-md-linkref-title");
    } else if (isLineActive(state, line.from, line.to)) {
      decos.push(
        Decoration.widget({
          widget: new PlaceholderWidget(' "title (optional)"', "cm-md-linkref-ph"),
          side: 1,
        }).range(titleStart),
      );
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (inTable(node.from)) return false;
        const name = node.name;

        // Inline-only mode (table cells): treat block constructs as literal — skip
        // their decoration but descend so any inline content inside still renders.
        if (inlineMode && BLOCK_ONLY_NODES.test(name)) return undefined;

        // Embedded HTML is handled separately: block HTML (`HTMLBlock`,
        // `CommentBlock`) by the htmlBlockField StateField, inline HTML
        // (`HTMLTag`) by the inline-HTML pass below. Don't descend into the
        // nested HTML sub-tree the mixed parser mounts here. Editing a block is
        // boxed by the region pass after this loop.
        if (name === "HTMLTag" || name === "HTMLBlock" || name === "CommentBlock" || name === "ProcessingInstructionBlock") return false;

        // --- Fenced code: render a *terminated* block as a styled box. The code
        //     text stays real (natively highlighted); the fence lines collapse
        //     away; the language shows in a bottom-right box. While the opening
        //     fence is still being typed (no closing fence yet) it's left as raw
        //     text so keystrokes stay visible. ---
        if (name === "FencedCode") {
          const n = node.node;
          const marks = n.getChildren("CodeMark");
          // Not terminated yet → leave as raw text (user is still typing it).
          if (marks.length < 2) return false;
          const openMark = marks[0];
          const closeMark = marks[marks.length - 1];
          const info = n.getChild("CodeInfo");
          const openLine = state.doc.lineAt(node.from);
          const closeLine = state.doc.lineAt(closeMark.from);

          codeRanges.push({ from: node.from, to: node.to });

          // ```` ```math ```` / ```` ```mermaid ```` are normal code blocks while
          // editing, but when idle they render (via the mathField / mermaidField
          // StateFields, which can emit the block-replace a plugin can't). A live
          // preview shows below them while editing.
          if (
            info &&
            (slice(info.from, info.to).trim() === "math" ||
              slice(info.from, info.to).trim() === "mermaid") &&
            !isElementActive(state, node.from, node.to)
          ) {
            return false; // idle: rendered by mathField / mermaidField (codeRange recorded)
          }

          // Structural indent (list/quote nesting) sits before the fence and is
          // excluded from the code nodes. Inset the box by it so the block lines
          // up with its list item's content instead of the far-left margin.
          const baseIndent = node.from - openLine.from;
          const lineAttrs = baseIndent > 0 ? { style: `margin-left:${baseIndent}ch` } : undefined;

          // Collapse the two fence lines (they only hold the hidden ``` marks).
          lineClass(openLine.from, "cm-md-code-fence");
          lineClass(closeLine.from, "cm-md-code-fence");
          hide(openMark.from, openMark.to);
          hide(closeMark.from, closeMark.to);
          if (info) hide(info.from, info.to);

          // Content lines form the visible box; first/last get the rounded caps.
          const firstContent = openLine.number + 1;
          const lastContent = closeLine.number - 1;
          for (let ln = firstContent; ln <= lastContent; ln++) {
            const line = state.doc.line(ln);
            let cls = "cm-md-code-block";
            if (ln === firstContent) cls += " cm-md-code-top";
            if (ln === lastContent) cls += " cm-md-code-bottom";
            decos.push(Decoration.line({ class: cls, attributes: lineAttrs }).range(line.from));
            // Hide the structural indent whitespace (the margin stands in for it).
            if (baseIndent > 0) {
              const lead = /^[ \t]*/.exec(line.text)![0].length;
              const k = Math.min(baseIndent, lead);
              if (k > 0) hide(line.from, line.from + k);
            }
          }

          // Language picker box, anchored to the collapsed closing fence line so
          // it sits at the box's bottom-right without ever sharing a caret
          // position with a code line.
          const lang = info ? slice(info.from, info.to) : "";
          const infoFrom = info ? info.from : openMark.to;
          const infoTo = info ? info.to : infoFrom;
          decos.push(
            Decoration.widget({
              widget: new CodeLangWidget(lang, infoFrom, infoTo),
              side: 1,
            }).range(closeLine.from),
          );
          // (A ```math block's live preview is rendered below by mathField.)
          // Don't descend: CodeText stays real text (natively highlighted).
          return false;
        }

        // --- Inline math `$…$`: render in place; reveal the raw source while the
        //     caret is inside it (like bold/italic). Off → stays literal text. ---
        if (name === "InlineMath") {
          if (inlineMathOn && !isElementActive(state, node.from, node.to)) {
            const latex = slice(node.from + 1, node.to - 1);
            const d = Decoration.replace({
              widget: new InlineMathWidget(latex, node.from, inlineMathDisplay),
            }).range(node.from, node.to);
            decos.push(d);
            atomic.push(d);
          }
          return false; // never descend into the `$` marks
        }

        // --- Block math `$$ … $$`: idle → the rendered display math; caret
        //     inside → an editable box that keeps the `$$` fences visible, with
        //     a live preview rendered below it by the mathField StateField. ---
        if (name === "BlockMath") {
          const n = node.node;
          const marks = n.getChildren("BlockMathMark");
          // Only one delimiter so far → still being typed; leave it as raw text.
          if (marks.length < 2) return false;
          codeRanges.push({ from: node.from, to: node.to });

          const startLine = state.doc.lineAt(node.from);
          const endLine = state.doc.lineAt(node.to);
          const first = startLine.number + 1;
          const last = endLine.number - 1;

          if (!isElementActive(state, node.from, node.to)) {
            return false; // idle: rendered by mathField (codeRange already recorded)
          }

          // Empty (`$$\n$$` with no body line): leave the raw delimiters visible
          // and editable rather than collapsing to an unreachable void. Entering
          // it via the idle render inserts a blank body line first.
          if (first > last) return false;

          // Editing: unlike a code block, the `$$` fences stay visible (just
          // dimmed). Box the whole block; the top-right "Math" label is drawn by a
          // CSS ::after on cm-md-math-edit-top (a pseudo-element, not a widget, so
          // it stays out of the content flow and never blocks selecting the `$$`).
          const openMark = marks[0];
          const closeMark = marks[marks.length - 1];
          for (let ln = startLine.number; ln <= endLine.number; ln++) {
            const line = state.doc.line(ln);
            let cls = "cm-md-code-block";
            if (ln === startLine.number) cls += " cm-md-code-top cm-md-math-edit-top";
            if (ln === endLine.number) cls += " cm-md-code-bottom";
            decos.push(Decoration.line({ class: cls }).range(line.from));
          }
          mark(openMark.from, openMark.to, "cm-md-math-fence");
          mark(closeMark.from, closeMark.to, "cm-md-math-fence");
          return false;
        }

        // --- Headings: size the line, hide the leading "# " markers ---
        if (/^(ATXHeading|SetextHeading)[1-6]$/.test(name)) {
          const level = Number(name.slice(-1));
          const line = state.doc.lineAt(node.from);
          lineClass(line.from, `cm-md-heading cm-md-h${level}`);
          return;
        }
        if (name === "HeaderMark") {
          // Line-level: the '#' is the only raw part; heading text renders either way.
          if (!(revealSource && isLineActive(state, node.from, node.to))) {
            // Hide the '#' run plus a single trailing space.
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }

        // --- Backslash escape (`\*`, `\_`, …): hide the backslash so only the
        //     literal character shows, unless the caret is on the escape. ---
        if (name === "Escape") {
          if (!isElementActive(state, node.from, node.to)) hide(node.from, node.from + 1);
          return;
        }

        // --- Inline emphasis / code / strikethrough: hide marks when the
        //     cursor is outside the *element* (not merely off the line) ---
        if (name === "EmphasisMark" || name === "StrikethroughMark") {
          const el = node.node.parent ?? node;
          if (!isElementActive(state, el.from, el.to)) hide(node.from, node.to);
          return;
        }
        // Pandoc sub/superscript and ==highlight==: hide the markers (gated by the
        // matching preference) when the caret is outside the element.
        if (name === "SubscriptMark" || name === "SuperscriptMark" || name === "HighlightMark") {
          const el = node.node.parent ?? node;
          const on = el.name === "Subscript" ? subOn : el.name === "Superscript" ? supOn : hlOn;
          if (on && !isElementActive(state, el.from, el.to)) hide(node.from, node.to);
          return;
        }
        if (name === "CodeMark") {
          // Only hide inline-code backticks; leave fenced-code fences visible.
          const parent = node.node.parent;
          if (parent && parent.name === "InlineCode" &&
              !isElementActive(state, parent.from, parent.to)) {
            hide(node.from, node.to);
          }
          return;
        }
        if (name === "InlineCode") {
          mark(node.from, node.to, "cm-md-code");
          return;
        }
        if (name === "Strikethrough") {
          mark(node.from, node.to, "cm-md-strike");
          return;
        }
        if (name === "Subscript") {
          if (subOn) mark(node.from, node.to, "cm-md-sub");
          return;
        }
        if (name === "Superscript") {
          if (supOn) mark(node.from, node.to, "cm-md-sup");
          return;
        }
        if (name === "Highlight") {
          if (hlOn) mark(node.from, node.to, "cm-md-highlight");
          return;
        }
        // --- Emoji shortcode (`:smile:`): replace with the glyph; reveal the
        //     raw `:name:` source while the caret is inside it. ---
        if (name === "Emoji") {
          if (emojiOn && !isElementActive(state, node.from, node.to)) {
            const glyph = emojiFor(slice(node.from + 1, node.to - 1));
            if (glyph) replaceWith(node.from, node.to, new EmojiWidget(glyph, node.from));
          }
          return;
        }

        // --- Footnote reference (`[^label]`): replace with a superscript pill,
        //     revealing the raw source while the caret is inside it. A reference
        //     with no definition is flagged (styled + tooltip hint) so Ctrl+click
        //     can scaffold one. The `[^label]` at the head of a definition line is
        //     a marker, not a reference — leave it to the definition-line pass. ---
        if (name === "FootnoteReference") {
          if (footnotesOn && !inlineMode && !isFootnoteDefMarker(state, node.from, node.to) &&
              !isElementActive(state, node.from, node.to)) {
            const label = slice(node.from + 2, node.to - 1);
            const hasDef = !!resolveFootnote(state, label);
            replaceWith(node.from, node.to, new FootnoteRefWidget(label, node.from, hasDef));
          }
          return false; // never descend into the `[^ … ]` marks
        }

        // --- Links: inline `[text](url)`, angle `[text](<url with space>)`, a
        //     lenient `[text](url with space)` (unbracketed spaces — common in
        //     file-path URLs, not strict CommonMark), and reference `[text][id]`.
        //     The rendered text carries the resolved URL (Ctrl/Cmd+click) and any
        //     title. A reference whose definition is missing is still rendered,
        //     flagged with `data-missing` so Ctrl+click can scaffold it. ---
        if (name === "Link") {
          linkRanges.push({ from: node.from, to: node.to });
          const marks = node.node.getChildren("LinkMark");
          const textStart = node.from + 1;
          const textEnd = marks.length >= 2 ? marks[1].from : node.to;
          const cls = "cm-md-link";

          const renderLink = (
            to: number,
            attributes: Record<string, string>,
            extraClass = "",
          ) => {
            hide(node.from, textStart); // '['
            hide(textEnd, to); // '](url)' / '][id]'
            decos.push(
              Decoration.mark({ class: extraClass ? `${cls} ${extraClass}` : cls, attributes }).range(
                textStart,
                textEnd,
              ),
            );
          };

          const urlNode = node.node.getChild("URL");
          if (urlNode) {
            // Inline link. Use the parsed URL node (robust for `<…>` destinations
            // that can contain spaces) rather than a brittle whole-node regex.
            if (!isElementActive(state, node.from, node.to)) {
              const url = slice(urlNode.from, urlNode.to).replace(/^<([\s\S]*)>$/, "$1").trim();
              const attributes: Record<string, string> = { "data-href": url };
              const tm = /"([^"]*)"/.exec(slice(urlNode.to, node.to)); // optional title
              if (tm) attributes.title = tm[1];
              renderLink(node.to, attributes);
            }
            return;
          }

          // No URL child: a bare `[text]`. Lenient inline form — `[text]` directly
          // followed by a `(destination)` whose URL may contain spaces (the space
          // otherwise ends the destination in CommonMark). One bracket pair only.
          const lineTo = state.doc.lineAt(node.to).to;
          const lenient =
            marks.length === 2 ? /^\(\s*([^)]+?)\s*\)/.exec(slice(node.to, lineTo)) : null;
          if (lenient) {
            const fullTo = node.to + lenient[0].length;
            linkRanges.push({ from: node.from, to: fullTo });
            if (!isElementActive(state, node.from, fullTo)) {
              let dest = lenient[1];
              const attributes: Record<string, string> = {};
              const tm = /^([\s\S]*?)\s+"([^"]*)"$/.exec(dest); // optional trailing title
              if (tm) {
                dest = tm[1];
                attributes.title = tm[2];
              }
              attributes["data-href"] = dest.replace(/^<([\s\S]*)>$/, "$1").trim();
              renderLink(fullTo, attributes);
            }
            return;
          }

          // Reference link `[text][id]` / `[text][]`.
          if (!isElementActive(state, node.from, node.to)) {
            const ref = /^\[([^\]]*)\]\[([^\]]*)\]$/.exec(slice(node.from, node.to));
            if (ref) {
              const label = ref[2].trim() ? ref[2] : ref[1];
              const resolved = resolveLinkRef(state, label);
              if (resolved) {
                const attributes: Record<string, string> = { "data-href": resolved.url };
                if (resolved.title) attributes.title = resolved.title;
                renderLink(node.to, attributes);
              } else {
                renderLink(
                  node.to,
                  {
                    "data-missing": label,
                    title: "Missing link reference — Ctrl-click to add a definition",
                  },
                  "cm-md-link-missing",
                );
              }
            }
          }
          return;
        }

        // --- Images: render a preview; keep the source editable while active ---
        if (name === "Image") {
          const raw = slice(node.from, node.to);
          const m = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(raw);
          if (m) {
            const src = resolveImageSrc(m[2], baseDir);
            if (src) {
              const alt = m[1];
              const altFrom = node.from + 2;
              const altTo = altFrom + alt.length;
              const line = state.doc.lineAt(node.from);
              // Standalone = nothing but the image on its line.
              const standalone =
                slice(line.from, node.from).trim() === "" &&
                slice(node.to, line.to).trim() === "";
              if (isElementActive(state, node.from, node.to)) {
                // Editing: keep the raw markdown, show a preview below the line.
                decos.push(
                  Decoration.widget({
                    widget: new ImageWidget(src, alt, altFrom, altTo, "preview"),
                    side: 1,
                  }).range(line.to),
                );
              } else {
                if (standalone) {
                  // Collapse the line's text strut so no empty line height remains.
                  lineClass(line.from, "cm-md-image-line");
                }
                decos.push(
                  Decoration.replace({
                    widget: new ImageWidget(
                      src,
                      alt,
                      altFrom,
                      altTo,
                      standalone ? "block" : "inline",
                    ),
                  }).range(node.from, node.to),
                );
              }
            }
          }
          return;
        }

        // --- Horizontal rule ---
        if (name === "HorizontalRule") {
          if (!isElementActive(state, node.from, node.to)) {
            replaceWith(node.from, node.to, new HrWidget());
          }
          return;
        }

        // --- Task list checkbox (reveals only when the cursor is on the marker) ---
        if (name === "TaskMarker") {
          if (!isElementActive(state, node.from, node.to)) {
            const checked = /x/i.test(slice(node.from, node.to));
            replaceWith(node.from, node.to, new CheckboxWidget(checked, node.from, node.to));
          }
          return;
        }

        // --- Bullet list marker -> glyph (stays a glyph while editing item text) ---
        if (name === "ListMark") {
          // Task items render as `☐ text` — the checkbox stands in for the
          // marker, so hide the bullet entirely rather than doubling it up.
          const item = node.node.parent;
          if (item?.name === "ListItem" && item.getChild("Task")) {
            if (!(revealSource && isElementActive(state, node.from, node.to))) {
              const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              hide(node.from, after);
            }
            return;
          }
          const markText = slice(node.from, node.to);
          if ((markText === "-" || markText === "*" || markText === "+") &&
              !(revealSource && isElementActive(state, node.from, node.to))) {
            replaceWith(node.from, node.to, new BulletWidget());
          }
          return;
        }

        // --- Blockquote: style each line, hide the '>' marker ---
        if (name === "Blockquote") {
          let pos = node.from;
          while (pos <= node.to) {
            const line = state.doc.lineAt(pos);
            lineClass(line.from, "cm-md-quote");
            if (line.to + 1 > node.to) break;
            pos = line.to + 1;
          }
          return;
        }
        if (name === "QuoteMark") {
          // Line-level: showing '>' doesn't change the rendered quote styling.
          if (!(revealSource && isLineActive(state, node.from, node.to))) {
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }
      },
    });

    // Inline HTML (`<kbd>`, `<sup>`, `<span style>`, …): pair tags and render
    // the class-expressible ones in place. Runs before the tag scan so the tag
    // ranges it records suppress spurious `#…` pills inside HTML attributes.
    if (htmlOn) {
      const skipHtml = (pos: number) =>
        inCode(pos) || inTable(pos) || inLink(pos) || inMathBlock(pos) || inHtmlBlock(pos) || inHtmlRegion(pos);
      const res = collectInlineHtml(state, from, to, skipHtml);
      for (const r of res.tagRanges) htmlTagRanges.push(r);
      for (const op of res.ops) {
        if (op.kind === "hide") {
          hide(op.from, op.to);
        } else if (op.kind === "mark") {
          decos.push(
            Decoration.mark({ class: op.class, attributes: op.attributes }).range(op.from, op.to),
          );
        } else if (op.kind === "img") {
          const src = resolveImageSrc(op.src, baseDir);
          if (src) {
            replaceWith(op.from, op.to, new ImageWidget(src, op.alt, op.from, op.to, "inline"));
          }
          // Unresolvable src → leave the raw source visible.
        } else if (op.kind === "break") {
          // Keep a `<br>`'s line break while its raw source is revealed for editing.
          decos.push(Decoration.widget({ widget: new BreakWidget(), side: 1 }).range(op.pos));
        } else {
          // op.kind === "widget": render sanitized inline HTML, click-to-edit.
          replaceWith(op.from, op.to, new InlineHtmlWidget(sanitizeHtml(op.raw, baseDir), op.from));
        }
      }
    }

    // Bear-style tag pills: a viewport-only plain-text scan (the Lezer parser
    // doesn't model tags). Mark each `#tag` with a clickable pill class. Skipped
    // in inline-only mode (a `#` in a table cell is literal text).
    let ln = state.doc.lineAt(from).number;
    const lastLn = state.doc.lineAt(to).number;
    for (; !inlineMode && ln <= lastLn; ln++) {
      const line = state.doc.line(ln);
      if (inTable(line.from) || inCode(line.from) || inHtmlBlock(line.from) || inHtmlRegion(line.from)) continue;
      // Footnote definition line (`[^label]: …`): dim the `[^label]:` marker; the
      // content already rendered as normal inline Markdown in the tree walk above.
      // Checked before the link-def branch because `[^label]:` also matches
      // LINK_DEF_RE — and always consumes the line so it never mis-renders as one.
      const fdef = FOOTNOTE_DEF_RE.exec(line.text);
      if (fdef) {
        if (footnotesOn) {
          const markerFrom = line.from + fdef[1].length;
          const markerTo = markerFrom + 2 + fdef[2].length + 2; // `[^` + label + `]:`
          // The marker carries the label so Ctrl+click can jump to the first
          // body reference (the reverse of a reference's jump-to-definition).
          decos.push(
            Decoration.mark({
              class: "cm-md-footnote-def",
              attributes: {
                "data-label": fdef[2],
                title: "Ctrl-click to jump to the first reference",
              },
            }).range(markerFrom, markerTo),
          );
        }
        continue;
      }
      // Link reference definition line — styled, with placeholders for empty
      // URL/title. (Handled here, not in the tree walk, because an empty
      // `[id]:` isn't a LinkReference node.) Such lines carry no tags.
      const def = LINK_DEF_RE.exec(line.text);
      if (def && def[2].trim()) {
        renderLinkDef(line, def);
        continue;
      }
      for (const t of scanTagsInLine(line.text)) {
        if (inLink(line.from + t.start)) continue; // `#anchor` inside a link
        if (inHtml(line.from + t.start)) continue; // `#fff` inside an HTML attribute
        decos.push(
          Decoration.mark({
            class: "cm-md-tag",
            attributes: { "data-tag": t.path },
          }).range(line.from + t.start, line.from + t.end),
        );
      }
    }
  }

  // Box each multi-line block-HTML region the caret is editing, like a math-block
  // edit area: the `<tag>`/`</tag>` show on the first/last lines and an "HTML"
  // badge marks the top-right. Idle regions are rendered by htmlBlockField. Done
  // once (regions are whole-doc), after the viewport passes.
  if (htmlOn && !inlineMode) {
    for (const r of htmlRegions) {
      if (!isElementActive(state, r.from, r.to)) continue;
      const startLine = state.doc.lineAt(r.from);
      const endLine = state.doc.lineAt(r.to);
      for (let ln = startLine.number; ln <= endLine.number; ln++) {
        const l = state.doc.line(ln);
        let cls = "cm-md-code-block";
        if (ln === startLine.number) cls += " cm-md-code-top cm-md-html-edit-top";
        if (ln === endLine.number) cls += " cm-md-code-bottom";
        lineClass(l.from, cls);
      }
      // The top-right "HTML" label is drawn by a CSS ::after on cm-md-html-edit-top
      // (a pseudo-element, so it doesn't sit in the content flow and interfere with
      // selecting the opening-tag line).
    }
  }

  // `true` sorts the ranges (by from, then startSide) as RangeSet requires.
  return {
    decorations: Decoration.set(decos, true),
    atomic: Decoration.set(atomic, true),
  };
}
