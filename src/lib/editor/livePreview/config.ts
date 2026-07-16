import { Facet } from "@codemirror/state";

/**
 * Directory used to resolve relative image paths (the folder of the open
 * document). Reconfigured by the editor host when the current file changes.
 */
export const imageBaseDir = Facet.define<string, string>({
  combine: (values) => (values.length ? values[values.length - 1] : ""),
});

/** Callback invoked when a tag pill is clicked (e.g. to filter the sidebar). */
export const onTagClick = Facet.define<
  (tag: string) => void,
  ((tag: string) => void) | null
>({
  combine: (values) => (values.length ? values[values.length - 1] : null),
});

/**
 * Whether "simple block" markers (heading `#`, quote `>`, list bullets) reveal
 * their Markdown source on the focused line. When false they stay rendered even
 * while the cursor is on them. Driven by the `editor.revealSourceOnFocus`
 * preference; defaults to true (reveal on focus).
 */
export const revealSimpleSource = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/**
 * Whether inline `$…$` math renders (as KaTeX) or stays as literal source.
 * Driven by the `markdown.inlineMath` preference; defaults to true. Block math
 * (`$$…$$`, ```` ```math ````) always renders and is not gated by this.
 */
export const inlineMathRender = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/**
 * Whether inline `$…$` math renders in display style (`\displaystyle`: full-size
 * fractions, sums with limits, etc.) instead of the compact inline style. Driven
 * by the `markdown.inlineMathDisplay` preference; defaults to false.
 */
export const inlineMathDisplayStyle = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : false),
});

/**
 * Whether embedded HTML renders in the live preview (inline tags in place, block
 * HTML as click-to-edit widgets) or stays as literal source text. Driven by the
 * `markdown.renderHtml` preference; defaults to true.
 */
export const renderHtml = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/** Whether `~x~` renders as subscript (markdown.subscript); default true. */
export const renderSubscript = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/** Whether `^x^` renders as superscript (markdown.superscript); default true. */
export const renderSuperscript = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/** Whether `==x==` renders as highlighted text (markdown.highlight); default true. */
export const renderHighlight = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/** Whether `:name:` shortcodes render as emoji glyphs (markdown.emoji); default true. */
export const renderEmoji = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/**
 * Whether footnote references (`[^label]`) render as superscript pills (with a
 * hover preview of their definition) and definition lines (`[^label]: …`) get a
 * dimmed marker. Driven by the `markdown.footnotes` preference; default true.
 * When off, both stay literal source text.
 */
export const renderFootnotes = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

/**
 * When true, the live-preview decoration builder renders only *inline* Markdown
 * (bold, code, links, `$…$` math, emoji, sub/sup/highlight …) and treats every
 * block construct (headings, lists, quotes, rules, fenced code, block math) as
 * literal text. Set for the nested single-line editor used inside table cells, so
 * a leading `#`/`-`/`>` stays literal like GFM's inline-only cell semantics.
 * Defaults to false (the main document renders blocks normally).
 */
export const inlineOnly = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : false),
});
