/**
 * KaTeX ships its own web fonts (`KaTeX_Main`, `KaTeX_Math`, `KaTeX_AMS`, the
 * `KaTeX_Size*` families, …). They are bundled locally by Vite from
 * `katex/dist/katex.min.css` — there is no CDN or external request — but the
 * browser only fetches each face the first time a glyph using it is rendered.
 * That is why the first `\mathbf{…}` (which needs `KaTeX_Main-Bold`) or the first
 * big `\sum` (a `KaTeX_Size*` face) briefly reflows.
 *
 * `preloadMathFonts` warms every KaTeX face from the local bundle once, just
 * after startup, so subsequent math renders are instant. It reads the faces
 * straight from the document's FontFaceSet (populated from the bundled
 * `@font-face` rules), so it needs no hard-coded family list or file paths and
 * keeps working through Vite's content-hashed font URLs.
 */
export function preloadMathFonts(): void {
  if (typeof document === "undefined" || !document.fonts) return;

  const warm = () => {
    const jobs: Promise<unknown>[] = [];
    document.fonts.forEach((face) => {
      if (face.family.startsWith("KaTeX") && face.status === "unloaded") {
        jobs.push(face.load().catch(() => {})); // ignore a face that fails to load
      }
    });
    return Promise.all(jobs);
  };

  // Defer past first paint so warming never competes with the initial render.
  // `fonts.ready` guarantees the bundled @font-face rules are registered first.
  const schedule =
    "requestIdleCallback" in window
      ? (cb: () => void) => requestIdleCallback(() => cb(), { timeout: 3000 })
      : (cb: () => void) => setTimeout(cb, 500);
  schedule(() => void document.fonts.ready.then(warm));
}
