import { StreamLanguage, type StreamParser } from "@codemirror/language";

/**
 * A small LaTeX/TeX highlighter for math source (`$…$`, `$$…$$`, and ```` ```math ````
 * blocks). It isn't a full grammar — it colors the two signals that make math
 * readable while editing: control sequences (`\frac`, `\alpha`, `\left(`) and
 * `%` comments. Grouping braces and sub/superscripts are left in the default text
 * color; the command color already carries the structure.
 *
 * Token strings are `@lezer/highlight` tag names, resolved by StreamLanguage and
 * colored by the editor's `defaultHighlightStyle` (`macroName`, `comment`).
 */
const texParser: StreamParser<unknown> = {
  name: "math-latex",
  token(stream) {
    if (stream.eatSpace()) return null;
    // Comment to end of line.
    if (stream.match(/^%.*/)) return "comment";
    // Control sequence: a multi-letter command (optionally starred, `\section*`),
    // or a single-character escape (`\{`, `\,`, `\\`).
    if (stream.match(/^\\[a-zA-Z@]+\*?/) || stream.match(/^\\[^A-Za-z]/)) return "macroName";
    // Ordinary character — advance one and leave it uncolored.
    stream.next();
    return null;
  },
};

export const mathLanguage = StreamLanguage.define(texParser);
