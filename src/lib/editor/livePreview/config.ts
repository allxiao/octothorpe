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
