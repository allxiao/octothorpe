import type {
  BlockParser,
  Element,
  InlineParser,
  Line,
  MarkdownConfig,
} from "@lezer/markdown";

// Character codes used by the scanners.
const DOLLAR = 36; // $
const BACKSLASH = 92; // \
const SPACE = 32;
const TAB = 9;

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/**
 * Inline math `$…$`. Deliberately conservative so `$` in prose (currency, "5$")
 * stays literal:
 *   - the opening `$` may not be followed by `$` (that's a block), whitespace or
 *     the end of the section;
 *   - the closing `$` may not be preceded by whitespace, nor followed by a digit
 *     (`$5`, `$3.50`);
 *   - `\$` is treated as an escaped literal, not a delimiter.
 * Unterminated runs return -1 and fall back to plain text.
 */
const InlineMath: InlineParser = {
  name: "InlineMath",
  parse(cx, next, pos) {
    if (next !== DOLLAR) return -1;
    const after = cx.char(pos + 1);
    if (after === DOLLAR) return -1; // `$$` → leave to the block parser
    if (after === -1 || after === SPACE || after === TAB) return -1; // `$ ` currency

    for (let i = pos + 1; i < cx.end; i++) {
      const ch = cx.char(i);
      if (ch === BACKSLASH) {
        i++; // skip the escaped character
        continue;
      }
      if (ch === DOLLAR) {
        if (i === pos + 1) return -1; // empty `$$`
        const prev = cx.char(i - 1);
        if (prev === SPACE || prev === TAB) continue; // ` $` isn't a valid close
        if (isDigit(cx.char(i + 1))) continue; // `$…$5` → currency, keep scanning
        const open = cx.elt("InlineMathMark", pos, pos + 1);
        const close = cx.elt("InlineMathMark", i, i + 1);
        return cx.addElement(cx.elt("InlineMath", pos, i + 1, [open, close]));
      }
    }
    return -1; // unterminated → plain text
  },
};

/** Content of a line beyond any composite-block markers/indent. */
function lineContent(line: Line): string {
  return line.text.slice(line.pos);
}

/**
 * Block math delimited by `$$` on its own line:
 *
 *     $$
 *     \LaTeX
 *     $$
 *
 * Emits a `BlockMath` node with a `BlockMathMark` per `$$` delimiter. An
 * unterminated block still consumes its lines but yields a single mark, so the
 * live-preview layer can tell "still typing" (< 2 marks) from a complete block
 * — mirroring how `FencedCode` is handled.
 */
const BlockMath: BlockParser = {
  name: "BlockMath",
  parse(cx, line) {
    if (line.next !== DOLLAR) return false;
    if (lineContent(line).trim() !== "$$") return false;

    const from = cx.lineStart + line.pos;
    const marks: Element[] = [cx.elt("BlockMathMark", from, from + 2)];
    let end = cx.lineStart + line.text.length;

    while (cx.nextLine()) {
      if (lineContent(line).trim() === "$$") {
        const closeFrom = cx.lineStart + line.pos;
        marks.push(cx.elt("BlockMathMark", closeFrom, closeFrom + 2));
        end = cx.lineStart + line.text.length;
        cx.nextLine();
        break;
      }
      end = cx.lineStart + line.text.length;
    }

    cx.addElement(cx.elt("BlockMath", from, end, marks));
    return true;
  },
  // Allow a `$$` line to interrupt an ongoing paragraph (no blank line needed).
  endLeaf(_cx, line) {
    return line.next === DOLLAR && lineContent(line).trim() === "$$";
  },
};

/**
 * Markdown parser extension adding LaTeX math nodes to the Lezer tree:
 * `InlineMath` (`$…$`) and `BlockMath` (`$$ … $$`). Fenced ```` ```math ````
 * blocks need no grammar work — they already parse as `FencedCode` with a
 * `math` info string.
 */
export const mathMarkdown: MarkdownConfig = {
  defineNodes: [
    "InlineMath",
    "InlineMathMark",
    { name: "BlockMath", block: true },
    "BlockMathMark",
  ],
  parseInline: [InlineMath],
  parseBlock: [BlockMath],
};
