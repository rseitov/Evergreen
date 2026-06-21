import type { StepInput, StepOut } from "./types";

export function stepsToInputs(steps: StepOut[]): StepInput[] {
  return steps.map((s) => ({ text: s.text, media_url: s.media_url, fingerprint: s.fingerprint }));
}
