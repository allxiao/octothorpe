// Find Bear-style tag ranges within a single line, mirroring the Rust parser in
// src-tauri/src/core/tags.rs. Used to render `#tags` as pills in the editor.

function isTagChar(c: string): boolean {
  return /[\p{L}\p{N}_/-]/u.test(c);
}

export interface TagSpan {
  /** Start offset within the line (at the leading `#`). */
  start: number;
  /** End offset within the line (exclusive, past any closing `#`). */
  end: number;
  /** Normalized tag path, e.g. "recipes/italian". */
  path: string;
}

export function scanTagsInLine(line: string): TagSpan[] {
  const out: TagSpan[] = [];
  const n = line.length;
  let i = 0;

  while (i < n) {
    if (line[i] !== "#") {
      i++;
      continue;
    }
    // Boundary / escape check on the preceding character.
    if (i > 0) {
      const prev = line[i - 1];
      if (prev === "\\" || prev === "#" || isTagChar(prev)) {
        i++;
        continue;
      }
    }
    if (i + 1 >= n || line[i + 1] === "#" || /\s/.test(line[i + 1])) {
      i++;
      continue;
    }

    // Wrapped form: a closing '#' whose content contains spaces.
    let close = -1;
    for (let k = i + 1; k < n; k++) {
      if (line[k] === "#") {
        close = k;
        break;
      }
    }
    let name: string | null = null;
    let wrapped = false;
    let end = i + 1;
    let next = i + 1;

    if (close > 0) {
      const content = line.slice(i + 1, close);
      if (content.includes(" ") && !/^\s/.test(content) && !/\s$/.test(content)) {
        name = content;
        wrapped = true;
        end = close + 1;
        next = close + 1;
      }
    }
    if (name === null) {
      let j = i + 1;
      while (j < n && isTagChar(line[j])) j++;
      if (j > i + 1) {
        name = line.slice(i + 1, j);
        end = j < n && line[j] === "#" ? j + 1 : j;
        next = end;
      }
    }

    const path = name === null ? null : normalizeTag(name, wrapped);
    if (path) {
      out.push({ start: i, end, path });
      i = next;
    } else {
      i++;
    }
  }
  return out;
}

function normalizeTag(raw: string, wrapped: boolean): string | null {
  let s = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!s) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (!wrapped && /^\d+$/.test(s)) return null;
  s = s.split(/\s+/).join(" ");
  return s;
}
