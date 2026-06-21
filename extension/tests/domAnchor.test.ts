import { describe, expect, it } from "vitest";
import { buildAnchor } from "../src/lib/domAnchor";

describe("buildAnchor", () => {
  it("uses explicit role and text", () => {
    document.body.innerHTML = `<button id="save" role="button">Сохранить</button>`;
    const el = document.getElementById("save")!;
    const a = buildAnchor(el);
    expect(a.role).toBe("button");
    expect(a.text).toBe("Сохранить");
    expect(a.selector).toBe("#save");
  });

  it("falls back to tag name when no role and builds an nth-of-type chain", () => {
    document.body.innerHTML = `<div><span>one</span><span>two</span></div>`;
    const el = document.querySelectorAll("span")[1] as Element;
    const a = buildAnchor(el);
    expect(a.role).toBe("span");
    expect(a.text).toBe("two");
    expect(a.selector).toContain("span:nth-of-type(2)");
  });

  it("returns null text for empty elements", () => {
    document.body.innerHTML = `<input id="f" />`;
    const a = buildAnchor(document.getElementById("f")!);
    expect(a.text).toBeNull();
  });
});
