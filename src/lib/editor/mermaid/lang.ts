import { StreamLanguage, type StreamParser } from "@codemirror/language";

/**
 * A lightweight Mermaid highlighter for ```` ```mermaid ```` source. There is no
 * off-the-shelf CodeMirror grammar for Mermaid, so this stream parser colors the
 * structural signals — diagram-type/statement keywords, `%%` comments, quoted
 * labels, and the link/arrow operators — while leaving node identifiers in the
 * default text color so the diagram source doesn't turn into a wall of color.
 *
 * Token strings are `@lezer/highlight` tag names (`keyword`, `comment`, `string`,
 * `meta`), colored by the editor's `defaultHighlightStyle`.
 */
const KEYWORDS = new Set([
  // Diagram types.
  "graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram",
  "stateDiagram-v2", "erDiagram", "journey", "gantt", "pie", "gitGraph", "mindmap",
  "timeline", "quadrantChart", "requirementDiagram", "sankey", "sankey-beta",
  "xychart", "xychart-beta", "block", "block-beta", "packet", "packet-beta",
  "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment",
  // Statements / structure.
  "subgraph", "end", "direction", "participant", "actor", "note", "loop", "alt",
  "else", "opt", "par", "and", "rect", "activate", "deactivate", "class", "state",
  "click", "link", "callback", "call", "style", "classDef", "linkStyle", "title",
  "section", "accTitle", "accDescr", "over", "as", "autonumber", "destroy",
  "create", "box", "critical", "break", "dateFormat", "axisFormat", "excludes",
  "todayMarker", "branch", "checkout", "merge", "commit", "cherry-pick",
  // Flowchart orientations.
  "TB", "TD", "BT", "RL", "LR",
]);

const mermaidParser: StreamParser<unknown> = {
  name: "mermaid",
  token(stream) {
    if (stream.eatSpace()) return null;
    // Comment / directive: `%%` to end of line.
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    // Quoted label (allow an unterminated run so it colors while being typed).
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    // Links / arrows: `-->`, `---`, `-.->`, `==>`, `<-->`, `--x`, `--o`, `|label|`.
    if (stream.match(/^(?:<?[-.=]{2,}[->|]*|--[ox]|[|])/)) return "meta";
    // `:::class` shorthand and the `:` label separator.
    if (stream.match(/^:::|^:/)) return "meta";
    // A word: a known keyword, or a plain identifier (left uncolored).
    const word = stream.match(/^[A-Za-z_][\w-]*/) as RegExpMatchArray | null;
    if (word) return KEYWORDS.has(word[0]) ? "keyword" : null;
    // Brackets, numbers, other punctuation — advance one char, uncolored.
    stream.next();
    return null;
  },
};

export const mermaidLanguage = StreamLanguage.define(mermaidParser);
