// Stable, hand-written types for the generated UI descriptor. The generated
// `generated/descriptor.ts` imports these; the modal renders against them.

export type ControlType = "toggle" | "select" | "number" | "text";

export interface PrefOption {
  value: string;
  label: string;
}

export interface PrefEntry {
  /** Dot-path key, e.g. "editor.fontSize". */
  key: string;
  label: string;
  description?: string;
  control: ControlType;
  default: unknown;
  /** Choices for `select` controls. */
  options?: PrefOption[];
  /** Bounds/step for `number` controls. */
  min?: number;
  max?: number;
  step?: number;
}

export interface PrefSection {
  label: string;
  entries: PrefEntry[];
}

export interface PrefCategory {
  id: string;
  label: string;
  sections: PrefSection[];
}

export type PrefDescriptor = PrefCategory[];
