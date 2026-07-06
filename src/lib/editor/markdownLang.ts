import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { languages } from "@codemirror/language-data";
import { GFM, Subscript, Superscript } from "@lezer/markdown";
import { mathMarkdown } from "./math/mathMarkdown";
import { Highlight } from "./markdownExtensions";

/**
 * Markdown language support driven by the incremental, error-tolerant Lezer
 * parser. GFM extensions add tables, task lists, strikethrough, etc.
 * `mathMarkdown` adds `$…$` / `$$…$$` LaTeX nodes. `codeLanguages` lazily loads
 * grammars for fenced code blocks.
 *
 * The error-tolerance of this parser is what gives us best-effort rendering
 * for free: half-typed syntax degrades to plain text rather than erroring.
 */
export function markdownLang() {
  return markdown({
    codeLanguages: languages,
    extensions: [GFM, mathMarkdown, Subscript, Superscript, Highlight],
    // Disable lang-html's built-in `>` tag auto-close: our htmlComplete handler
    // owns tag completion (Markdown `</` closing, and the pretty 3-line block
    // form inside HTML code contexts), so the two must not both fire on `>`.
    htmlTagLanguage: html({ matchClosingTags: false, autoCloseTags: false }),
  });
}
