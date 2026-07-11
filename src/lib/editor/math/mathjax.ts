import { registerMathRenderer } from "./render";

/**
 * MathJax renderer — the alternative to KaTeX, selectable via the
 * `markdown.mathRenderer` preference. Uses MathJax v3 with the **SVG** output jax
 * and the `liteAdaptor`, which converts a LaTeX string to a self-contained SVG
 * string synchronously (once set up). `fontCache: "local"` embeds the glyph paths
 * inside each container, so nothing is fetched at render time — no font files, no
 * external requests (matching the app's local-first goal).
 *
 * MathJax is heavy, so this module is imported lazily (`ensureMathJaxLoaded`) only
 * when the user actually selects MathJax; it then registers its synchronous
 * renderer with `render.ts` so the pure render layer can call it without ever
 * statically importing MathJax (which would defeat the lazy chunk).
 */

let ready = false;
let loadPromise: Promise<void> | null = null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

async function initMathJax(): Promise<void> {
  const [
    { mathjax },
    { TeX },
    { SVG },
    { liteAdaptor },
    { RegisterHTMLHandler },
    { AllPackages },
  ] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
    import("mathjax-full/js/input/tex/AllPackages.js"),
  ]);

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  const svg = new SVG({ fontCache: "local" });
  const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });

  // Inject MathJax's SVG layout stylesheet once, plus a rule zeroing the default
  // 1em display-math margin so blocks stay compact inside the widget (mirrors how
  // KaTeX's `.katex-display` margin is zeroed for `.cm-md-math-block`).
  if (!document.getElementById("mathjax-svg-styles")) {
    const styleEl = document.createElement("style");
    styleEl.id = "mathjax-svg-styles";
    styleEl.textContent =
      adaptor.textContent(svg.styleSheet(doc) as Parameters<typeof adaptor.textContent>[0]) +
      '\nmjx-container[display="true"]{margin:0}';
    document.head.appendChild(styleEl);
  }

  registerMathRenderer((latex, displayMode) => {
    try {
      const node = doc.convert(latex, { display: displayMode });
      return adaptor.outerHTML(node);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `<span class="cm-md-math-error">${escapeHtml(msg)}</span>`;
    }
  });
  ready = true;
}

/** Load + initialise MathJax once. Idempotent — repeated calls share one promise. */
export function ensureMathJaxLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = initMathJax();
  return loadPromise;
}

export function isMathJaxReady(): boolean {
  return ready;
}
