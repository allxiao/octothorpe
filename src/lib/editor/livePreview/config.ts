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
