import { describe, expect, it } from "vitest";
import { stepsToInputs } from "../src/lib/steps";
import type { StepOut } from "../src/lib/types";

describe("stepsToInputs", () => {
  it("maps view steps to editable inputs", () => {
    const steps: StepOut[] = [
      { id: "s1", order_index: 0, text: "Открыть", media_url: "u", fingerprint: { a: 1 } },
      { id: "s2", order_index: 1, text: "Сохранить", media_url: null, fingerprint: null },
    ];
    expect(stepsToInputs(steps)).toEqual([
      { text: "Открыть", media_url: "u", fingerprint: { a: 1 } },
      { text: "Сохранить", media_url: null, fingerprint: null },
    ]);
  });
});
