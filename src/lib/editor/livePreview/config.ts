import { Facet } from "@codemirror/state";

/**
 * Directory used to resolve relative image paths (the folder of the open
 * document). Reconfigured by the editor host when the current file changes.
 */
export const imageBaseDir = Facet.define<string, string>({
  combine: (values) => (values.length ? values[values.length - 1] : ""),
});
