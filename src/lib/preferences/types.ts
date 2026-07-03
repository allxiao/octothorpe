// Stable, hand-written types for the generated UI descriptor. The generated
// `generated/descriptor.ts` imports these; the modal renders against them.

export type ControlType = "toggle" | "select" | "radio" | "number" | "text";

export interface PrefOption {
  value: string;
  label: string;
  /** For radio options: a preference key whose control renders inline beside
   *  this option while it is selected (e.g. the "Customized" font-size input). */
  field?: string;
}

export interface PrefEntry {
  /** Dot-path key, e.g. "appearance.fontSize". */
  key: string;
  label: string;
  description?: string;
  control: ControlType;
  default: unknown;
  /** Choices for `select` / `radio` controls. */
  options?: PrefOption[];
  /** Bounds/step for `number` controls. */
  min?: number;
  max?: number;
  step?: number;
  /** Rendered only inline (referenced by a radio option's `field`), never as its own row. */
  inline?: boolean;
  /** Small unit suffix shown after a number input (e.g. "px"). */
  unit?: string;
  /** Show this row only while another preference equals a value (dependent field). */
  showWhen?: { key: string; equals: string };
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
