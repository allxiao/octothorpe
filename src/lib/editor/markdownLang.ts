import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { GFM, Subscript, Superscript, type MarkdownConfig } from "@lezer/markdown";
import { parseMixed } from "@lezer/common";
import { mathMarkdown } from "./math/mathMarkdown";
import { mathLanguage } from "./math/lang";
import { mermaidLanguage } from "./mermaid/lang";
import { Highlight, Emoji } from "./markdownExtensions";

/**
 * Overlay the LaTeX highlighter on the *content* of `$…$` / `$$ … $$` nodes (the
 * span between the delimiter marks). Fenced ```` ```math ```` / ```` ```mermaid ````
 * blocks are handled by the built-in fenced-code nesting via `codeLanguages`
 * below; these custom math nodes aren't fenced code, so they need their own
 * `wrap`. `wrap` configs compose, so this runs alongside the fenced-code wrapper.
 */
const mathNesting: MarkdownConfig = {
  wrap: parseMixed((node) => {
    const name = node.type.name;
    if (name !== "BlockMath" && name !== "InlineMath") return null;
    const markType = name === "BlockMath" ? "BlockMathMark" : "InlineMathMark";
    const marks = node.node.getChildren(markType);
    if (marks.length < 2) return null; // still being typed → no closing mark yet
    const from = marks[0].to;
    const to = marks[marks.length - 1].from;
    if (from >= to) return null; // empty body
    return { parser: mathLanguage.parser, overlay: [{ from, to }] };
  }),
};

/**
 * Markdown language support driven by the incremental, error-tolerant Lezer
 * parser. GFM extensions add tables, task lists, strikethrough, etc.
 * `mathMarkdown` adds `$…$` / `$$…$$` LaTeX nodes; `mathNesting` highlights their
 * bodies. `codeLanguages` lazily loads grammars for fenced code blocks, with
 * `math` and `mermaid` mapped to our own small grammars so those blocks are
 * highlighted while editing.
 *
 * The error-tolerance of this parser is what gives us best-effort rendering
 * for free: half-typed syntax degrades to plain text rather than erroring.
 */
export function markdownLang() {
  return markdown({
    codeLanguages: (info) => {
      if (info === "math") return mathLanguage;
      if (info === "mermaid") return mermaidLanguage;
      return LanguageDescription.matchLanguageName(languages, info, true);
    },
    extensions: [GFM, mathMarkdown, mathNesting, Subscript, Superscript, Highlight, Emoji],
    // Disable lang-html's built-in `>` tag auto-close: our htmlComplete handler
    // owns tag completion (Markdown `</` closing, and the pretty 3-line block
    // form inside HTML code contexts), so the two must not both fire on `>`.
    htmlTagLanguage: html({ matchClosingTags: false, autoCloseTags: false }),
  });
}
