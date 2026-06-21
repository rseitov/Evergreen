import { describe, expect, it, vi } from "vitest";
import { RecordingService } from "../src/background";
import type { Session } from "../src/lib/storage";
import type { RawStep } from "../src/lib/types";

const step = (t: string): RawStep => ({ action_text: t, dom_anchor: null, screenshot_url: null });
const session = (over: Partial<Session> = {}): Session => ({
  token: "tok",
  baseUrl: "http://localhost:8077",
  orgId: "o1",
  projectId: "p1",
  ...over,
});

describe("RecordingService", () => {
  it("collects steps and generates with them on stop", async () => {
    const api = { generate: vi.fn().mockResolvedValue({ id: "g1", title: "T", version_number: 1 }) };
    const svc = new RecordingService(api as never);
    svc.start();
    svc.addStep(step("a"));
    svc.addStep(step("b"));
    expect(svc.count()).toBe(2);
    const result = await svc.stopAndGenerate(session(), "возврат");
    expect(result.id).toBe("g1");
    expect(api.generate).toHaveBeenCalledWith("tok", "o1", "p1", {
      title_hint: "возврат",
      type: "digital",
      raw_steps: [step("a"), step("b")],
    });
  });

  it("throws when no project is selected", async () => {
    const api = { generate: vi.fn() };
    const svc = new RecordingService(api as never);
    svc.start();
    await expect(svc.stopAndGenerate(session({ projectId: null }), null)).rejects.toThrow(
      "project not selected",
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
});
