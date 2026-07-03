import katex from "katex";

/**
 * KaTeX render helper. Synchronous (decoration builds are synchronous) and
 * memoized so typing only pays for the one node whose LaTeX actually changed —
 * the viewport-scoped decoration builds re-run `renderMath` for every visible
 * math node on each keystroke, but repeated calls with the same input are cache
 * hits. A small FIFO cap keeps the map from growing without bound.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 500;

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** Render `latex` to an HTML string. Invalid input renders in an error color
 *  (`throwOnError: false`) rather than throwing; the catch is a last resort. */
export function renderMath(latex: string, displayMode: boolean): string {
  const key = (displayMode ? "d\0" : "i\0") + latex;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: "#e00",
      output: "html",
    });
  } catch {
    html = `<span class="cm-md-math-error">${escapeHtml(latex)}</span>`;
  }

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
  return html;
}
