// Schema registry. The JSON Schema files under `v<N>/schema.json` are the single
// source of truth for preferences: their shape, validation, metadata, and (via
// `x-ui` annotations) how the GUI renders them. Types, the UI descriptor, and the
// defaults are generated from these at build time (see scripts/gen-preferences.mjs).

import schemaV1 from "./v1/schema.json";

/** JSON Schema documents keyed by their preferences `version`. */
export const SCHEMAS: Record<number, object> = {
  1: schemaV1,
};

/** The newest schema version the app knows how to render and validate. */
export const LATEST_VERSION = 1;

/** The JSON Schema document for the latest version (used by Ajv at runtime). */
export const latestSchema = SCHEMAS[LATEST_VERSION];

/**
 * Upgrade a raw settings object from an older schema version to {@link LATEST_VERSION}.
 * Each step transforms the *nested* on-disk shape. Only v1 exists today, so this is a
 * no-op stamp; add a `case` per version as the schema evolves.
 */
export function migrate(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let v = fromVersion;
  const out = { ...data };
  // Example for the future:
  // if (v === 1) { /* transform out from v1 -> v2 */ v = 2; }
  void v;
  out.version = LATEST_VERSION;
  return out;
}
