import katex from "katex";
import { StateEffect } from "@codemirror/state";

/**
 * Math render helper. Synchronous (decoration builds are synchronous) and
 * memoized so typing only pays for the one node whose LaTeX actually changed —
 * the viewport-scoped decoration builds re-run `renderMath` for every visible
 * math node on each keystroke, but repeated calls with the same input are cache
 * hits. A small FIFO cap keeps the map from growing without bound.
 *
 * The engine is switchable at runtime (`setMathRenderer`): KaTeX (default, fast,
 * bundled) or MathJax (loaded lazily; matches Typora, spaces tall matrices from
 * real cell height). MathJax can't be reached by a static import here (that would
 * defeat its lazy chunk), so its render function registers itself via
 * `registerMathRenderer` once loaded; until then we transparently fall back to
 * KaTeX.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 500;

export type MathRenderer = "katex" | "mathjax";
let currentRenderer: MathRenderer = "katex";
/** Set by the lazily-loaded MathJax module once it's ready (see math/mathjax.ts). */
let mathjaxRenderFn: ((latex: string, displayMode: boolean) => string) | null = null;

/** A "re-render all math now" signal — dispatched when the engine preference
 *  changes and again once MathJax finishes loading. The math StateFields / live-
 *  preview plugin rebuild their decorations when a transaction carries it. */
export const mathRendererEffect = StateEffect.define<null>();

export function setMathRenderer(r: MathRenderer): void {
  if (r !== currentRenderer) {
    currentRenderer = r;
    generation++;
  }
}

/** The MathJax module calls this after init to hand us its synchronous SVG
 *  renderer (inverted dependency: keeps MathJax out of this module's static
 *  import graph so it stays in its own lazy chunk). */
export function registerMathRenderer(fn: (latex: string, displayMode: boolean) => string): void {
  mathjaxRenderFn = fn;
  generation++; // MathJax now available → previously KaTeX-fallback renders are stale
}

/** Bumped whenever the effective engine changes (switch, or MathJax finishing
 *  loading). Math widgets fold this into their `eq` so CodeMirror re-runs `toDOM`
 *  instead of keeping the previous engine's DOM for an unchanged formula. */
let generation = 0;
export function mathRenderGeneration(): number {
  return generation;
}

// Matrix/array/cases environments whose rows respect `\arraystretch`.
const ARRAY_ENV = /\\begin\{(?:[a-zA-Z]*matrix\*?|array|d?cases)\}/;
// KaTeX (like LaTeX) typesets these rows with almost no gap, so a block full of
// `\frac`s reads as the rows colliding. A modest default row stretch gives
// breathing room. Injected only when such an environment is present, and *before*
// the body so a user's own `\def\arraystretch{…}` still overrides it. KaTeX-only —
// MathJax sizes rows from real cell height and needs no such tweak.
const DEFAULT_ARRAY_STRETCH = 1.4;

function withRowSpacing(latex: string): string {
  return ARRAY_ENV.test(latex)
    ? `\\def\\arraystretch{${DEFAULT_ARRAY_STRETCH}}` + latex
    : latex;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** Render `latex` to an HTML string with the active engine. Invalid input renders
 *  in an error color rather than throwing; the catch is a last resort. */
export function renderMath(latex: string, displayMode: boolean): string {
  const useMathJax = currentRenderer === "mathjax" && mathjaxRenderFn !== null;
  // Key by the engine actually used, so KaTeX fallbacks (before MathJax loads)
  // never poison MathJax entries and vice-versa.
  const key = (useMathJax ? "m" : "k") + (displayMode ? "d\0" : "i\0") + latex;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    html = useMathJax
      ? mathjaxRenderFn!(latex, displayMode)
      : katex.renderToString(withRowSpacing(latex), {
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

/** Render inline `$…$` math. When `displaystyle` is set, render at full display
 *  size (`\displaystyle`: large fractions, sums with limits) while still flowing
 *  inline. Reuses `renderMath`'s cache via the prefixed source. */
export function renderInlineMath(latex: string, displaystyle: boolean): string {
  return renderMath(displaystyle ? "\\displaystyle " + latex : latex, false);
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

