// Inline SVG icons for the editor context menu, in the ActivityBar house style
// (24×24 viewBox, stroke = currentColor, no fill unless noted) so they inherit
// the menu's text color and theme automatically. Rendered via {@html}.

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  search: svg(`<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>`),

  cut: svg(
    `<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/>` +
      `<line x1="8" y1="7.5" x2="20" y2="16.5"/><line x1="8" y1="16.5" x2="20" y2="7.5"/>`,
  ),
  copy: svg(
    `<rect x="9" y="9" width="11" height="11" rx="2"/>` +
      `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  ),
  paste: svg(
    `<path d="M16 4h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>` +
      `<rect x="8" y="2" width="8" height="4" rx="1"/>`,
  ),
  delete: svg(
    `<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>` +
      `<path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>`,
  ),

  bold: svg(
    `<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>`,
  ),
  italic: svg(`<line x1="11" y1="5" x2="18" y2="5"/><line x1="6" y1="19" x2="13" y2="19"/><line x1="14" y1="5" x2="10" y2="19"/>`),
  code: svg(`<polyline points="9 7 4 12 9 17"/><polyline points="15 7 20 12 15 17"/>`),
  link: svg(
    `<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/>` +
      `<path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>`,
  ),

  quote: svg(
    `<path d="M6 7h4v5a3 3 0 0 1-3 3"/><path d="M14 7h4v5a3 3 0 0 1-3 3"/>`,
  ),
  orderedList: svg(
    `<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>` +
      `<path d="M4 5v3"/><path d="M3.5 5.5h1"/><path d="M3.5 16h1.5v1.2H3.5"/><path d="M3.5 17.2H5v1.3H3.5"/>`,
  ),
  unorderedList: svg(
    `<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>` +
      `<circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"/>` +
      `<circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none"/>` +
      `<circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none"/>`,
  ),
  taskList: svg(
    `<line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="18" x2="20" y2="18"/>` +
      `<rect x="3" y="9" width="6" height="6" rx="1.5"/><path d="M4.5 12l1.3 1.3 2.2-2.6"/>` +
      `<line x1="11" y1="12" x2="16" y2="12"/>`,
  ),

  indent: svg(`<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><path d="M4 9l3 3-3 3z" fill="currentColor" stroke="none"/>`),
  outdent: svg(`<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><path d="M7 9l-3 3 3 3z" fill="currentColor" stroke="none"/>`),
};

export type IconName = keyof typeof icons;
