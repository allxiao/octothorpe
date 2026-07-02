// The live preferences store (Svelte 5 runes). This is the globally-importable
// source of preference values: `preferences.get(path)` reads reactively, so any
// $derived / $effect / markup that reads a preference re-runs when it changes.
//
// Values are held as a flat map of *overrides* (only entries that differ from
// the schema default). The effective value of a path is its override or, absent
// one, the generated default. On disk we persist the nested override form plus a
// `version`, at ~/.octothorpe/preferences.json (see commands/preferences.rs).

import * as ipc from "../ipc/commands";
import { DEFAULTS, LATEST_VERSION } from "./generated/defaults";
import { migrate } from "./schema";
import { flatten, unflatten, valueEquals } from "./paths";
import { validatePreferences } from "./validate";

const DEFAULTS_FLAT = flatten(DEFAULTS as unknown as Record<string, unknown>);

export interface SetResult {
  ok: boolean;
  error?: string;
}

class PreferencesStore {
  /** Flat dot-path map of values that differ from their default. */
  #overrides = $state<Record<string, unknown>>({});
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #loaded = false;

  /** True once {@link load} has hydrated from disk. */
  get loaded(): boolean {
    return this.#loaded;
  }

  /** Read the effective value at a dot-path. Reactive — safe in $derived/$effect. */
  get<T = unknown>(path: string): T {
    const override = this.#overrides[path];
    return (override !== undefined ? override : DEFAULTS_FLAT[path]) as T;
  }

  /** Whether a path currently has a non-default value. */
  isSet(path: string): boolean {
    return this.#overrides[path] !== undefined;
  }

  /** Build the full nested effective object (defaults + overrides + version). */
  #effectiveNested(extra?: Record<string, unknown>): Record<string, unknown> {
    const flat = { ...DEFAULTS_FLAT, ...this.#snapshotOverrides(), ...extra };
    const nested = unflatten(flat);
    nested.version = LATEST_VERSION;
    return nested;
  }

  #snapshotOverrides(): Record<string, unknown> {
    return { ...this.#overrides };
  }

  /**
   * Set a preference. Validated against the schema before it commits; a value
   * equal to the default clears the override instead of storing it. Returns
   * `{ ok:false, error }` (and does not change anything) on validation failure.
   */
  set(path: string, value: unknown): SetResult {
    if (!(path in DEFAULTS_FLAT)) return { ok: false, error: `Unknown preference "${path}"` };
    const res = validatePreferences(this.#effectiveNested({ [path]: value }));
    if (!res.valid) return { ok: false, error: res.errors.join("; ") };

    if (valueEquals(value, DEFAULTS_FLAT[path])) {
      delete this.#overrides[path];
    } else {
      this.#overrides[path] = value;
    }
    this.#scheduleSave();
    return { ok: true };
  }

  /** Restore a path to its default (clears any override). */
  reset(path: string): void {
    if (this.#overrides[path] !== undefined) {
      delete this.#overrides[path];
      this.#scheduleSave();
    }
  }

  /** Restore every preference to its default. */
  resetAll(): void {
    if (Object.keys(this.#overrides).length) {
      this.#overrides = {};
      this.#scheduleSave();
    }
  }

  /**
   * A view bound to a subtree, e.g. `preferences.scope("editor")` exposes
   * `get("fontSize")` / `set("fontSize", v)`. Lets a module touch only its keys.
   */
  scope(prefix: string) {
    const full = (sub: string) => `${prefix}.${sub}`;
    return {
      get: <T = unknown>(sub: string): T => this.get<T>(full(sub)),
      set: (sub: string, value: unknown): SetResult => this.set(full(sub), value),
      reset: (sub: string): void => this.reset(full(sub)),
    };
  }

  /** Load and validate the on-disk config, hydrating overrides. Call once at startup. */
  async load(): Promise<void> {
    let data: Record<string, unknown> = {};
    try {
      const raw = await ipc.readPreferences();
      if (raw.trim()) data = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      console.error("[preferences] failed to read/parse config; using defaults", e);
      data = {};
    }

    const fromVersion = typeof data.version === "number" ? data.version : LATEST_VERSION;
    if (fromVersion !== LATEST_VERSION) data = migrate(data, fromVersion);

    // Normalize either shape to flat keys, then keep only valid, non-default ones.
    const flat = flatten(data);
    delete flat.version;

    const next: Record<string, unknown> = {};
    const invalid: string[] = [];
    for (const [key, value] of Object.entries(flat)) {
      if (!(key in DEFAULTS_FLAT)) {
        invalid.push(key);
        continue;
      }
      if (valueEquals(value, DEFAULTS_FLAT[key])) continue;
      const candidate = unflatten({ ...DEFAULTS_FLAT, [key]: value });
      candidate.version = LATEST_VERSION;
      if (validatePreferences(candidate).valid) next[key] = value;
      else invalid.push(key);
    }

    this.#overrides = next;
    this.#loaded = true;

    if (invalid.length) {
      const msg =
        `Some preferences in ~/.octothorpe/preferences.json were invalid and have been ` +
        `reset to their defaults:\n\n${invalid.join(", ")}`;
      console.warn("[preferences]", msg);
      try {
        globalThis.alert?.(msg);
      } catch {
        /* headless / no window */
      }
      this.#scheduleSave(); // persist the cleaned-up config
    }
  }

  #scheduleSave(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.save();
    }, 250);
  }

  /** Serialize overrides (nested) + version and write to disk. */
  async save(): Promise<void> {
    const overrides = this.#snapshotOverrides();
    const res = validatePreferences(this.#effectiveNested());
    if (!res.valid) {
      console.error("[preferences] refusing to save invalid config:", res.errors);
      return;
    }
    const nested = unflatten(overrides);
    nested.version = LATEST_VERSION;
    try {
      await ipc.writePreferences(JSON.stringify(nested, null, 2));
    } catch (e) {
      console.error("[preferences] failed to write config", e);
    }
  }
}

/** Global preferences instance. Import and use `preferences.get(...)` anywhere. */
export const preferences = new PreferencesStore();
