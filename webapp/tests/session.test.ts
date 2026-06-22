import { beforeEach, describe, expect, it } from "vitest";
import { clearToken, loadToken, saveToken } from "../src/lib/session";
import { clearOrgId, loadOrgId, saveOrgId } from "../src/lib/session";

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

describe("org session", () => {
  it("returns null when no org stored", () => {
    expect(loadOrgId()).toBeNull();
  });

  it("round-trips an org id", () => {
    saveOrgId("o1");
    expect(loadOrgId()).toBe("o1");
  });

  it("clears the org id", () => {
    saveOrgId("o1");
    clearOrgId();
    expect(loadOrgId()).toBeNull();
  });
});
