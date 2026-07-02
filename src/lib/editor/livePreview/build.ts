import { Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type Range } from "@codemirror/state";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isElementActive, isLineActive } from "./reveal";
import { imageBaseDir } from "./config";
import { scanTagsInLine } from "./tagScan";
import { ImageWidget, HrWidget, BulletWidget, CheckboxWidget, CodeLangWidget } from "./widgets";
import { tableRanges } from "./tableField";

/**
 * Resolve a Markdown image URL to something the webview can load. Remote and
 * data URLs pass through; relative/local paths are resolved against the open
 * document's directory and routed through Tauri's asset protocol. Returns null
 * when it can't be resolved (e.g. a local path outside a Tauri context).
 */
function resolveImageSrc(url: string, baseDir: string): string | null {
  if (/^(https?:|data:)/.test(url)) return url;
  try {
    if (/^file:/i.test(url)) return convertFileSrc(decodeURI(url.replace(/^file:\/*/i, "")));
    if (!baseDir) return null;
    const sep = baseDir.includes("\\") ? "\\" : "/";
    const joined = baseDir.replace(/[\\/]+$/, "") + sep + url.replace(/\//g, sep);
    return convertFileSrc(joined);
  } catch {
    return null;
  }
}

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
    w: ImageWidget | HrWidget | BulletWidget | CheckboxWidget,
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

  // Tables are rendered as editable block widgets (via a StateField); skip any
  // inline decoration inside them.
  const tables = tableRanges(state);
  const inTable = (pos: number) => tables.some((t) => pos >= t.from && pos <= t.to);

  // Fenced code blocks decorate their own lines; the plain-text tag scan below
  // must skip them so `#define` / `#000` inside code don't become tag pills.
  const codeRanges: { from: number; to: number }[] = [];
  const inCode = (pos: number) => codeRanges.some((r) => pos >= r.from && pos <= r.to);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (inTable(node.from)) return false;
        const name = node.name;

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
          // Don't descend: CodeText stays real text (natively highlighted).
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
          if (!isLineActive(state, node.from, node.to)) {
            // Hide the '#' run plus a single trailing space.
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }

        // --- Inline emphasis / code / strikethrough: hide marks when the
        //     cursor is outside the *element* (not merely off the line) ---
        if (name === "EmphasisMark" || name === "StrikethroughMark") {
          const el = node.node.parent ?? node;
          if (!isElementActive(state, el.from, el.to)) hide(node.from, node.to);
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

        // --- Links: show only the text, hide brackets + URL ---
        if (name === "Link") {
          if (!isElementActive(state, node.from, node.to)) {
            const raw = slice(node.from, node.to);
            const m = /^\[([^\]]*)\]\([^)]*\)$/.exec(raw);
            if (m) {
              const textStart = node.from + 1;
              const textEnd = textStart + m[1].length;
              hide(node.from, textStart); // '['
              hide(textEnd, node.to); // '](url)'
              mark(textStart, textEnd, "cm-md-link");
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
            if (!isElementActive(state, node.from, node.to)) {
              const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              hide(node.from, after);
            }
            return;
          }
          const markText = slice(node.from, node.to);
          if ((markText === "-" || markText === "*" || markText === "+") &&
              !isElementActive(state, node.from, node.to)) {
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
          if (!isLineActive(state, node.from, node.to)) {
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }
      },
    });

    // Bear-style tag pills: a viewport-only plain-text scan (the Lezer parser
    // doesn't model tags). Mark each `#tag` with a clickable pill class.
    let ln = state.doc.lineAt(from).number;
    const lastLn = state.doc.lineAt(to).number;
    for (; ln <= lastLn; ln++) {
      const line = state.doc.line(ln);
      if (inTable(line.from) || inCode(line.from)) continue;
      for (const t of scanTagsInLine(line.text)) {
        decos.push(
          Decoration.mark({
            class: "cm-md-tag",
            attributes: { "data-tag": t.path },
          }).range(line.from + t.start, line.from + t.end),
        );
      }
    }
  }

  // `true` sorts the ranges (by from, then startSide) as RangeSet requires.
  return {
    decorations: Decoration.set(decos, true),
    atomic: Decoration.set(atomic, true),
  };
}
