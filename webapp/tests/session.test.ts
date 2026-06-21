import { beforeEach, describe, expect, it } from "vitest";
import { clearToken, loadToken, saveToken } from "../src/lib/session";

beforeEach(() => localStorage.clear());

describe("token session", () => {
  it("returns null when nothing stored", () => {
    expect(loadToken()).toBeNull();
  });

  it("round-trips a token", () => {
    saveToken("tok");
    expect(loadToken()).toBe("tok");
  });

  it("clears the token", () => {
    saveToken("tok");
    clearToken();
    expect(loadToken()).toBeNull();
  });
});
