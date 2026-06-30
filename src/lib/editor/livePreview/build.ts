import { Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type Range } from "@codemirror/state";
import { isRangeActive } from "./reveal";
import { ImageWidget, HrWidget, BulletWidget, CheckboxWidget } from "./widgets";

export interface BuiltDecorations {
  /** All decorations: marker hiding, inline styling, line classes, widgets. */
  decorations: DecorationSet;
  /** Subset (replaced spans only) marked atomic so the cursor steps over them. */
  atomic: DecorationSet;
}

/**
 * Walk the Lezer syntax tree over the visible ranges only (for performance) and
 * produce live-preview decorations. Nodes whose line the cursor sits on are left
 * as raw source (Obsidian-style reveal); everything else is rendered.
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

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // --- Headings: size the line, hide the leading "# " markers ---
        if (/^(ATXHeading|SetextHeading)[1-6]$/.test(name)) {
          const level = Number(name.slice(-1));
          const line = state.doc.lineAt(node.from);
          lineClass(line.from, `cm-md-heading cm-md-h${level}`);
          return;
        }
        if (name === "HeaderMark") {
          if (!isRangeActive(state, node.from, node.to)) {
            // Hide the '#' run plus a single trailing space.
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }

        // --- Inline emphasis / code / strikethrough: hide the marks ---
        if (name === "EmphasisMark" || name === "CodeMark" || name === "StrikethroughMark") {
          if (!isRangeActive(state, node.from, node.to)) hide(node.from, node.to);
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
          if (!isRangeActive(state, node.from, node.to)) {
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

        // --- Images: replace the whole node with an <img> ---
        if (name === "Image") {
          if (!isRangeActive(state, node.from, node.to)) {
            const raw = slice(node.from, node.to);
            const m = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(raw);
            if (m && /^(https?:|data:)/.test(m[2])) {
              replaceWith(node.from, node.to, new ImageWidget(m[2], m[1]));
            }
          }
          return;
        }

        // --- Horizontal rule ---
        if (name === "HorizontalRule") {
          if (!isRangeActive(state, node.from, node.to)) {
            replaceWith(node.from, node.to, new HrWidget());
          }
          return;
        }

        // --- Task list checkbox ---
        if (name === "TaskMarker") {
          if (!isRangeActive(state, node.from, node.to)) {
            const checked = /x/i.test(slice(node.from, node.to));
            replaceWith(node.from, node.to, new CheckboxWidget(checked, node.from, node.to));
          }
          return;
        }

        // --- Bullet list marker -> glyph ---
        if (name === "ListMark") {
          const markText = slice(node.from, node.to);
          if ((markText === "-" || markText === "*" || markText === "+") &&
              !isRangeActive(state, node.from, node.to)) {
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
          if (!isRangeActive(state, node.from, node.to)) {
            const after = slice(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            hide(node.from, after);
          }
          return;
        }
      },
    });
  }

  // `true` sorts the ranges (by from, then startSide) as RangeSet requires.
  return {
    decorations: Decoration.set(decos, true),
    atomic: Decoration.set(atomic, true),
  };
}
