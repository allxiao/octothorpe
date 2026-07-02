// Runtime validation of preference values against the bundled JSON Schema.
// The schema is the same source of truth the GUI and codegen use, so a config
// that is out of range, the wrong type, or unknown is caught here and reported.

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { latestSchema } from "./schema";

const ajv = new Ajv2020({ allErrors: true, strictSchema: false, useDefaults: false });
// `x-ui` is our own annotation keyword; declare it so it is accepted, not enforced.
ajv.addKeyword({ keyword: "x-ui" });

const validateFn: ValidateFunction = ajv.compile(latestSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a full, nested preferences object (defaults merged with overrides). */
export function validatePreferences(nested: Record<string, unknown>): ValidationResult {
  const valid = validateFn(nested) === true;
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
  );
  return { valid, errors };
}
