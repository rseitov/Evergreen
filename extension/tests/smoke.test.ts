import { describe, expect, it } from "vitest";
import type { RawStep } from "../src/lib/types";

describe("scaffolding", () => {
  it("runs vitest and imports shared types", () => {
    const step: RawStep = { action_text: "x", dom_anchor: null, screenshot_url: null };
    expect(step.screenshot_url).toBeNull();
  });
});
