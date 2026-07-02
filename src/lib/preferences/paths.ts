// Helpers to bridge the two accepted preference shapes: the nested on-disk /
// JSON-Schema form (`{ editor: { fontSize: 18 } }`) and the flat dot-path form
// used for programmatic access (`{ "editor.fontSize": 18 }`).

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Flatten a (possibly nested) object into dot-path keys. Keys that already
 * contain dots and hold a leaf value are preserved as-is, so a file written in
 * either the nested or the flat form normalizes to the same flat map.
 */
export function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

/** Rebuild a nested object from a flat dot-path map. */
export function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!isPlainObject(node[p])) node[p] = {};
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

/** Read a value from a nested object by dot-path, or `undefined` if absent. */
export function getAt(obj: Record<string, unknown>, path: string): unknown {
  let node: unknown = obj;
  for (const p of path.split(".")) {
    if (!isPlainObject(node)) return undefined;
    node = node[p];
  }
  return node;
}

/** Structural equality for preference values (primitives and simple JSON). */
export function valueEquals(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
