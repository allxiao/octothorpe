import { EditorView } from "@codemirror/view";
import { syntaxTree, indentUnit } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { VOID_TAGS } from "./livePreview/inlineHtml";
import { htmlTagBlockRegions } from "./livePreview/htmlBlockField";

/**
 * Auto-completion of closing HTML tags, in two contexts:
 *
 *  - In Markdown prose, typing `</` completes the innermost unclosed tag —
 *    `<a>abc</` → `<a>abc</a>` with the caret after the element.
 *  - Inside an HTML code context (a ```` ```html ```` fenced block, or the boxed
 *    HTML-block edit region), typing the `>` that closes an opening tag inserts
 *    the matching close. Block tags expand to a pretty 3-line form with the caret
 *    on an indented body line; inline tags become `<span>|</span>`.
 *
 * Block tags also have the Enter-based 3-line completion in prose (autoHtmlBlock).
 */

/** Tags completed as a pretty 3-line block (`<tag>` / indent+caret / `</tag>`). */
const BLOCK_HTML_TAGS = new Set([
  "div", "section", "article", "aside", "header", "footer", "main", "nav",
  "figure", "figcaption", "blockquote", "form", "fieldset", "address", "hgroup",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup",
  "ul", "ol", "li", "dl", "dt", "dd", "menu",
  "details", "summary", "dialog",
  "video", "audio", "picture", "svg", "pre",
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
]);

/** Whether `pos` sits in an HTML code context (fenced ```html or a block region). */
function isHtmlCodeContext(state: EditorState, pos: number): boolean {
  for (const r of htmlTagBlockRegions(state)) if (pos >= r.from && pos <= r.to) return true;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === "FencedCode") {
      const info = n.getChild("CodeInfo");
      if (!info) return false;
      const lang = state.sliceDoc(info.from, info.to).trim().toLowerCase();
      return lang === "html" || lang === "htm" || lang === "xml" || lang === "svg";
    }
  }
  return false;
}

/**
 * The innermost unclosed tag name in the current paragraph before `ltPos` (the
 * position of the `<` of the closing tag being typed), or null. Scans only back
 * to the last blank line so a long document stays cheap.
 */
function unclosedOpenTag(state: EditorState, ltPos: number): string | null {
  const doc = state.doc;
  let start = 0;
  const curLine = doc.lineAt(ltPos).number;
  for (let n = curLine - 1; n >= 1; n--) {
    if (doc.line(n).text.trim() === "") {
      start = doc.line(n + 1).from;
      break;
    }
  }
  const text = doc.sliceString(start, ltPos);
  const re = /<(\/?)([a-zA-Z][\w-]*)(?:\s[^<>]*)?(\/?)>/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = m[2].toLowerCase();
    if (m[1] === "/") {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k] === tag) {
          stack.length = k;
          break;
        }
      }
    } else if (m[3] !== "/" && !VOID_TAGS.has(tag)) {
      stack.push(tag);
    }
  }
  return stack.length ? stack[stack.length - 1] : null;
}

export const htmlTagComplete = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || (text !== "/" && text !== ">")) return false;
  const { state } = view;
  if (state.selection.ranges.length > 1) return false;

  // Markdown prose: `</` completes the innermost unclosed tag.
  if (text === "/") {
    if (state.sliceDoc(from - 1, from) !== "<") return false;
    if (isHtmlCodeContext(state, from)) return false; // code context closes on `>`
    const tag = unclosedOpenTag(state, from - 1);
    if (!tag) return false;
    const insert = "/" + tag + ">";
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input.complete",
      scrollIntoView: true,
    });
    return true;
  }

  // HTML code context: `>` closing an opening tag inserts the matching close.
  if (!isHtmlCodeContext(state, from)) return false;
  const line = state.doc.lineAt(from);
  const m = /<([a-zA-Z][\w-]*)(?:\s[^<>]*)?$/.exec(state.sliceDoc(line.from, from));
  if (!m) return false; // not an opening tag (closing/self-closing/plain `>`)
  const tag = m[1].toLowerCase();
  if (VOID_TAGS.has(tag)) return false;

  if (BLOCK_HTML_TAGS.has(tag)) {
    const indent = /^\s*/.exec(line.text)![0];
    const body = indent + state.facet(indentUnit);
    const insert = ">\n" + body + "\n" + indent + "</" + tag + ">";
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 2 + body.length }, // after ">" + "\n" + body indent
      userEvent: "input.complete",
      scrollIntoView: true,
    });
    return true;
  }
  const insert = "></" + tag + ">";
  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + 1 }, // between the tags
    userEvent: "input.complete",
  });
  return true;
});
