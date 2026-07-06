import { tags } from "@lezer/highlight";
import type { MarkdownConfig, InlineContext } from "@lezer/markdown";
import { emojiFor } from "./emoji";

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

/**
 * Emoji shortcodes (`:smile:`). A self-contained inline token — not a paired
 * delimiter like Highlight — so it parses in one shot: on `:`, scan a run of
 * shortcode characters to a closing `:` and emit an `Emoji` node only when the
 * name is a *known* shortcode (see `emojiFor`). Unknown `:foo:` stays plain
 * text, matching what autocomplete offers. The renderer replaces the node with
 * the glyph; the raw source reveals when the caret is inside.
 */
export const Emoji: MarkdownConfig = {
  defineNodes: [{ name: "Emoji", style: tags.content }],
  parseInline: [
    {
      name: "Emoji",
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== 58 /* ':' */) return -1;
        // Scan `[A-Za-z0-9_+-]+` up to the closing colon (capped so a lone `:`
        // in prose doesn't scan the whole line).
        let end = pos + 1;
        const max = Math.min(cx.end, pos + 60);
        for (; end < max; end++) {
          const c = cx.char(end);
          if (c === 58 /* ':' */) break;
          const ok =
            (c >= 97 && c <= 122) || // a-z
            (c >= 65 && c <= 90) || // A-Z
            (c >= 48 && c <= 57) || // 0-9
            c === 95 /* _ */ ||
            c === 43 /* + */ ||
            c === 45 /* - */;
          if (!ok) return -1;
        }
        if (end === pos + 1 || cx.char(end) !== 58 /* no name / no closing ':' */) return -1;
        if (!emojiFor(cx.slice(pos + 1, end))) return -1;
        return cx.addElement(cx.elt("Emoji", pos, end + 1));
      },
    },
  ],
};
