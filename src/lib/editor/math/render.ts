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

/**
 * Measured pixel height of display-mode KaTeX for `latex`, at the editor's font
 * size. Block math is drawn with `Decoration.replace({block:true})` widgets,
 * whose heights CodeMirror does NOT measure into its height map — it relies on
 * `WidgetType.estimatedHeight`. A wrong estimate desyncs the height map, which
 * drives `posAtCoords` and vertical cursor motion, so clicks land on the wrong
 * line and Up/Down jump. We measure the real render once (offscreen), cached by
 * font size + latex, so the estimate matches the DOM.
 */
const heightCache = new Map<string, number>();

export function measuredMathHeight(latex: string): number {
  if (typeof document === "undefined") return 22;
  const scroller = document.querySelector(".cm-scroller");
  const fontSize = scroller ? getComputedStyle(scroller).fontSize : "15px";
  const key = fontSize + "\0" + latex;
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;left:-9999px;top:0;white-space:nowrap;";
  probe.style.fontSize = fontSize;
  probe.innerHTML = renderMath(latex, true);
  const display = probe.firstElementChild as HTMLElement | null;
  if (display) display.style.margin = "0"; // match the zeroed .katex-display margin
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height || 22;
  document.body.removeChild(probe);

  if (heightCache.size >= MAX_CACHE) {
    const oldest = heightCache.keys().next().value;
    if (oldest !== undefined) heightCache.delete(oldest);
  }
  heightCache.set(key, height);
  return height;
}

