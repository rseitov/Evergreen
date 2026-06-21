import { describe, expect, it } from "vitest";
import { Recorder } from "../src/lib/recorder";
import type { RawStep } from "../src/lib/types";

const step = (t: string): RawStep => ({ action_text: t, dom_anchor: null, screenshot_url: null });

describe("Recorder", () => {
  it("ignores steps added before start", () => {
    const r = new Recorder();
    r.add(step("a"));
    expect(r.count()).toBe(0);
  });

  it("collects steps while recording and stop returns a copy", () => {
    const r = new Recorder();
    r.start();
    r.add(step("a"));
    r.add(step("b"));
    expect(r.isRecording()).toBe(true);
    const result = r.stop();
    expect(result.map((s) => s.action_text)).toEqual(["a", "b"]);
    expect(r.isRecording()).toBe(false);
    result.push(step("c")); // mutating the returned array must not affect internal state
    expect(r.count()).toBe(2);
  });

  it("start resets previously collected steps", () => {
    const r = new Recorder();
    r.start();
    r.add(step("a"));
    r.start();
    expect(r.count()).toBe(0);
  });
});
