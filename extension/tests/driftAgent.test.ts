import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { runDriftScan, type DriftApi } from "../src/lib/driftAgent";
import type { ObservableStep } from "../src/lib/types";

function docWith(html: string): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

function step(selector: string, semantics = "нажать Сохранить"): ObservableStep {
  return {
    step_id: "s1",
    guide_id: "g1",
    url: "https://crm.acme.ru/d/1",
    fingerprint: { dom_anchor: { role: "button", text: "Сохранить", selector }, semantics, screenshot_url: null, url: "https://crm.acme.ru/d/1" },
  };
}

function fakeApi(steps: ObservableStep[]) {
  return {
    listObservable: vi.fn().mockResolvedValue(steps),
    observeDrift: vi.fn().mockResolvedValue({ drift: false, score: 0, classification: "none", event_id: null }),
  } satisfies DriftApi;
}

describe("runDriftScan", () => {
  it("re-captures a present element and reports a fresh fingerprint", async () => {
    const api = fakeApi([step("#save")]);
    const doc = docWith(`<button id="save" role="button">Готово</button>`);
    const n = await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    expect(n).toBe(1);
    expect(api.observeDrift).toHaveBeenCalledTimes(1);
    const body = api.observeDrift.mock.calls[0][2];
    expect(body.step_id).toBe("s1");
    expect(body.source).toBe("passive");
    expect(body.fresh_fingerprint.dom_anchor.text).toBe("Готово"); // live text, drifted from "Сохранить"
    expect(body.fresh_fingerprint.semantics).toBe("нажать Сохранить"); // stored semantics reused
    expect(body.fresh_fingerprint.url).toBe("https://crm.acme.ru/d/1");
  });

  it("reports a null anchor when the element is gone (max drift)", async () => {
    const api = fakeApi([step("#save")]);
    const doc = docWith(`<div>no button here</div>`);
    await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    const body = api.observeDrift.mock.calls[0][2];
    expect(body.fresh_fingerprint.dom_anchor).toBeNull();
  });

  it("does nothing when there are no observable steps", async () => {
    const api = fakeApi([]);
    const doc = docWith(`<button id="save">x</button>`);
    const n = await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    expect(n).toBe(0);
    expect(api.observeDrift).not.toHaveBeenCalled();
  });
});
