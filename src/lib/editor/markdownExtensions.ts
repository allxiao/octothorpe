import { tags } from "@lezer/highlight";
import type { MarkdownConfig, InlineContext } from "@lezer/markdown";

/**
 * Highlight (`==text==`) inline syntax, modelled on `@lezer/markdown`'s built-in
 * Strikethrough (`~~…~~`) — a paired double-delimiter mark. Produces `Highlight`
 * nodes with `HighlightMark` children for each `==`.
 *
 * Subscript (`~x~`) and Superscript (`^x^`) come from `@lezer/markdown` directly
 * (Subscript/Superscript extensions) and don't need a custom parser.
 */

// CommonMark punctuation class (matches the internal one in @lezer/markdown),
// used to decide whether a `==` delimiter can open/close a run.
let Punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1‐-‧]/;
try {
  Punctuation = new RegExp("[\\p{S}|\\p{P}]", "u");
} catch {
  // Older engines without Unicode property escapes — keep the ASCII fallback.
}

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

export const Highlight: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": tags.special(tags.content) } },
    { name: "HighlightMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx: InlineContext, next: number, pos: number): number {
        // `==` delimiter (not `===`, which is a setext-ish run).
        if (next !== 61 /* '=' */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = Punctuation.test(before);
        const pAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: "Emphasis",
    },
  ],
};
