import { describe, expect, it } from "vitest";
import { describeAction } from "../src/lib/actionText";

describe("describeAction", () => {
  it("describes a click with the element text", () => {
    expect(describeAction("click", { role: "button", text: "Сохранить", selector: "#s" }))
      .toBe("нажать «Сохранить»");
  });

  it("uses role when there is no text", () => {
    expect(describeAction("click", { role: "button", text: null, selector: "#s" }))
      .toBe("нажать button");
  });

  it("describes input WITHOUT the typed value (privacy)", () => {
    const out = describeAction("input", { role: "textbox", text: "Email", selector: "#e" });
    expect(out).toBe("заполнить поле «Email»");
  });
});
