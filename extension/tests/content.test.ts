import { describe, expect, it } from "vitest";
import { buildStepFromEvent } from "../src/content";

describe("buildStepFromEvent", () => {
  it("maps a click to a click step", () => {
    document.body.innerHTML = `<button id="s" role="button">Сохранить</button>`;
    const el = document.getElementById("s")!;
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: el });
    const step = buildStepFromEvent(event);
    expect(step).not.toBeNull();
    expect(step!.action_text).toBe("нажать «Сохранить»");
    expect(step!.dom_anchor!.selector).toBe("#s");
    expect(step!.screenshot_url).toBeNull();
  });

  it("maps a change to an input step without the typed value", () => {
    document.body.innerHTML = `<input id="e" role="textbox" />`;
    const el = document.getElementById("e") as HTMLInputElement;
    el.value = "secret@private.ru";
    const event = new Event("change");
    Object.defineProperty(event, "target", { value: el });
    const step = buildStepFromEvent(event)!;
    expect(step.action_text).toContain("заполнить поле");
    expect(step.action_text).not.toContain("secret@private.ru");
  });

  it("returns null when target is not an element", () => {
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: null });
    expect(buildStepFromEvent(event)).toBeNull();
  });
});
