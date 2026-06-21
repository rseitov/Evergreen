import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession, type Session } from "../src/lib/storage";

beforeEach(() => {
  const store: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
        remove: async (key: string) => {
          delete store[key];
        },
      },
    },
  };
});

const session: Session = { token: "t", baseUrl: "http://localhost:8077", orgId: "o1", projectId: null };

describe("session storage", () => {
  it("returns null when nothing saved", async () => {
    expect(await loadSession()).toBeNull();
  });

  it("round-trips a saved session", async () => {
    await saveSession(session);
    expect(await loadSession()).toEqual(session);
  });

  it("clears the session", async () => {
    await saveSession(session);
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
