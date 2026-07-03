import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { mathMarkdown } from "./math/mathMarkdown";

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
    extensions: [GFM, mathMarkdown],
  });
}
